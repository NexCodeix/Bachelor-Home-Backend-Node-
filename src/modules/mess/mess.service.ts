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

  async createMess(user: AuthenticatedUser, dto: CreateMessDto): Promise<ApiResponse> {
    if (user.role !== Role.MANAGER) {
      throw new BadRequestException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only manager can create a mess',
      });
    }

    const manager = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { isPhoneVerified: true },
    });

    if (!manager?.isPhoneVerified) {
      throw new BadRequestException({
        code: ERROR_CODES.PHONE_NOT_VERIFIED,
        message: 'Phone number must be verified before creating a mess',
      });
    }

    const alreadyOwnsMess = await this.prisma.mess.findUnique({
      where: { ownerUserId: user.id },
      select: { id: true },
    });

    if (alreadyOwnsMess) {
      throw new ConflictException({
        code: ERROR_CODES.CONFLICT,
        message: 'Manager already owns a mess',
      });
    }

    const inviteCode = await this.generateUniqueInviteCode();

    const mess = await this.prisma.mess.create({
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

    await this.prisma.messMember.create({
      data: {
        messId: mess.id,
        userId: user.id,
        role: MessMembershipRole.OWNER,
      },
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

  async joinMess(user: AuthenticatedUser, dto: JoinMessDto): Promise<ApiResponse> {
    if (user.role !== Role.MEMBER) {
      throw new BadRequestException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only members can join a mess',
      });
    }

    const mess = await this.prisma.mess.findUnique({
      where: { inviteCode: dto.inviteCode },
      select: {
        id: true,
        name: true,
        capacity: true,
      },
    });

    if (!mess) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Invalid invite code',
      });
    }

    const existingMembership = await this.prisma.messMember.findUnique({
      where: {
        messId_userId: {
          messId: mess.id,
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

    const totalMembers = await this.prisma.messMember.count({
      where: { messId: mess.id },
    });

    if (totalMembers >= mess.capacity) {
      throw new ConflictException({
        code: ERROR_CODES.MESS_CAPACITY_FULL,
        message: 'Mess capacity is full',
      });
    }

    await this.prisma.messMember.create({
      data: {
        messId: mess.id,
        userId: user.id,
        role: MessMembershipRole.MEMBER,
      },
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

  private async generateUniqueInviteCode(): Promise<string> {
    for (let i = 0; i < 10; i += 1) {
      const inviteCode = generateInviteCode(8);
      const existing = await this.prisma.mess.findUnique({
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
