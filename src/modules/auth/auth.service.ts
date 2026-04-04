import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gender, OtpPurpose, Prisma, Role } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { ApiResponse } from '../../common/interfaces/api-response.interface';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { compareValue, hashValue } from '../../common/utils/password.util';
import { generateNumericOtp } from '../../common/utils/code.util';
import { RegisterDto } from './dto/register.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordRequestDto } from './dto/forgot-password-request.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<ApiResponse> {
    const email = dto.email?.toLowerCase();
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ phoneNumber: dto.phoneNumber }, ...(email ? [{ email }] : [])],
      },
    });

    if (existingUser) {
      throw new ConflictException({
        code: ERROR_CODES.CONFLICT,
        message: 'A user with this phone number or email already exists',
      });
    }

    const passwordHash = await hashValue(dto.password);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        phoneNumber: dto.phoneNumber,
        email,
        gender: dto.gender,
        passwordHash,
        referralCode: dto.referralCode ?? dto.referelCode,
        role: Role.UNASSIGNED,
        isSocial: false,
        isPhoneVerified: false,
      },
    });

    const otpResult = await this.createOtpForPhone({
      userId: user.id,
      phoneNumber: dto.phoneNumber,
      purpose: OtpPurpose.REGISTER,
    });

    return {
      success: true,
      message: 'Registration successful. Verify OTP to activate your account.',
      data: {
        userId: user.id,
        purpose: OtpPurpose.REGISTER,
        phoneNumber: user.phoneNumber,
        ...(otpResult.devOtp ? { otp: otpResult.devOtp } : {}),
      },
    };
  }

  async sendOtp(dto: SendOtpDto): Promise<ApiResponse> {
    const user = await this.prisma.user.findFirst({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (dto.purpose === OtpPurpose.REGISTER && !user) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'No account found for this phone number',
      });
    }

    if (dto.purpose === OtpPurpose.FORGOT_PASSWORD && !user) {
      return {
        success: false,
        message: 'No account found with this phone number',
      };
    }

    const otpResult = await this.createOtpForPhone({
      userId: user?.id,
      phoneNumber: dto.phoneNumber,
      purpose: dto.purpose,
    });

    return {
      success: true,
      message: 'OTP sent successfully',
      data: {
        purpose: dto.purpose,
        phoneNumber: dto.phoneNumber,
        ...(otpResult.devOtp ? { otp: otpResult.devOtp } : {}),
      },
    };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<ApiResponse> {
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        phoneNumber: dto.phoneNumber,
        purpose: dto.purpose,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException({
        code: ERROR_CODES.OTP_NOT_FOUND,
        message: 'No active OTP found for this request',
      });
    }

    if (otpRecord.expiresAt.getTime() <= Date.now()) {
      await this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { consumedAt: new Date() },
      });

      throw new BadRequestException({
        code: ERROR_CODES.OTP_EXPIRED,
        message: 'OTP has expired. Please request a new OTP.',
      });
    }

    if (otpRecord.attemptCount >= otpRecord.maxAttempts) {
      await this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { consumedAt: otpRecord.consumedAt ?? new Date() },
      });

      throw new BadRequestException({
        code: ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
        message: 'Maximum OTP attempts exceeded. Please request a new OTP.',
      });
    }

    const isOtpValid = await compareValue(dto.otp, otpRecord.codeHash);
    if (!isOtpValid) {
      const nextAttemptCount = otpRecord.attemptCount + 1;
      await this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: {
          attemptCount: nextAttemptCount,
          consumedAt:
            nextAttemptCount >= otpRecord.maxAttempts ? new Date() : null,
        },
      });

      throw new BadRequestException({
        code: ERROR_CODES.INVALID_OTP,
        message: 'Invalid OTP',
        details: {
          attemptsRemaining: Math.max(
            otpRecord.maxAttempts - nextAttemptCount,
            0,
          ),
        },
      });
    }

    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() },
    });

    if (dto.purpose === OtpPurpose.REGISTER) {
      await this.prisma.user.updateMany({
        where: {
          id: otpRecord.userId ?? undefined,
          phoneNumber: dto.phoneNumber,
        },
        data: { isPhoneVerified: true },
      });

      return {
        success: true,
        message: 'Phone number verified successfully',
      };
    }

    if (!otpRecord.userId) {
      throw new BadRequestException({
        code: ERROR_CODES.RESET_TOKEN_INVALID,
        message: 'Unable to generate password reset token',
      });
    }

    const resetToken = await this.jwtService.signAsync(
      {
        sub: otpRecord.userId,
        phoneNumber: dto.phoneNumber,
        purpose: 'FORGOT_PASSWORD_RESET',
      },
      {
        secret: this.configService.get<string>(
          'JWT_RESET_SECRET',
          'change-me-reset',
        ),
        expiresIn: this.configService.get<string>(
          'JWT_RESET_EXPIRES_IN',
          '10m',
        ) as never,
      },
    );

    return {
      success: true,
      message: 'OTP verified. You can now reset your password.',
      data: { resetToken },
    };
  }

  async login(dto: LoginDto): Promise<ApiResponse> {
    const normalizedIdentifier = dto.identifier.trim();
    const emailIdentifier = normalizedIdentifier.includes('@')
      ? normalizedIdentifier.toLowerCase()
      : null;

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(emailIdentifier ? [{ email: emailIdentifier }] : []),
          { phoneNumber: normalizedIdentifier },
        ],
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({
        code: ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    const isPasswordValid = await compareValue(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        code: ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    if (!user.isPhoneVerified && user.phoneNumber) {
      throw new UnauthorizedException({
        code: ERROR_CODES.PHONE_NOT_VERIFIED,
        message: 'Phone verification is required before login',
      });
    }

    const tokens = await this.issueTokens(user.id, user.role);

    return {
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          email: user.email,
          role: user.role,
          isSocial: user.isSocial,
        },
        tokens,
      },
    };
  }

  async forgotPasswordRequest(
    dto: ForgotPasswordRequestDto,
  ): Promise<ApiResponse> {
    return this.sendOtp({
      phoneNumber: dto.phoneNumber,
      purpose: OtpPurpose.FORGOT_PASSWORD,
    });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<ApiResponse> {
    let payload: { sub: string; phoneNumber: string; purpose: string };
    try {
      payload = await this.jwtService.verifyAsync(dto.resetToken, {
        secret: this.configService.get<string>(
          'JWT_RESET_SECRET',
          'change-me-reset',
        ),
      });
    } catch {
      throw new UnauthorizedException({
        code: ERROR_CODES.RESET_TOKEN_INVALID,
        message: 'Reset token is invalid or expired',
      });
    }

    if (
      payload.purpose !== 'FORGOT_PASSWORD_RESET' ||
      payload.phoneNumber !== dto.phoneNumber
    ) {
      throw new UnauthorizedException({
        code: ERROR_CODES.RESET_TOKEN_INVALID,
        message: 'Reset token is invalid for this phone number',
      });
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, phoneNumber: dto.phoneNumber },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: ERROR_CODES.RESET_TOKEN_INVALID,
        message: 'User not found for provided reset token',
      });
    }

    const newPasswordHash = await hashValue(dto.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
      },
    });

    return {
      success: true,
      message: 'Password reset successful',
    };
  }

  async googleLogin(dto: GoogleLoginDto): Promise<ApiResponse> {
    const googlePayload = await this.verifyGoogleIdToken(dto.idToken);
    const email = (googlePayload.email ?? dto.email)?.toLowerCase();
    const googleId = googlePayload.sub ?? dto.googleId;

    if (!email && !googleId) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Google payload is missing required identity fields',
      });
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(googleId ? [{ googleId }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
    });

    const userData: Prisma.UserUpdateInput = {
      isSocial: true,
      email,
      googleId,
      fullName: dto.fullName ?? googlePayload.name,
      phoneNumber: dto.phoneNumber,
    };

    const user = existingUser
      ? await this.prisma.user.update({
          where: { id: existingUser.id },
          data: userData,
        })
      : await this.prisma.user.create({
          data: {
            fullName: dto.fullName ?? googlePayload.name ?? 'Google User',
            phoneNumber: dto.phoneNumber,
            email,
            gender: dto.gender ?? Gender.OTHER,
            role: Role.UNASSIGNED,
            isSocial: true,
            isPhoneVerified: false,
            googleId,
          },
        });

    const tokens = await this.issueTokens(user.id, user.role);

    return {
      success: true,
      message: 'Google login successful',
      data: {
        user: {
          id: user.id,
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          email: user.email,
          role: user.role,
          isSocial: user.isSocial,
        },
        tokens,
      },
    };
  }

  async getOnboardingStatus(userId: string): Promise<ApiResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'User not found',
      });
    }

    if (user.role === Role.UNASSIGNED) {
      return {
        success: true,
        message: 'Onboarding status fetched',
        data: {
          role: user.role,
          status: 'needsMessChoice',
        },
      };
    }

    if (user.role === Role.MANAGER) {
      const messCount = await this.prisma.mess.count({
        where: { ownerUserId: user.id },
      });

      return {
        success: true,
        message: 'Onboarding status fetched',
        data: {
          role: user.role,
          status: messCount > 0 ? 'completed' : 'needsMessCreate',
        },
      };
    }

    const membershipCount = await this.prisma.messMember.count({
      where: { userId: user.id },
    });

    return {
      success: true,
      message: 'Onboarding status fetched',
      data: {
        role: user.role,
        status: membershipCount > 0 ? 'completed' : 'needsMessJoin',
      },
    };
  }

  private async createOtpForPhone(params: {
    userId?: string;
    phoneNumber: string;
    purpose: OtpPurpose;
  }): Promise<{ devOtp?: string }> {
    const otpLength = Number(this.configService.get('OTP_LENGTH', 4));
    const otpExpiryMinutes = Number(
      this.configService.get('OTP_EXPIRY_MINUTES', 10),
    );
    const otpMaxAttempts = Number(
      this.configService.get('OTP_MAX_ATTEMPTS', 3),
    );

    const otp = generateNumericOtp(otpLength);
    const codeHash = await hashValue(otp);
    const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

    await this.prisma.otpCode.updateMany({
      where: {
        phoneNumber: params.phoneNumber,
        purpose: params.purpose,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    await this.prisma.otpCode.create({
      data: {
        userId: params.userId,
        phoneNumber: params.phoneNumber,
        purpose: params.purpose,
        codeHash,
        expiresAt,
        maxAttempts: otpMaxAttempts,
      },
    });

    const showOtp =
      this.configService.get<string>('DEV_SHOW_OTP_IN_RESPONSE', 'false') ===
        'true' &&
      this.configService.get<string>('NODE_ENV', 'development') !==
        'production';

    return showOtp ? { devOtp: otp } : {};
  }

  private async issueTokens(
    userId: string,
    role: Role,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, role },
      {
        secret: this.configService.get<string>(
          'JWT_ACCESS_SECRET',
          'change-me-access',
        ),
        expiresIn: this.configService.get<string>(
          'JWT_ACCESS_EXPIRES_IN',
          '15m',
        ) as never,
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, role },
      {
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          'change-me-refresh',
        ),
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
          '7d',
        ) as never,
      },
    );

    const refreshTokenHash = await hashValue(refreshToken);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });

    return { accessToken, refreshToken };
  }

  private async verifyGoogleIdToken(idToken: string): Promise<{
    sub?: string;
    aud?: string;
    email?: string;
    name?: string;
  }> {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );

    if (!response.ok) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Invalid Google token',
      });
    }

    const payload = (await response.json()) as {
      sub?: string;
      aud?: string;
      email?: string;
      name?: string;
      error_description?: string;
    };

    if (payload.error_description) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: payload.error_description,
      });
    }

    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (googleClientId && payload.aud && payload.aud !== googleClientId) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Google token audience mismatch',
      });
    }

    return payload;
  }
}
