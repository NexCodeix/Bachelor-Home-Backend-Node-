import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { ApiResponse } from '../../common/interfaces/api-response.interface';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../database/prisma.service';
import { AdminUpdateUserDto, UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<ApiResponse> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      message: 'Users fetched successfully',
      data: users.map((user) => new UserEntity(user)),
    };
  }

  async findOne(id: string): Promise<ApiResponse> {
    const user = await this.findUserByIdOrThrow(id);

    return {
      success: true,
      message: 'User fetched successfully',
      data: new UserEntity(user),
    };
  }

  async getMyProfile(currentUser: AuthenticatedUser): Promise<ApiResponse> {
    const user = await this.findUserByIdOrThrow(currentUser.id);

    return {
      success: true,
      message: 'Profile fetched successfully',
      data: new UserEntity(user),
    };
  }

  async update(id: string, dto: AdminUpdateUserDto): Promise<ApiResponse> {
    const existingUser = await this.findUserByIdOrThrow(id);
    const data = await this.buildUserUpdateData(dto, existingUser);

    const user = await this.prisma.user.update({
      where: { id },
      data,
    });

    return {
      success: true,
      message: 'User updated successfully',
      data: new UserEntity(user),
    };
  }

  async updateMyProfile(
    currentUser: AuthenticatedUser,
    dto: UpdateUserDto,
    profileImage?: Express.Multer.File,
  ): Promise<ApiResponse> {
    const existingUser = await this.findUserByIdOrThrow(currentUser.id);
    const data = await this.buildUserUpdateData(
      dto,
      existingUser,
      profileImage,
    );

    const user = await this.prisma.user.update({
      where: { id: currentUser.id },
      data,
    });

    if (
      profileImage &&
      existingUser.profileImageUrl &&
      existingUser.profileImageUrl !== user.profileImageUrl
    ) {
      await this.deleteStoredProfileImage(existingUser.profileImageUrl);
    }

    return {
      success: true,
      message: 'Profile updated successfully',
      data: new UserEntity(user),
    };
  }

  async remove(id: string): Promise<ApiResponse> {
    const existingUser = await this.findUserByIdOrThrow(id);

    await this.prisma.user.delete({ where: { id } });

    if (existingUser.profileImageUrl) {
      await this.deleteStoredProfileImage(existingUser.profileImageUrl);
    }

    return {
      success: true,
      message: 'User deleted successfully',
    };
  }

  private async findUserByIdOrThrow(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'User not found',
      });
    }

    return user;
  }

  private async buildUserUpdateData(
    dto: Record<string, any>,
    existingUser: User,
    profileImage?: Express.Multer.File,
  ): Promise<Prisma.UserUpdateInput> {
    const email = dto.email?.toLowerCase();
    await this.ensureUniqueFields(existingUser.id, dto.phoneNumber, email);

    const data: Prisma.UserUpdateInput = {
      ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
      ...(dto.phoneNumber !== undefined
        ? { phoneNumber: dto.phoneNumber }
        : {}),
      ...(email !== undefined ? { email } : {}),
      ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
      ...('role' in dto && dto.role !== undefined ? { role: dto.role } : {}),
      ...('isActive' in dto && dto.isActive !== undefined
        ? { isActive: dto.isActive }
        : {}),
    };

    if (profileImage) {
      data.profileImageUrl = this.buildProfileImageUrl(profileImage.filename);
    }

    return data;
  }

  private async ensureUniqueFields(
    currentUserId: string,
    phoneNumber?: string,
    email?: string,
  ): Promise<void> {
    if (!phoneNumber && !email) {
      return;
    }

    const conflictingUser = await this.prisma.user.findFirst({
      where: {
        id: { not: currentUserId },
        OR: [
          ...(phoneNumber ? [{ phoneNumber }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
    });

    if (conflictingUser) {
      throw new ConflictException({
        code: ERROR_CODES.CONFLICT,
        message: 'A user with this phone number or email already exists',
      });
    }
  }

  private buildProfileImageUrl(filename: string): string {
    return `/uploads/profiles/${filename}`;
  }

  private async deleteStoredProfileImage(
    profileImageUrl: string,
  ): Promise<void> {
    const relativePath = profileImageUrl.replace(/^\/uploads\//, '');

    if (!relativePath || relativePath === profileImageUrl) {
      return;
    }

    try {
      await unlink(join(process.cwd(), 'uploads', relativePath));
    } catch {
      return;
    }
  }
}
