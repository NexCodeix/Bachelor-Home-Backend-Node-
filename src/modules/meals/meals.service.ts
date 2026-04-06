import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceStatus,
  MealRequestStatus,
  MealRequestType,
  MealType,
  MessJoinRequestStatus,
  MessMembershipRole,
  Role,
} from '@prisma/client';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { ApiResponse } from '../../common/interfaces/api-response.interface';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../database/prisma.service';
import { CreateMealRequestDto } from './dto/create-meal-request.dto';
import { DecideMealRequestDto } from './dto/decide-meal-request.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import {
  MemberActivityFilter,
  MemberActivityQueryDto,
} from './dto/member-activity-query.dto';
import {
  ManagerMealHistoryScope,
  MealHistoryQueryDto,
} from './dto/meal-history-query.dto';
import { MonthQueryDto } from './dto/month-query.dto';
import { SetWeeklyRoutineDto } from './dto/set-weekly-routine.dto';
import { UpdateMealRequestDto } from './dto/update-meal-request.dto';
import { UpsertMonthMenuDto } from './dto/upsert-month-menu.dto';

const MEAL_TYPES = [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

type ManagerContext = {
  mess: {
    id: string;
    name: string;
    ownerUserId: string;
  };
  ownerMembershipId: string;
};

type MemberContext = {
  membershipId: string;
  membershipRole: MessMembershipRole;
  messId: string;
  messName: string;
  userId: string;
};

@Injectable()
export class MealsService {
  constructor(private readonly prisma: PrismaService) {}

  async getManagerDashboard(
    user: AuthenticatedUser,
    query: MonthQueryDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);
    await this.ensureMonthSchedule(manager.mess.id, query.year, query.month);

    const statuses = await this.prisma.mealDayMemberStatus.findMany({
      where: {
        mealDay: {
          messId: manager.mess.id,
          year: query.year,
          month: query.month,
        },
      },
      include: {
        mealDay: {
          select: {
            date: true,
          },
        },
        messMember: {
          select: {
            userId: true,
          },
        },
      },
    });

    const requests = await this.prisma.mealRequest.findMany({
      where: {
        messId: manager.mess.id,
        mealDay: {
          year: query.year,
          month: query.month,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    const totalMessMeals = statuses.filter((item) => item.isEnabled).length;
    const ownMeals = statuses.filter(
      (item) => item.isEnabled && item.messMember.userId === user.id,
    ).length;
    const guestMeals = statuses.reduce((sum, item) => sum + item.guestCount, 0);

    return {
      success: true,
      message: 'Manager meal dashboard fetched successfully',
      data: {
        messId: manager.mess.id,
        messName: manager.mess.name,
        year: query.year,
        month: query.month,
        totalMessMeals,
        ownMeals,
        guestMeals,
        mealRequestCount: requests.length,
        pendingRequestCount: requests.filter(
          (item) => item.status === MealRequestStatus.PENDING,
        ).length,
      },
    };
  }

  async getManagerMonthMenu(
    user: AuthenticatedUser,
    query: MonthQueryDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);
    const items = await this.prisma.messMealMenu.findMany({
      where: {
        messId: manager.mess.id,
        year: query.year,
        month: query.month,
      },
      orderBy: {
        mealType: 'asc',
      },
    });

    return {
      success: true,
      message: 'Monthly meal menu fetched successfully',
      data: {
        messId: manager.mess.id,
        year: query.year,
        month: query.month,
        items: this.buildMenuPayload(items, manager.mess.id, query.year, query.month),
      },
    };
  }

  async upsertManagerMonthMenu(
    user: AuthenticatedUser,
    dto: UpsertMonthMenuDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);
    this.ensureUniqueMenuItems(dto.items);

    for (const item of dto.items) {
      await this.prisma.messMealMenu.upsert({
        where: {
          messId_year_month_mealType: {
            messId: manager.mess.id,
            year: dto.year,
            month: dto.month,
            mealType: item.mealType,
          },
        },
        create: {
          messId: manager.mess.id,
          year: dto.year,
          month: dto.month,
          mealType: item.mealType,
          description: item.description,
        },
        update: {
          description: item.description,
        },
      });
    }

    await this.ensureMonthSchedule(manager.mess.id, dto.year, dto.month);

    const items = await this.prisma.messMealMenu.findMany({
      where: {
        messId: manager.mess.id,
        year: dto.year,
        month: dto.month,
      },
    });

    return {
      success: true,
      message: 'Monthly meal menu saved successfully',
      data: {
        messId: manager.mess.id,
        year: dto.year,
        month: dto.month,
        items: this.buildMenuPayload(items, manager.mess.id, dto.year, dto.month),
      },
    };
  }

  async getManagerRoutine(user: AuthenticatedUser): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);
    const routines = await this.prisma.messMealRoutine.findMany({
      where: { messId: manager.mess.id },
    });

    return {
      success: true,
      message: 'Manager meal routine fetched successfully',
      data: {
        messId: manager.mess.id,
        items: this.buildRoutinePayload(routines),
      },
    };
  }

  async setManagerRoutine(
    user: AuthenticatedUser,
    dto: SetWeeklyRoutineDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);
    this.ensureUniqueRoutineItems(dto.items);

    for (const item of dto.items) {
      await this.prisma.messMealRoutine.upsert({
        where: {
          messId_weekday_mealType: {
            messId: manager.mess.id,
            weekday: item.weekday,
            mealType: item.mealType,
          },
        },
        create: {
          messId: manager.mess.id,
          weekday: item.weekday,
          mealType: item.mealType,
          isEnabled: item.isEnabled,
        },
        update: {
          isEnabled: item.isEnabled,
        },
      });
    }

    const routines = await this.prisma.messMealRoutine.findMany({
      where: { messId: manager.mess.id },
    });

    return {
      success: true,
      message: 'Manager meal routine saved successfully',
      data: {
        messId: manager.mess.id,
        items: this.buildRoutinePayload(routines),
      },
    };
  }

  async getPendingMealRequests(
    user: AuthenticatedUser,
    query: MonthQueryDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);
    const requests = await this.prisma.mealRequest.findMany({
      where: {
        messId: manager.mess.id,
        status: MealRequestStatus.PENDING,
        mealDay: {
          year: query.year,
          month: query.month,
        },
      },
      include: {
        mealDay: true,
        messMember: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                phoneNumber: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return {
      success: true,
      message: 'Pending meal requests fetched successfully',
      data: {
        messId: manager.mess.id,
        year: query.year,
        month: query.month,
        requests: requests.map((request) => this.serializeRequest(request)),
      },
    };
  }

  async decideMealRequest(
    user: AuthenticatedUser,
    requestId: string,
    dto: DecideMealRequestDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);

    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.mealRequest.findUnique({
        where: { id: requestId },
        include: {
          mealDay: true,
          messMember: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
            },
          },
        },
      });

      if (!request || request.messId !== manager.mess.id) {
        throw new NotFoundException({
          code: ERROR_CODES.MEAL_REQUEST_NOT_FOUND,
          message: 'Meal request not found',
        });
      }

      if (request.status !== MealRequestStatus.PENDING) {
        throw new ConflictException({
          code: ERROR_CODES.MEAL_REQUEST_ALREADY_PROCESSED,
          message: 'This meal request has already been processed',
        });
      }

      const updatedRequest = await tx.mealRequest.update({
        where: { id: request.id },
        data: {
          status: dto.action,
          managerNote: dto.managerNote,
          respondedAt: new Date(),
        },
        include: {
          mealDay: true,
          messMember: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  phoneNumber: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (dto.action === MealRequestStatus.APPROVED) {
        const statusRow = await tx.mealDayMemberStatus.findUnique({
          where: {
            mealDayId_messMemberId: {
              mealDayId: request.mealDayId,
              messMemberId: request.messMemberId,
            },
          },
        });

        if (!statusRow) {
          throw new NotFoundException({
            code: ERROR_CODES.MEAL_MEMBER_NOT_FOUND,
            message: 'Meal member schedule not found',
          });
        }

        if (request.requestType === MealRequestType.MEAL_OFF) {
          await tx.mealDayMemberStatus.update({
            where: { id: statusRow.id },
            data: {
              isEnabled: false,
              isOverridden: true,
            },
          });
        }

        if (request.requestType === MealRequestType.MEAL_ON) {
          await tx.mealDayMemberStatus.update({
            where: { id: statusRow.id },
            data: {
              isEnabled: true,
              isOverridden: true,
            },
          });
        }

        if (request.requestType === MealRequestType.GUEST_MEAL) {
          await tx.mealDayMemberStatus.update({
            where: { id: statusRow.id },
            data: {
              guestCount: request.guestCount,
              isOverridden: true,
            },
          });
        }
      }

      return updatedRequest;
    });

    return {
      success: true,
      message:
        dto.action === MealRequestStatus.APPROVED
          ? 'Meal request approved successfully'
          : 'Meal request rejected successfully',
      data: this.serializeRequest(result),
    };
  }

  async getManagerHistory(
    user: AuthenticatedUser,
    query: MealHistoryQueryDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);
    await this.ensureMonthSchedule(manager.mess.id, query.year, query.month);

    let where: Record<string, unknown> = {
      mealDay: {
        messId: manager.mess.id,
        year: query.year,
        month: query.month,
      },
    };

    const scope = query.scope ?? ManagerMealHistoryScope.ALL;

    if (scope === ManagerMealHistoryScope.OWN) {
      where = {
        ...where,
        messMember: { userId: user.id },
      };
    }

    if (scope === ManagerMealHistoryScope.MEMBER) {
      if (!query.memberId) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'memberId is required when scope is MEMBER',
        });
      }

      where = {
        ...where,
        messMember: { userId: query.memberId },
      };
    }

    const statuses = await this.prisma.mealDayMemberStatus.findMany({
      where: where as never,
      include: {
        mealDay: true,
        messMember: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                phoneNumber: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: [{ mealDay: { date: 'asc' } }, { mealDay: { mealType: 'asc' } }],
    });

    const filteredStatuses =
      scope === ManagerMealHistoryScope.GUEST
        ? statuses.filter((item) => item.guestCount > 0)
        : statuses;

    return {
      success: true,
      message: 'Manager meal history fetched successfully',
      data: {
        messId: manager.mess.id,
        scope,
        year: query.year,
        month: query.month,
        totalMeals: filteredStatuses.filter((item) => item.isEnabled).length,
        totalGuestMeals: filteredStatuses.reduce(
          (sum, item) => sum + item.guestCount,
          0,
        ),
        entries: filteredStatuses.map((item) => this.serializeMemberStatus(item)),
      },
    };
  }

  async getManagerMemberActivity(
    user: AuthenticatedUser,
    memberId: string,
    query: MonthQueryDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);
    const targetMember = await this.getMessMemberByUserIdOrThrow(
      manager.mess.id,
      memberId,
    );

    await this.ensureMonthSchedule(manager.mess.id, query.year, query.month);

    const requests = await this.prisma.mealRequest.findMany({
      where: {
        messId: manager.mess.id,
        messMemberId: targetMember.id,
      },
      include: {
        mealDay: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const monthlyRequests = requests.filter(
      (item) => item.mealDay.year === query.year && item.mealDay.month === query.month,
    );

    const monthlyBreakdown = this.buildMonthlyBreakdown(requests);

    return {
      success: true,
      message: 'Member meal activity fetched successfully',
      data: {
        member: {
          id: targetMember.user.id,
          fullName: targetMember.user.fullName,
          phoneNumber: targetMember.user.phoneNumber,
          email: targetMember.user.email,
        },
        year: query.year,
        month: query.month,
        mealChangeCount: monthlyRequests.filter(
          (item) =>
            item.requestType === MealRequestType.MEAL_ON ||
            item.requestType === MealRequestType.MEAL_OFF,
        ).length,
        mealRequestCount: monthlyRequests.length,
        guestMealCount: monthlyRequests
          .filter((item) => item.requestType === MealRequestType.GUEST_MEAL)
          .reduce((sum, item) => sum + item.guestCount, 0),
        monthlyBreakdown,
      },
    };
  }

  async getMemberSummary(
    user: AuthenticatedUser,
    query: MonthQueryDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    await this.ensureMonthSchedule(member.messId, query.year, query.month);

    const statuses = await this.prisma.mealDayMemberStatus.findMany({
      where: {
        messMemberId: member.membershipId,
        mealDay: {
          year: query.year,
          month: query.month,
        },
      },
      include: {
        mealDay: true,
      },
    });

    const requests = await this.prisma.mealRequest.findMany({
      where: {
        messMemberId: member.membershipId,
        mealDay: {
          year: query.year,
          month: query.month,
        },
      },
      select: {
        id: true,
      },
    });

    return {
      success: true,
      message: 'Member meal summary fetched successfully',
      data: {
        messId: member.messId,
        messName: member.messName,
        year: query.year,
        month: query.month,
        totalMeals: statuses.filter((item) => item.isEnabled).length,
        completedMeals: statuses.filter(
          (item) => item.attendanceStatus === AttendanceStatus.GOT_MEAL,
        ).length,
        totalRequests: requests.length,
        totalGuestMeals: statuses.reduce((sum, item) => sum + item.guestCount, 0),
      },
    };
  }

  async getMemberCalendar(
    user: AuthenticatedUser,
    query: MonthQueryDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    await this.ensureMonthSchedule(member.messId, query.year, query.month);

    const statuses = await this.prisma.mealDayMemberStatus.findMany({
      where: {
        messMemberId: member.membershipId,
        mealDay: {
          year: query.year,
          month: query.month,
        },
      },
      include: {
        mealDay: true,
      },
      orderBy: [{ mealDay: { date: 'asc' } }, { mealDay: { mealType: 'asc' } }],
    });

    const requests = await this.prisma.mealRequest.findMany({
      where: {
        messMemberId: member.membershipId,
        mealDay: {
          year: query.year,
          month: query.month,
        },
      },
      include: {
        mealDay: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return {
      success: true,
      message: 'Member meal calendar fetched successfully',
      data: {
        messId: member.messId,
        year: query.year,
        month: query.month,
        days: this.buildCalendarDays(statuses, requests),
      },
    };
  }

  async getMemberRoutine(user: AuthenticatedUser): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    const routines = await this.prisma.memberMealRoutine.findMany({
      where: { messMemberId: member.membershipId },
    });

    return {
      success: true,
      message: 'Member meal routine fetched successfully',
      data: {
        messId: member.messId,
        items: this.buildRoutinePayload(routines),
      },
    };
  }

  async setMemberRoutine(
    user: AuthenticatedUser,
    dto: SetWeeklyRoutineDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    this.ensureUniqueRoutineItems(dto.items);

    for (const item of dto.items) {
      await this.prisma.memberMealRoutine.upsert({
        where: {
          messMemberId_weekday_mealType: {
            messMemberId: member.membershipId,
            weekday: item.weekday,
            mealType: item.mealType,
          },
        },
        create: {
          messMemberId: member.membershipId,
          weekday: item.weekday,
          mealType: item.mealType,
          isEnabled: item.isEnabled,
        },
        update: {
          isEnabled: item.isEnabled,
        },
      });
    }

    const routines = await this.prisma.memberMealRoutine.findMany({
      where: { messMemberId: member.membershipId },
    });

    return {
      success: true,
      message: 'Member meal routine saved successfully',
      data: {
        messId: member.messId,
        items: this.buildRoutinePayload(routines),
      },
    };
  }

  async createMealRequest(
    user: AuthenticatedUser,
    dto: CreateMealRequestDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    const mealDay = await this.getMealDayForMemberOrThrow(member, dto.mealDayId);
    this.validateMealRequest(dto.requestType, dto.guestCount);

    const existingPendingRequest = await this.prisma.mealRequest.findFirst({
      where: {
        mealDayId: mealDay.id,
        messMemberId: member.membershipId,
        status: MealRequestStatus.PENDING,
      },
      select: {
        id: true,
      },
    });

    if (existingPendingRequest) {
      throw new ConflictException({
        code: ERROR_CODES.MEAL_REQUEST_ALREADY_EXISTS,
        message: 'A pending meal request already exists for this meal',
      });
    }

    const request = await this.prisma.mealRequest.create({
      data: {
        messId: member.messId,
        mealDayId: mealDay.id,
        messMemberId: member.membershipId,
        requestType: dto.requestType,
        guestCount: dto.requestType === MealRequestType.GUEST_MEAL ? dto.guestCount ?? 0 : 0,
        reason: dto.reason,
      },
      include: {
        mealDay: true,
        messMember: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                phoneNumber: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return {
      success: true,
      message: 'Meal request submitted successfully',
      data: this.serializeRequest(request),
    };
  }

  async updateMealRequest(
    user: AuthenticatedUser,
    requestId: string,
    dto: UpdateMealRequestDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    const request = await this.getPendingOwnedMealRequestOrThrow(member, requestId);

    if (dto.requestType) {
      this.validateMealRequest(dto.requestType, dto.guestCount ?? request.guestCount);
    }

    if (!dto.requestType && dto.guestCount !== undefined) {
      this.validateMealRequest(request.requestType, dto.guestCount);
    }

    let mealDayId = request.mealDayId;
    if (dto.mealDayId) {
      const mealDay = await this.getMealDayForMemberOrThrow(member, dto.mealDayId);
      mealDayId = mealDay.id;
    }

    const updatedRequest = await this.prisma.mealRequest.update({
      where: { id: requestId },
      data: {
        mealDayId,
        requestType: dto.requestType ?? request.requestType,
        guestCount:
          (dto.requestType ?? request.requestType) === MealRequestType.GUEST_MEAL
            ? dto.guestCount ?? request.guestCount
            : 0,
        reason: dto.reason ?? request.reason,
      },
      include: {
        mealDay: true,
        messMember: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                phoneNumber: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return {
      success: true,
      message: 'Meal request updated successfully',
      data: this.serializeRequest(updatedRequest),
    };
  }

  async cancelMealRequest(
    user: AuthenticatedUser,
    requestId: string,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    await this.getPendingOwnedMealRequestOrThrow(member, requestId);

    const updatedRequest = await this.prisma.mealRequest.update({
      where: { id: requestId },
      data: {
        status: MealRequestStatus.CANCELLED,
        cancelledAt: new Date(),
      },
      include: {
        mealDay: true,
        messMember: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                phoneNumber: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return {
      success: true,
      message: 'Meal request cancelled successfully',
      data: this.serializeRequest(updatedRequest),
    };
  }

  async markAttendance(
    user: AuthenticatedUser,
    mealDayId: string,
    dto: MarkAttendanceDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    const statusRow = await this.prisma.mealDayMemberStatus.findUnique({
      where: {
        mealDayId_messMemberId: {
          mealDayId,
          messMemberId: member.membershipId,
        },
      },
      include: {
        mealDay: true,
      },
    });

    if (!statusRow) {
      throw new NotFoundException({
        code: ERROR_CODES.MEAL_DAY_NOT_FOUND,
        message: 'Meal day not found for this member',
      });
    }

    if (!statusRow.isEnabled) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_ATTENDANCE_TRANSITION,
        message: 'Attendance cannot be marked for a turned off meal',
      });
    }

    const updatedStatus = await this.prisma.mealDayMemberStatus.update({
      where: { id: statusRow.id },
      data: {
        attendanceStatus: dto.status,
        attendanceMarkedAt: new Date(),
      },
      include: {
        mealDay: true,
        messMember: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                phoneNumber: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return {
      success: true,
      message: 'Attendance updated successfully',
      data: this.serializeMemberStatus(updatedStatus),
    };
  }

  async getMemberHistory(
    user: AuthenticatedUser,
    query: MonthQueryDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    await this.ensureMonthSchedule(member.messId, query.year, query.month);

    const statuses = await this.prisma.mealDayMemberStatus.findMany({
      where: {
        messMemberId: member.membershipId,
        mealDay: {
          year: query.year,
          month: query.month,
        },
      },
      include: {
        mealDay: true,
        messMember: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                phoneNumber: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: [{ mealDay: { date: 'asc' } }, { mealDay: { mealType: 'asc' } }],
    });

    return {
      success: true,
      message: 'Member meal history fetched successfully',
      data: {
        messId: member.messId,
        year: query.year,
        month: query.month,
        totalMeals: statuses.filter((item) => item.isEnabled).length,
        totalGuestMeals: statuses.reduce((sum, item) => sum + item.guestCount, 0),
        entries: statuses.map((item) => this.serializeMemberStatus(item)),
      },
    };
  }

  async getMemberActivity(
    user: AuthenticatedUser,
    query: MemberActivityQueryDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    const requests = await this.prisma.mealRequest.findMany({
      where: {
        messMemberId: member.membershipId,
        mealDay: {
          year: query.year,
          month: query.month,
        },
      },
      include: {
        mealDay: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const filteredRequests = this.filterActivityRequests(
      requests,
      query.filter ?? MemberActivityFilter.ALL,
    );

    return {
      success: true,
      message: 'Member meal activity fetched successfully',
      data: {
        messId: member.messId,
        year: query.year,
        month: query.month,
        mealChangeCount: requests.filter(
          (item) =>
            item.requestType === MealRequestType.MEAL_ON ||
            item.requestType === MealRequestType.MEAL_OFF,
        ).length,
        requestCount: requests.length,
        ongoingRequestCount: requests.filter(
          (item) => item.status === MealRequestStatus.PENDING,
        ).length,
        totalGuestMeals: requests
          .filter((item) => item.requestType === MealRequestType.GUEST_MEAL)
          .reduce((sum, item) => sum + item.guestCount, 0),
        entries: filteredRequests.map((item) => ({
          id: item.id,
          requestType: item.requestType,
          status: item.status,
          guestCount: item.guestCount,
          reason: item.reason,
          managerNote: item.managerNote,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          meal: {
            mealDayId: item.mealDay.id,
            date: item.mealDay.date,
            mealType: item.mealDay.mealType,
          },
        })),
      },
    };
  }

  async getMemberReport(
    user: AuthenticatedUser,
    query: MonthQueryDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    await this.ensureMonthSchedule(member.messId, query.year, query.month);

    const statuses = await this.prisma.mealDayMemberStatus.findMany({
      where: {
        messMemberId: member.membershipId,
        mealDay: {
          year: query.year,
          month: query.month,
        },
      },
      include: {
        mealDay: true,
      },
    });

    const requests = await this.prisma.mealRequest.findMany({
      where: {
        messMemberId: member.membershipId,
        mealDay: {
          year: query.year,
          month: query.month,
        },
      },
      include: {
        mealDay: true,
      },
    });

    const highestMealInOneDay = this.calculateHighestMealInOneDay(statuses);
    const totalDaySummary = this.calculateTotalDaySummary(statuses);

    return {
      success: true,
      message: 'Member meal report fetched successfully',
      data: {
        messId: member.messId,
        year: query.year,
        month: query.month,
        totalOwnMeal: statuses.filter((item) => item.isEnabled).length,
        totalGuestMeal: statuses.reduce((sum, item) => sum + item.guestCount, 0),
        highestMealInOneDay,
        mealSummaryOfTotalDay: totalDaySummary,
        mealTurnedOffBeforeDeadline: requests.filter(
          (item) =>
            item.requestType === MealRequestType.MEAL_OFF &&
            item.status === MealRequestStatus.APPROVED,
        ).length,
        lateRequestRejectedNumber: 0,
        lateRequestAcceptedNumber: 0,
        totalMealTakenNumber: statuses.filter(
          (item) => item.attendanceStatus === AttendanceStatus.GOT_MEAL,
        ).length,
      },
    };
  }

  private async getManagerContextOrThrow(
    user: AuthenticatedUser,
  ): Promise<ManagerContext> {
    const mess = await this.prisma.mess.findUnique({
      where: { ownerUserId: user.id },
      include: {
        members: {
          where: {
            userId: user.id,
            requestStatus: MessJoinRequestStatus.APPROVED,
          },
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    if (!mess || mess.members.length === 0) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Mess not found for this manager',
      });
    }

    return {
      mess: {
        id: mess.id,
        name: mess.name,
        ownerUserId: mess.ownerUserId,
      },
      ownerMembershipId: mess.members[0].id,
    };
  }

  private async getMemberContextOrThrow(
    user: AuthenticatedUser,
  ): Promise<MemberContext> {
    const membership = await this.prisma.messMember.findFirst({
      where: {
        userId: user.id,
        requestStatus: MessJoinRequestStatus.APPROVED,
      },
      include: {
        mess: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        joinedAt: 'desc',
      },
    });

    if (!membership) {
      throw new ForbiddenException({
        code: ERROR_CODES.MESS_MEMBERSHIP_REQUIRED,
        message: 'You must be an approved mess member to access meals',
      });
    }

    return {
      membershipId: membership.id,
      membershipRole: membership.role,
      messId: membership.messId,
      messName: membership.mess.name,
      userId: user.id,
    };
  }

  private async getMessMemberByUserIdOrThrow(messId: string, userId: string) {
    const member = await this.prisma.messMember.findFirst({
      where: {
        messId,
        userId,
        requestStatus: MessJoinRequestStatus.APPROVED,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            email: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException({
        code: ERROR_CODES.MEAL_MEMBER_NOT_FOUND,
        message: 'Member not found in this mess',
      });
    }

    return member;
  }

  private async getMealDayForMemberOrThrow(
    member: MemberContext,
    mealDayId: string,
  ) {
    const mealDay = await this.prisma.mealDay.findUnique({
      where: { id: mealDayId },
      select: {
        id: true,
        messId: true,
        date: true,
        mealType: true,
      },
    });

    if (!mealDay || mealDay.messId !== member.messId) {
      throw new NotFoundException({
        code: ERROR_CODES.MEAL_DAY_NOT_FOUND,
        message: 'Meal day not found',
      });
    }

    return mealDay;
  }

  private async getPendingOwnedMealRequestOrThrow(
    member: MemberContext,
    requestId: string,
  ) {
    const request = await this.prisma.mealRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.messMemberId !== member.membershipId) {
      throw new NotFoundException({
        code: ERROR_CODES.MEAL_REQUEST_NOT_FOUND,
        message: 'Meal request not found',
      });
    }

    if (request.status !== MealRequestStatus.PENDING) {
      throw new ConflictException({
        code: ERROR_CODES.MEAL_REQUEST_ALREADY_PROCESSED,
        message: 'Only pending meal requests can be updated or cancelled',
      });
    }

    return request;
  }

  private async ensureMonthSchedule(
    messId: string,
    year: number,
    month: number,
  ): Promise<void> {
    const [menus, routines, memberships, memberRoutines, existingMealDays] =
      await Promise.all([
        this.prisma.messMealMenu.findMany({
          where: { messId, year, month },
        }),
        this.prisma.messMealRoutine.findMany({
          where: { messId },
        }),
        this.prisma.messMember.findMany({
          where: {
            messId,
            requestStatus: MessJoinRequestStatus.APPROVED,
          },
          select: {
            id: true,
          },
        }),
        this.prisma.memberMealRoutine.findMany({
          where: {
            messMember: {
              messId,
              requestStatus: MessJoinRequestStatus.APPROVED,
            },
          },
        }),
        this.prisma.mealDay.findMany({
          where: {
            messId,
            year,
            month,
          },
          include: {
            memberStatuses: true,
          },
        }),
      ]);

    const menuMap = new Map(
      menus.map((item) => [item.mealType, item.description]),
    );
    const messRoutineMap = new Map(
      routines.map((item) => [this.buildRoutineKey(item.weekday, item.mealType), item.isEnabled]),
    );
    const memberRoutineMap = new Map(
      memberRoutines.map((item) => [
        this.buildMemberRoutineKey(item.messMemberId, item.weekday, item.mealType),
        item.isEnabled,
      ]),
    );
    const mealDayMap = new Map(
      existingMealDays.map((item) => [
        this.buildMealDayKeyFromDate(item.date, item.mealType),
        item,
      ]),
    );

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    for (let day = 1; day <= daysInMonth; day += 1) {
      const currentDate = new Date(Date.UTC(year, month - 1, day));
      const weekday = currentDate.getUTCDay();

      for (const mealType of MEAL_TYPES) {
        const baseEnabled = messRoutineMap.get(
          this.buildRoutineKey(weekday, mealType),
        ) ?? true;

        const existingMealDay = mealDayMap.get(
          this.buildMealDayKeyFromDate(currentDate, mealType),
        );

        let mealDay = existingMealDay;
        const menuDescription = menuMap.get(mealType) ?? null;

        if (!mealDay) {
          mealDay = await this.prisma.mealDay.create({
            data: {
              messId,
              date: currentDate,
              year,
              month,
              day,
              weekday,
              mealType,
              menuDescription,
              isEnabled: baseEnabled,
            },
            include: {
              memberStatuses: true,
            },
          });

          mealDayMap.set(this.buildMealDayKeyFromDate(currentDate, mealType), mealDay);
        } else {
          const needsUpdate =
            mealDay.isEnabled !== baseEnabled ||
            mealDay.menuDescription !== menuDescription ||
            mealDay.weekday !== weekday ||
            mealDay.day !== day;

          if (needsUpdate) {
            mealDay = await this.prisma.mealDay.update({
              where: { id: mealDay.id },
              data: {
                weekday,
                day,
                menuDescription,
                isEnabled: baseEnabled,
              },
              include: {
                memberStatuses: true,
              },
            });

            mealDayMap.set(this.buildMealDayKeyFromDate(currentDate, mealType), mealDay);
          }
        }

        const existingStatusMap = new Map(
          mealDay.memberStatuses.map((item) => [item.messMemberId, item]),
        );

        for (const membership of memberships) {
          const memberEnabled = memberRoutineMap.get(
            this.buildMemberRoutineKey(membership.id, weekday, mealType),
          ) ?? true;
          const finalEnabled = baseEnabled && memberEnabled;
          const existingStatus = existingStatusMap.get(membership.id);

          if (!existingStatus) {
            await this.prisma.mealDayMemberStatus.create({
              data: {
                mealDayId: mealDay.id,
                messMemberId: membership.id,
                isEnabled: finalEnabled,
              },
            });
            continue;
          }

          if (!existingStatus.isOverridden && existingStatus.isEnabled !== finalEnabled) {
            await this.prisma.mealDayMemberStatus.update({
              where: { id: existingStatus.id },
              data: {
                isEnabled: finalEnabled,
              },
            });
          }
        }
      }
    }
  }

  private buildMenuPayload(
    items: Array<{ mealType: MealType; description: string }>,
    messId: string,
    year: number,
    month: number,
  ) {
    const itemMap = new Map(items.map((item) => [item.mealType, item.description]));

    return MEAL_TYPES.map((mealType) => ({
      messId,
      year,
      month,
      mealType,
      description: itemMap.get(mealType) ?? null,
    }));
  }

  private buildRoutinePayload(
    items: Array<{ weekday: number; mealType: MealType; isEnabled: boolean }>,
  ) {
    const itemMap = new Map(
      items.map((item) => [this.buildRoutineKey(item.weekday, item.mealType), item.isEnabled]),
    );

    return WEEKDAYS.flatMap((weekday) =>
      MEAL_TYPES.map((mealType) => ({
        weekday,
        mealType,
        isEnabled: itemMap.get(this.buildRoutineKey(weekday, mealType)) ?? true,
      })),
    );
  }

  private serializeRequest(request: {
    id: string;
    requestType: MealRequestType;
    status: MealRequestStatus;
    guestCount: number;
    reason: string | null;
    managerNote: string | null;
    createdAt: Date;
    updatedAt: Date;
    respondedAt: Date | null;
    cancelledAt: Date | null;
    mealDay: { id: string; date: Date; mealType: MealType; menuDescription?: string | null };
    messMember: {
      id: string;
      user: {
        id: string;
        fullName: string;
        phoneNumber: string | null;
        email: string | null;
      };
    };
  }) {
    return {
      id: request.id,
      requestType: request.requestType,
      status: request.status,
      guestCount: request.guestCount,
      reason: request.reason,
      managerNote: request.managerNote,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      respondedAt: request.respondedAt,
      cancelledAt: request.cancelledAt,
      meal: {
        mealDayId: request.mealDay.id,
        date: request.mealDay.date,
        mealType: request.mealDay.mealType,
        menuDescription: request.mealDay.menuDescription ?? null,
      },
      member: {
        id: request.messMember.user.id,
        membershipId: request.messMember.id,
        fullName: request.messMember.user.fullName,
        phoneNumber: request.messMember.user.phoneNumber,
        email: request.messMember.user.email,
      },
    };
  }

  private serializeMemberStatus(status: {
    id: string;
    isEnabled: boolean;
    guestCount: number;
    isOverridden: boolean;
    attendanceStatus: AttendanceStatus;
    attendanceMarkedAt: Date | null;
    mealDay: { id: string; date: Date; mealType: MealType; menuDescription: string | null };
    messMember?: {
      id: string;
      user: {
        id: string;
        fullName: string;
        phoneNumber: string | null;
        email: string | null;
      };
    };
  }) {
    return {
      id: status.id,
      isEnabled: status.isEnabled,
      guestCount: status.guestCount,
      isOverridden: status.isOverridden,
      attendanceStatus: status.attendanceStatus,
      attendanceMarkedAt: status.attendanceMarkedAt,
      meal: {
        mealDayId: status.mealDay.id,
        date: status.mealDay.date,
        mealType: status.mealDay.mealType,
        menuDescription: status.mealDay.menuDescription,
      },
      member: status.messMember
        ? {
            membershipId: status.messMember.id,
            id: status.messMember.user.id,
            fullName: status.messMember.user.fullName,
            phoneNumber: status.messMember.user.phoneNumber,
            email: status.messMember.user.email,
          }
        : null,
    };
  }

  private buildCalendarDays(
    statuses: Array<{
      id: string;
      isEnabled: boolean;
      guestCount: number;
      isOverridden: boolean;
      attendanceStatus: AttendanceStatus;
      attendanceMarkedAt: Date | null;
      mealDay: {
        id: string;
        date: Date;
        mealType: MealType;
        menuDescription: string | null;
      };
    }>,
    requests: Array<{
      id: string;
      mealDayId: string;
      requestType: MealRequestType;
      status: MealRequestStatus;
      guestCount: number;
      reason: string | null;
      managerNote: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>,
  ) {
    const latestRequestMap = new Map<string, (typeof requests)[number]>();

    for (const request of requests) {
      if (!latestRequestMap.has(request.mealDayId)) {
        latestRequestMap.set(request.mealDayId, request);
      }
    }

    const dayMap = new Map<
      string,
      {
        date: Date;
        meals: Array<Record<string, unknown>>;
      }
    >();

    for (const status of statuses) {
      const dateKey = status.mealDay.date.toISOString().slice(0, 10);
      const day = dayMap.get(dateKey) ?? {
        date: status.mealDay.date,
        meals: [],
      };

      const latestRequest = latestRequestMap.get(status.mealDay.id);

      day.meals.push({
        mealDayId: status.mealDay.id,
        mealType: status.mealDay.mealType,
        menuDescription: status.mealDay.menuDescription,
        isEnabled: status.isEnabled,
        guestCount: status.guestCount,
        isOverridden: status.isOverridden,
        attendanceStatus: status.attendanceStatus,
        attendanceMarkedAt: status.attendanceMarkedAt,
        request: latestRequest
          ? {
              id: latestRequest.id,
              requestType: latestRequest.requestType,
              status: latestRequest.status,
              guestCount: latestRequest.guestCount,
              reason: latestRequest.reason,
              managerNote: latestRequest.managerNote,
              createdAt: latestRequest.createdAt,
              updatedAt: latestRequest.updatedAt,
            }
          : null,
      });

      dayMap.set(dateKey, day);
    }

    return Array.from(dayMap.values()).sort(
      (left, right) => left.date.getTime() - right.date.getTime(),
    );
  }

  private filterActivityRequests<T extends { requestType: MealRequestType }>(
    requests: T[],
    filter: MemberActivityFilter,
  ): T[] {
    if (filter === MemberActivityFilter.REQUEST) {
      return requests.filter(
        (item) => item.requestType === MealRequestType.GUEST_MEAL,
      );
    }

    if (filter === MemberActivityFilter.CHANGE) {
      return requests.filter(
        (item) =>
          item.requestType === MealRequestType.MEAL_ON ||
          item.requestType === MealRequestType.MEAL_OFF,
      );
    }

    return requests;
  }

  private calculateHighestMealInOneDay(
    statuses: Array<{
      isEnabled: boolean;
      guestCount: number;
      mealDay: { date: Date };
    }>,
  ) {
    const dayTotals = new Map<string, number>();

    for (const status of statuses) {
      const key = status.mealDay.date.toISOString().slice(0, 10);
      const current = dayTotals.get(key) ?? 0;
      const nextValue = current + (status.isEnabled ? 1 : 0) + status.guestCount;
      dayTotals.set(key, nextValue);
    }

    return Math.max(0, ...dayTotals.values());
  }

  private calculateTotalDaySummary(
    statuses: Array<{
      isEnabled: boolean;
      guestCount: number;
      mealDay: { date: Date };
    }>,
  ) {
    const activeDays = new Set<string>();

    for (const status of statuses) {
      if (!status.isEnabled && status.guestCount === 0) {
        continue;
      }

      activeDays.add(status.mealDay.date.toISOString().slice(0, 10));
    }

    return activeDays.size;
  }

  private buildMonthlyBreakdown(
    requests: Array<{
      requestType: MealRequestType;
      guestCount: number;
      mealDay: { year: number; month: number };
    }>,
  ) {
    const breakdown = new Map<
      string,
      { year: number; month: number; requestCount: number; changeCount: number; guestMeals: number }
    >();

    for (const request of requests) {
      const key = `${request.mealDay.year}-${request.mealDay.month}`;
      const current = breakdown.get(key) ?? {
        year: request.mealDay.year,
        month: request.mealDay.month,
        requestCount: 0,
        changeCount: 0,
        guestMeals: 0,
      };

      current.requestCount += 1;

      if (
        request.requestType === MealRequestType.MEAL_ON ||
        request.requestType === MealRequestType.MEAL_OFF
      ) {
        current.changeCount += 1;
      }

      if (request.requestType === MealRequestType.GUEST_MEAL) {
        current.guestMeals += request.guestCount;
      }

      breakdown.set(key, current);
    }

    return Array.from(breakdown.values()).sort(
      (left, right) =>
        left.year - right.year || left.month - right.month,
    );
  }

  private ensureUniqueMenuItems(
    items: Array<{ mealType: MealType }>,
  ): void {
    const keys = new Set<string>();

    for (const item of items) {
      if (keys.has(item.mealType)) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Duplicate mealType values are not allowed in menu items',
        });
      }

      keys.add(item.mealType);
    }
  }

  private ensureUniqueRoutineItems(
    items: Array<{ weekday: number; mealType: MealType }>,
  ): void {
    const keys = new Set<string>();

    for (const item of items) {
      const key = this.buildRoutineKey(item.weekday, item.mealType);

      if (keys.has(key)) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Duplicate weekday and mealType combinations are not allowed',
        });
      }

      keys.add(key);
    }
  }

  private validateMealRequest(
    requestType: MealRequestType,
    guestCount?: number,
  ): void {
    if (requestType === MealRequestType.GUEST_MEAL && (!guestCount || guestCount < 1)) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_MEAL_REQUEST,
        message: 'guestCount must be at least 1 for guest meal requests',
      });
    }

    if (
      requestType !== MealRequestType.GUEST_MEAL &&
      guestCount !== undefined &&
      guestCount !== 0
    ) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_MEAL_REQUEST,
        message: 'guestCount is only allowed for guest meal requests',
      });
    }
  }

  private buildRoutineKey(weekday: number, mealType: MealType): string {
    return `${weekday}-${mealType}`;
  }

  private buildMemberRoutineKey(
    messMemberId: string,
    weekday: number,
    mealType: MealType,
  ): string {
    return `${messMemberId}-${weekday}-${mealType}`;
  }

  private buildMealDayKeyFromDate(date: Date, mealType: MealType): string {
    return `${date.toISOString().slice(0, 10)}-${mealType}`;
  }
}