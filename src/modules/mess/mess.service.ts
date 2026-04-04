import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MessMembershipRole, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { ApiResponse } from '../../common/interfaces/api-response.interface';
import { generateInviteCode } from '../../common/utils/code.util';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateMessDto } from './dto/create-mess.dto';
import { JoinMessDto } from './dto/join-mess.dto';

@Injectable()
export class MessService {
  constructor(private readonly prisma: PrismaService) {}

  async createMess(
    user: AuthenticatedUser,
    dto: CreateMessDto,
  ): Promise<ApiResponse> {
    if (user.role === Role.MEMBER) {
      throw new BadRequestException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Members cannot create a mess',
      });
    }

    const mess = await this.prisma.$transaction(async (tx) => {
      const currentUser = await tx.user.findUnique({
        where: { id: user.id },
        select: {
          role: true,
          isPhoneVerified: true,
        },
      });

      if (!currentUser) {
        throw new NotFoundException({
          code: ERROR_CODES.NOT_FOUND,
          message: 'User not found',
        });
      }

      if (currentUser.role === Role.MEMBER) {
        throw new BadRequestException({
          code: ERROR_CODES.FORBIDDEN,
          message: 'Members cannot create a mess',
        });
      }

      if (!currentUser.isPhoneVerified) {
        throw new BadRequestException({
          code: ERROR_CODES.PHONE_NOT_VERIFIED,
          message: 'Phone number must be verified before creating a mess',
        });
      }

      const alreadyOwnsMess = await tx.mess.findUnique({
        where: { ownerUserId: user.id },
        select: { id: true },
      });

      if (alreadyOwnsMess) {
        throw new ConflictException({
          code: ERROR_CODES.CONFLICT,
          message: 'Manager already owns a mess',
        });
      }

      if (currentUser.role === Role.UNASSIGNED) {
        await tx.user.update({
          where: { id: user.id },
          data: { role: Role.MANAGER },
        });
      }

      const inviteCode = await this.generateUniqueInviteCode(tx);

      const createdMess = await tx.mess.create({
        data: {
          name: dto.name,
          ownerUserId: user.id,
          ownerPhoneNumber: dto.ownerPhoneNumber,
          district: dto.district,
          subDistrict: dto.subDistrict,
          thana: dto.thana,
          fullAddress: dto.fullAddress,
          capacity: dto.capacity,
          inviteCode,
        },
      });

      await tx.messMember.create({
        data: {
          messId: createdMess.id,
          userId: user.id,
          role: MessMembershipRole.OWNER,
        },
      });

      return createdMess;
    });

    return {
      success: true,
      message: 'Mess created successfully',
      data: {
        messId: mess.id,
        inviteCode: mess.inviteCode,
      },
    };
  }

  async joinMess(
    user: AuthenticatedUser,
    dto: JoinMessDto,
  ): Promise<ApiResponse> {
    if (user.role === Role.MANAGER) {
      throw new BadRequestException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Managers cannot join a mess',
      });
    }

    const mess = await this.prisma.$transaction(async (tx) => {
      const currentUser = await tx.user.findUnique({
        where: { id: user.id },
        select: {
          role: true,
          isPhoneVerified: true,
        },
      });

      if (!currentUser) {
        throw new NotFoundException({
          code: ERROR_CODES.NOT_FOUND,
          message: 'User not found',
        });
      }

      if (currentUser.role === Role.MANAGER) {
        throw new BadRequestException({
          code: ERROR_CODES.FORBIDDEN,
          message: 'Managers cannot join a mess',
        });
      }

      if (!currentUser.isPhoneVerified) {
        throw new BadRequestException({
          code: ERROR_CODES.PHONE_NOT_VERIFIED,
          message: 'Phone number must be verified before joining a mess',
        });
      }

      const targetMess = await tx.mess.findUnique({
        where: { inviteCode: dto.inviteCode },
        select: {
          id: true,
          name: true,
          capacity: true,
        },
      });

      if (!targetMess) {
        throw new NotFoundException({
          code: ERROR_CODES.NOT_FOUND,
          message: 'Invalid invite code',
        });
      }

      const existingMembership = await tx.messMember.findUnique({
        where: {
          messId_userId: {
            messId: targetMess.id,
            userId: user.id,
          },
        },
        select: { id: true },
      });

      if (existingMembership) {
        throw new ConflictException({
          code: ERROR_CODES.CONFLICT,
          message: 'You already joined this mess',
        });
      }

      const totalMembers = await tx.messMember.count({
        where: { messId: targetMess.id },
      });

      if (totalMembers >= targetMess.capacity) {
        throw new ConflictException({
          code: ERROR_CODES.MESS_CAPACITY_FULL,
          message: 'Mess capacity is full',
        });
      }

      if (currentUser.role === Role.UNASSIGNED) {
        await tx.user.update({
          where: { id: user.id },
          data: { role: Role.MEMBER },
        });
      }

      await tx.messMember.create({
        data: {
          messId: targetMess.id,
          userId: user.id,
          role: MessMembershipRole.MEMBER,
        },
      });

      return targetMess;
    });

    return {
      success: true,
      message: 'Joined mess successfully',
      data: {
        messId: mess.id,
        messName: mess.name,
      },
    };
  }

  private async generateUniqueInviteCode(
    tx: Pick<PrismaService, 'mess'>,
  ): Promise<string> {
    for (let i = 0; i < 10; i += 1) {
      const inviteCode = generateInviteCode(8);
      const existing = await tx.mess.findUnique({
        where: { inviteCode },
        select: { id: true },
      });

      if (!existing) {
        return inviteCode;
      }
    }

    throw new ConflictException({
      code: ERROR_CODES.CONFLICT,
      message: 'Unable to generate invite code. Please retry.',
    });
  }
}
