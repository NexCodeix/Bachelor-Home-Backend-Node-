import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MessJoinRequestStatus,
  MessMembershipRole,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { ApiResponse } from '../../common/interfaces/api-response.interface';
import { generateInviteCode } from '../../common/utils/code.util';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateMessDto } from './dto/create-mess.dto';
import { DecideJoinRequestDto } from './dto/decide-join-request.dto';
import { JoinMessDto } from './dto/join-mess.dto';
import { ToggleJoinDto } from './dto/toggle-join.dto';

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
          isJoinEnabled: true,
        },
      });

      if (!targetMess) {
        throw new NotFoundException({
          code: ERROR_CODES.NOT_FOUND,
          message: 'Invalid invite code',
        });
      }

      if (!targetMess.isJoinEnabled) {
        throw new ConflictException({
          code: ERROR_CODES.MESS_JOIN_DISABLED,
          message: 'Mess joining is currently turned off by the manager',
        });
      }

      const existingMembership = await tx.messMember.findUnique({
        where: {
          messId_userId: {
            messId: targetMess.id,
            userId: user.id,
          },
        },
        select: {
          id: true,
          requestStatus: true,
        },
      });

      if (existingMembership) {
        if (
          existingMembership.requestStatus === MessJoinRequestStatus.PENDING
        ) {
          throw new ConflictException({
            code: ERROR_CODES.JOIN_REQUEST_ALREADY_EXISTS,
            message: 'Your join request is already pending manager approval',
          });
        }

        if (
          existingMembership.requestStatus === MessJoinRequestStatus.APPROVED
        ) {
          throw new ConflictException({
            code: ERROR_CODES.CONFLICT,
            message: 'You already joined this mess',
          });
        }

        await tx.messMember.update({
          where: { id: existingMembership.id },
          data: {
            requestStatus: MessJoinRequestStatus.PENDING,
            respondedAt: null,
            joinedAt: new Date(),
          },
        });

        return targetMess;
      }

      const totalApprovedMembers = await tx.messMember.count({
        where: {
          messId: targetMess.id,
          requestStatus: MessJoinRequestStatus.APPROVED,
        },
      });

      if (totalApprovedMembers >= targetMess.capacity) {
        throw new ConflictException({
          code: ERROR_CODES.MESS_CAPACITY_FULL,
          message: 'Mess capacity is full',
        });
      }

      await tx.messMember.create({
        data: {
          messId: targetMess.id,
          userId: user.id,
          role: MessMembershipRole.MEMBER,
          requestStatus: MessJoinRequestStatus.PENDING,
        },
      });

      return targetMess;
    });

    return {
      success: true,
      message: 'Join request submitted successfully',
      data: {
        messId: mess.id,
        messName: mess.name,
        requestStatus: MessJoinRequestStatus.PENDING,
      },
    };
  }

  async updateJoinSettings(
    user: AuthenticatedUser,
    dto: ToggleJoinDto,
  ): Promise<ApiResponse> {
    const mess = await this.prisma.mess.findUnique({
      where: { ownerUserId: user.id },
      select: {
        id: true,
      },
    });

    if (!mess) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Mess not found for this manager',
      });
    }

    const updatedMess = await this.prisma.mess.update({
      where: {
        id: mess.id,
      },
      data: {
        isJoinEnabled: dto.isJoinEnabled,
      },
      select: {
        id: true,
        isJoinEnabled: true,
      },
    });

    return {
      success: true,
      message: updatedMess.isJoinEnabled
        ? 'Mess joining is now enabled'
        : 'Mess joining is now disabled',
      data: {
        messId: updatedMess.id,
        isJoinEnabled: updatedMess.isJoinEnabled,
      },
    };
  }

  async getMyJoinRequestStatus(
    user: AuthenticatedUser,
    messId: string,
  ): Promise<ApiResponse> {
    if (user.role === Role.MANAGER) {
      throw new BadRequestException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Managers do not have member join request status',
      });
    }

    const mess = await this.prisma.mess.findUnique({
      where: { id: messId },
      select: {
        id: true,
        name: true,
        isJoinEnabled: true,
      },
    });

    if (!mess) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Mess not found',
      });
    }

    const myRequest = await this.prisma.messMember.findUnique({
      where: {
        messId_userId: {
          messId,
          userId: user.id,
        },
      },
      select: {
        id: true,
        requestStatus: true,
        respondedAt: true,
        joinedAt: true,
      },
    });

    if (!myRequest) {
      return {
        success: true,
        message: 'No join request found for this mess',
        data: {
          messId: mess.id,
          messName: mess.name,
          isJoinEnabled: mess.isJoinEnabled,
          requestId: null,
          requestStatus: 'NONE',
          respondedAt: null,
          requestedAt: null,
        },
      };
    }

    return {
      success: true,
      message: 'Join request status fetched successfully',
      data: {
        messId: mess.id,
        messName: mess.name,
        isJoinEnabled: mess.isJoinEnabled,
        requestId: myRequest.id,
        requestStatus: myRequest.requestStatus,
        respondedAt: myRequest.respondedAt,
        requestedAt: myRequest.joinedAt,
      },
    };
  }

  async getPendingJoinRequests(
    user: AuthenticatedUser,
    messId: string,
  ): Promise<ApiResponse> {
    const mess = await this.prisma.mess.findUnique({
      where: { id: messId },
      select: {
        id: true,
        ownerUserId: true,
      },
    });

    if (!mess) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Mess not found',
      });
    }

    if (mess.ownerUserId !== user.id) {
      throw new ForbiddenException({
        code: ERROR_CODES.NOT_MESS_OWNER,
        message: 'Only the mess manager can review join requests',
      });
    }

    const requests = await this.prisma.messMember.findMany({
      where: {
        messId,
        requestStatus: MessJoinRequestStatus.PENDING,
      },
      select: {
        id: true,
        userId: true,
        joinedAt: true,
        requestStatus: true,
        user: {
          select: {
            fullName: true,
            phoneNumber: true,
            email: true,
          },
        },
      },
      orderBy: {
        joinedAt: 'asc',
      },
    });

    return {
      success: true,
      message: 'Pending join requests fetched successfully',
      data: {
        messId,
        requests,
      },
    };
  }

  async decideJoinRequest(
    user: AuthenticatedUser,
    requestId: string,
    dto: DecideJoinRequestDto,
  ): Promise<ApiResponse> {
    const result = await this.prisma.$transaction(async (tx) => {
      const joinRequest = await tx.messMember.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          messId: true,
          userId: true,
          requestStatus: true,
          mess: {
            select: {
              id: true,
              ownerUserId: true,
              capacity: true,
            },
          },
        },
      });

      if (!joinRequest) {
        throw new NotFoundException({
          code: ERROR_CODES.JOIN_REQUEST_NOT_FOUND,
          message: 'Join request not found',
        });
      }

      if (joinRequest.mess.ownerUserId !== user.id) {
        throw new ForbiddenException({
          code: ERROR_CODES.NOT_MESS_OWNER,
          message: 'Only the mess manager can decide this join request',
        });
      }

      if (joinRequest.requestStatus !== MessJoinRequestStatus.PENDING) {
        throw new ConflictException({
          code: ERROR_CODES.JOIN_REQUEST_ALREADY_PROCESSED,
          message: 'This join request has already been processed',
        });
      }

      if (dto.action === MessJoinRequestStatus.APPROVED) {
        const totalApprovedMembers = await tx.messMember.count({
          where: {
            messId: joinRequest.messId,
            requestStatus: MessJoinRequestStatus.APPROVED,
          },
        });

        if (totalApprovedMembers >= joinRequest.mess.capacity) {
          throw new ConflictException({
            code: ERROR_CODES.MESS_CAPACITY_FULL,
            message: 'Mess capacity is full',
          });
        }

        await tx.messMember.update({
          where: { id: joinRequest.id },
          data: {
            requestStatus: MessJoinRequestStatus.APPROVED,
            respondedAt: new Date(),
          },
        });

        const targetUser = await tx.user.findUnique({
          where: { id: joinRequest.userId },
          select: {
            role: true,
          },
        });

        if (targetUser?.role === Role.UNASSIGNED) {
          await tx.user.update({
            where: { id: joinRequest.userId },
            data: {
              role: Role.MEMBER,
            },
          });
        }

        return {
          requestStatus: MessJoinRequestStatus.APPROVED,
          message: 'Join request approved successfully',
          messId: joinRequest.messId,
          userId: joinRequest.userId,
        };
      }

      await tx.messMember.update({
        where: { id: joinRequest.id },
        data: {
          requestStatus: MessJoinRequestStatus.REJECTED,
          respondedAt: new Date(),
        },
      });

      return {
        requestStatus: MessJoinRequestStatus.REJECTED,
        message: 'Join request rejected successfully',
        messId: joinRequest.messId,
        userId: joinRequest.userId,
      };
    });

    return {
      success: true,
      message: result.message,
      data: {
        requestId,
        messId: result.messId,
        userId: result.userId,
        requestStatus: result.requestStatus,
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
