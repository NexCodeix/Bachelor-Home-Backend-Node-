import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExpenseStatus,
  MessJoinRequestStatus,
  MessMembershipRole,
  PaymentCategory,
  PaymentStatus,
  ReturnRequestStatus,
  Role,
} from '@prisma/client';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { ApiResponse } from '../../common/interfaces/api-response.interface';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../database/prisma.service';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';
import { DecidePaymentDto } from './dto/decide-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { RespondReturnRequestDto } from './dto/respond-return-request.dto';
import { SubmitPaymentDto } from './dto/submit-payment.dto';
import { UpdateMemberPaymentDto } from './dto/update-member-payment.dto';

type ManagerContext = {
  messId: string;
  messName: string;
  membershipId: string;
};

type MemberContext = {
  messId: string;
  messName: string;
  membershipId: string;
  membershipRole: MessMembershipRole;
};

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async submitMemberPayment(
    user: AuthenticatedUser,
    dto: SubmitPaymentDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    const paymentDate = new Date(dto.paymentDate);

    if (dto.returnAmountRequested && dto.returnAmountRequested > dto.amount) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PAYMENT_PAYLOAD,
        message: 'returnAmountRequested cannot be greater than amount',
      });
    }

    if (
      dto.payableAmount !== undefined &&
      dto.payableAmount > dto.amount - (dto.returnAmountRequested ?? 0)
    ) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PAYMENT_PAYLOAD,
        message:
          'payableAmount cannot be greater than amount minus returnAmountRequested',
      });
    }

    const payment = await this.prisma.payment.create({
      data: {
        messId: member.messId,
        messMemberId: member.membershipId,
        paymentDate,
        year: paymentDate.getUTCFullYear(),
        month: paymentDate.getUTCMonth() + 1,
        category: dto.category,
        amount: dto.amount,
        returnAmountRequested: dto.returnAmountRequested ?? 0,
        payableAmount: dto.payableAmount,
        status: PaymentStatus.PENDING,
      },
      include: {
        messMember: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
        returnRequests: true,
      },
    });

    return {
      success: true,
      message: 'Payment submitted successfully',
      data: this.serializePayment(payment),
    };
  }

  async updateMemberPayment(
    user: AuthenticatedUser,
    paymentId: string,
    dto: UpdateMemberPaymentDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    const payment = await this.getPaymentInMessOrThrow(
      paymentId,
      member.messId,
    );

    if (payment.messMemberId !== member.membershipId) {
      throw new ForbiddenException({
        code: ERROR_CODES.PAYMENT_UPDATE_FORBIDDEN,
        message: 'You can update only your own payments',
      });
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new ConflictException({
        code: ERROR_CODES.PAYMENT_ALREADY_PROCESSED,
        message: 'Only pending payment can be updated',
      });
    }

    const amount = dto.amount ?? Number(payment.amount);
    const returnAmountRequested =
      dto.returnAmountRequested ?? Number(payment.returnAmountRequested);
    const payableAmount =
      dto.payableAmount !== undefined
        ? dto.payableAmount
        : payment.payableAmount !== null
          ? Number(payment.payableAmount)
          : undefined;

    if (returnAmountRequested > amount) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PAYMENT_PAYLOAD,
        message: 'returnAmountRequested cannot be greater than amount',
      });
    }

    if (
      payableAmount !== undefined &&
      payableAmount > amount - returnAmountRequested
    ) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PAYMENT_PAYLOAD,
        message:
          'payableAmount cannot be greater than amount minus returnAmountRequested',
      });
    }

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        paymentDate: dto.paymentDate
          ? new Date(dto.paymentDate)
          : payment.paymentDate,
        year: dto.paymentDate
          ? new Date(dto.paymentDate).getUTCFullYear()
          : payment.year,
        month: dto.paymentDate
          ? new Date(dto.paymentDate).getUTCMonth() + 1
          : payment.month,
        category: dto.category ?? payment.category,
        amount,
        returnAmountRequested,
        payableAmount,
      },
      include: {
        messMember: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
        returnRequests: true,
      },
    });

    return {
      success: true,
      message: 'Payment updated successfully',
      data: this.serializePayment(updated),
    };
  }

  async removeMemberPayment(
    user: AuthenticatedUser,
    paymentId: string,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    const payment = await this.getPaymentInMessOrThrow(
      paymentId,
      member.messId,
    );

    if (payment.messMemberId !== member.membershipId) {
      throw new ForbiddenException({
        code: ERROR_CODES.PAYMENT_UPDATE_FORBIDDEN,
        message: 'You can remove only your own payments',
      });
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new ConflictException({
        code: ERROR_CODES.PAYMENT_ALREADY_PROCESSED,
        message: 'Only pending payment can be removed',
      });
    }

    await this.prisma.payment.delete({ where: { id: paymentId } });

    return {
      success: true,
      message: 'Payment removed successfully',
    };
  }

  async getMemberPayments(
    user: AuthenticatedUser,
    query: PaymentQueryDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);

    const payments = await this.prisma.payment.findMany({
      where: {
        messMemberId: member.membershipId,
        ...(query.year ? { year: query.year } : {}),
        ...(query.month ? { month: query.month } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        messMember: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
        returnRequests: true,
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      success: true,
      message: 'Member payments fetched successfully',
      data: {
        messId: member.messId,
        messName: member.messName,
        payments: payments.map((payment) => this.serializePayment(payment)),
      },
    };
  }

  async getMemberReturnRequests(
    user: AuthenticatedUser,
    query: PaymentQueryDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);

    const requests = await this.prisma.paymentReturnRequest.findMany({
      where: {
        messMemberId: member.membershipId,
        ...(query.returnStatus ? { status: query.returnStatus } : {}),
        ...(query.year || query.month
          ? {
              payment: {
                ...(query.year ? { year: query.year } : {}),
                ...(query.month ? { month: query.month } : {}),
              },
            }
          : {}),
      },
      include: {
        payment: {
          select: {
            id: true,
            paymentDate: true,
            year: true,
            month: true,
            category: true,
            amount: true,
            status: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return {
      success: true,
      message: 'Member return requests fetched successfully',
      data: {
        messId: member.messId,
        requests: requests.map((request) =>
          this.serializeReturnRequest(request),
        ),
      },
    };
  }

  async respondReturnRequest(
    user: AuthenticatedUser,
    returnRequestId: string,
    dto: RespondReturnRequestDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);

    const request = await this.prisma.paymentReturnRequest.findUnique({
      where: { id: returnRequestId },
      include: {
        payment: true,
      },
    });

    if (!request || request.messId !== member.messId) {
      throw new NotFoundException({
        code: ERROR_CODES.RETURN_REQUEST_NOT_FOUND,
        message: 'Return request not found',
      });
    }

    if (request.messMemberId !== member.membershipId) {
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'You can respond only to your own return request',
      });
    }

    if (request.status !== ReturnRequestStatus.PENDING) {
      throw new ConflictException({
        code: ERROR_CODES.RETURN_REQUEST_ALREADY_PROCESSED,
        message: 'Return request has already been processed',
      });
    }

    if (dto.action === 'REJECTED' && !dto.reason?.trim()) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PAYMENT_PAYLOAD,
        message: 'reason is required when action is REJECTED',
      });
    }

    const updated = await this.prisma.paymentReturnRequest.update({
      where: { id: returnRequestId },
      data: {
        status: dto.action,
        memberReason: dto.action === 'REJECTED' ? dto.reason : null,
        respondedAt: new Date(),
      },
      include: {
        payment: {
          select: {
            id: true,
            paymentDate: true,
            year: true,
            month: true,
            category: true,
            amount: true,
            status: true,
          },
        },
      },
    });

    return {
      success: true,
      message:
        dto.action === 'APPROVED'
          ? 'Return request approved successfully'
          : 'Return request rejected successfully',
      data: this.serializeReturnRequest(updated),
    };
  }

  async getMemberSummary(
    user: AuthenticatedUser,
    query: PaymentQueryDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);
    const { mealRate, totalFoodExpense, approvedMemberCount } =
      await this.computeMealRate(member.messId, query.year, query.month);

    const mealCountAgg = await this.prisma.mealDayMemberStatus.aggregate({
      where: {
        messMemberId: member.membershipId,
        isEnabled: true,
        mealDay: {
          ...(query.year ? { year: query.year } : {}),
          ...(query.month ? { month: query.month } : {}),
        },
      },
      _count: {
        _all: true,
      },
      _sum: {
        guestCount: true,
      },
    });

    const approvedMealPayments = await this.prisma.payment.aggregate({
      where: {
        messMemberId: member.membershipId,
        status: PaymentStatus.APPROVED,
        category: PaymentCategory.MEAL_CHARGE,
        ...(query.year ? { year: query.year } : {}),
        ...(query.month ? { month: query.month } : {}),
      },
      _sum: {
        payableAmount: true,
        amount: true,
      },
    });

    const ownMeals = mealCountAgg._count._all;
    const guestMeals = mealCountAgg._sum.guestCount ?? 0;
    const totalMealsForCharge = ownMeals + guestMeals;
    const expectedMealCharge = totalMealsForCharge * mealRate;
    const paidMealCharge = Number(
      approvedMealPayments._sum.payableAmount ??
        approvedMealPayments._sum.amount ??
        0,
    );

    return {
      success: true,
      message: 'Member payment summary fetched successfully',
      data: {
        messId: member.messId,
        messName: member.messName,
        year: query.year ?? null,
        month: query.month ?? null,
        totalFoodExpense,
        approvedMemberCount,
        mealRate,
        ownMeals,
        guestMeals,
        totalMealsForCharge,
        expectedMealCharge,
        paidMealCharge,
        dueAmount: Math.max(0, expectedMealCharge - paidMealCharge),
        advanceAmount: Math.max(0, paidMealCharge - expectedMealCharge),
      },
    };
  }

  async getManagerOverview(
    user: AuthenticatedUser,
    query: PaymentQueryDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);

    const totals = await this.prisma.payment.groupBy({
      by: ['status'],
      where: {
        messId: manager.messId,
        ...(query.year ? { year: query.year } : {}),
        ...(query.month ? { month: query.month } : {}),
      },
      _sum: {
        amount: true,
        payableAmount: true,
      },
      _count: {
        _all: true,
      },
    });

    const summary = {
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      pendingAmount: 0,
      approvedAmount: 0,
      rejectedAmount: 0,
    };

    for (const row of totals) {
      const amount = Number(row._sum.payableAmount ?? row._sum.amount ?? 0);
      if (row.status === PaymentStatus.PENDING) {
        summary.pendingCount = row._count._all;
        summary.pendingAmount = amount;
      }
      if (row.status === PaymentStatus.APPROVED) {
        summary.approvedCount = row._count._all;
        summary.approvedAmount = amount;
      }
      if (row.status === PaymentStatus.REJECTED) {
        summary.rejectedCount = row._count._all;
        summary.rejectedAmount = amount;
      }
    }

    const returnSummary = await this.prisma.paymentReturnRequest.groupBy({
      by: ['status'],
      where: {
        messId: manager.messId,
        ...(query.year || query.month
          ? {
              payment: {
                ...(query.year ? { year: query.year } : {}),
                ...(query.month ? { month: query.month } : {}),
              },
            }
          : {}),
      },
      _count: {
        _all: true,
      },
      _sum: {
        amount: true,
      },
    });

    const returnInfo = {
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      pendingAmount: 0,
      approvedAmount: 0,
      rejectedAmount: 0,
    };

    for (const row of returnSummary) {
      const amount = Number(row._sum.amount ?? 0);
      if (row.status === ReturnRequestStatus.PENDING) {
        returnInfo.pendingCount = row._count._all;
        returnInfo.pendingAmount = amount;
      }
      if (row.status === ReturnRequestStatus.APPROVED) {
        returnInfo.approvedCount = row._count._all;
        returnInfo.approvedAmount = amount;
      }
      if (row.status === ReturnRequestStatus.REJECTED) {
        returnInfo.rejectedCount = row._count._all;
        returnInfo.rejectedAmount = amount;
      }
    }

    return {
      success: true,
      message: 'Manager payment overview fetched successfully',
      data: {
        messId: manager.messId,
        messName: manager.messName,
        year: query.year ?? null,
        month: query.month ?? null,
        payments: summary,
        returns: returnInfo,
      },
    };
  }

  async getManagerPayments(
    user: AuthenticatedUser,
    query: PaymentQueryDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);

    const payments = await this.prisma.payment.findMany({
      where: {
        messId: manager.messId,
        ...(query.year ? { year: query.year } : {}),
        ...(query.month ? { month: query.month } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.memberId
          ? {
              messMember: {
                userId: query.memberId,
              },
            }
          : {}),
      },
      include: {
        messMember: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
        returnRequests: true,
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      success: true,
      message: 'Manager payments fetched successfully',
      data: {
        messId: manager.messId,
        payments: payments.map((payment) => this.serializePayment(payment)),
      },
    };
  }

  async decidePayment(
    user: AuthenticatedUser,
    paymentId: string,
    dto: DecidePaymentDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);
    const payment = await this.getPaymentInMessOrThrow(
      paymentId,
      manager.messId,
    );

    if (payment.messMember.role === MessMembershipRole.OWNER) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PAYMENT_PAYLOAD,
        message: 'Manager decision is allowed only for member-created payments',
      });
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new ConflictException({
        code: ERROR_CODES.PAYMENT_ALREADY_PROCESSED,
        message: 'Payment has already been processed',
      });
    }

    if (dto.action === 'REJECTED' && !dto.rejectionReason?.trim()) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PAYMENT_PAYLOAD,
        message: 'rejectionReason is required when action is REJECTED',
      });
    }

    if (dto.returnAmount !== undefined) {
      if (dto.returnAmount <= 0 || dto.returnAmount > Number(payment.amount)) {
        throw new BadRequestException({
          code: ERROR_CODES.INVALID_PAYMENT_PAYLOAD,
          message:
            'returnAmount must be greater than 0 and less than or equal to amount',
        });
      }

      if (!dto.returnMethod) {
        throw new BadRequestException({
          code: ERROR_CODES.INVALID_PAYMENT_PAYLOAD,
          message: 'returnMethod is required when returnAmount is provided',
        });
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const payableAmount =
        dto.action === 'APPROVED'
          ? Number(payment.amount) - Number(payment.returnAmountRequested)
          : null;

      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: dto.action,
          managerNote: dto.managerNote,
          rejectionReason:
            dto.action === 'REJECTED' ? dto.rejectionReason : null,
          approvedAt: dto.action === 'APPROVED' ? new Date() : null,
          rejectedAt: dto.action === 'REJECTED' ? new Date() : null,
          payableAmount,
        },
        include: {
          messMember: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  phoneNumber: true,
                },
              },
            },
          },
          returnRequests: true,
        },
      });

      let createdReturnRequestId: string | null = null;
      if (dto.action === 'APPROVED' && dto.returnAmount !== undefined) {
        const created = await tx.paymentReturnRequest.create({
          data: {
            paymentId: payment.id,
            messId: payment.messId,
            messMemberId: payment.messMemberId,
            amount: dto.returnAmount,
            method: dto.returnMethod,
            transferTarget: dto.returnTransferTarget,
            managerNote: dto.managerNote,
          },
        });
        createdReturnRequestId = created.id;
      }

      return { updated, createdReturnRequestId };
    });

    return {
      success: true,
      message:
        dto.action === 'APPROVED'
          ? 'Payment approved successfully'
          : 'Payment rejected successfully',
      data: {
        ...this.serializePayment(result.updated),
        createdReturnRequestId: result.createdReturnRequestId,
      },
    };
  }

  async createManagerReturnRequest(
    user: AuthenticatedUser,
    paymentId: string,
    dto: CreateReturnRequestDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);
    const payment = await this.getPaymentInMessOrThrow(
      paymentId,
      manager.messId,
    );

    if (payment.status !== PaymentStatus.APPROVED) {
      throw new ConflictException({
        code: ERROR_CODES.INVALID_PAYMENT_PAYLOAD,
        message: 'Return request can be created only for approved payment',
      });
    }

    const alreadyReserved = await this.prisma.paymentReturnRequest.aggregate({
      where: {
        paymentId,
        status: {
          in: [ReturnRequestStatus.PENDING, ReturnRequestStatus.APPROVED],
        },
      },
      _sum: {
        amount: true,
      },
    });

    const maxAllowed = Number(payment.amount);
    const usedAmount = Number(alreadyReserved._sum.amount ?? 0);
    if (usedAmount + dto.amount > maxAllowed) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PAYMENT_PAYLOAD,
        message: 'Total return amount cannot exceed payment amount',
      });
    }

    const request = await this.prisma.paymentReturnRequest.create({
      data: {
        paymentId,
        messId: payment.messId,
        messMemberId: payment.messMemberId,
        amount: dto.amount,
        method: dto.method,
        transferTarget: dto.transferTarget,
        managerNote: dto.managerNote,
      },
      include: {
        payment: {
          select: {
            id: true,
            paymentDate: true,
            year: true,
            month: true,
            category: true,
            amount: true,
            status: true,
          },
        },
      },
    });

    return {
      success: true,
      message: 'Return request created successfully',
      data: this.serializeReturnRequest(request),
    };
  }

  async getManagerReturnRequests(
    user: AuthenticatedUser,
    query: PaymentQueryDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);

    const requests = await this.prisma.paymentReturnRequest.findMany({
      where: {
        messId: manager.messId,
        ...(query.returnStatus ? { status: query.returnStatus } : {}),
        ...(query.memberId
          ? {
              messMember: {
                userId: query.memberId,
              },
            }
          : {}),
        ...(query.year || query.month
          ? {
              payment: {
                ...(query.year ? { year: query.year } : {}),
                ...(query.month ? { month: query.month } : {}),
              },
            }
          : {}),
      },
      include: {
        payment: {
          select: {
            id: true,
            paymentDate: true,
            year: true,
            month: true,
            category: true,
            amount: true,
            status: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return {
      success: true,
      message: 'Manager return requests fetched successfully',
      data: {
        messId: manager.messId,
        requests: requests.map((request) =>
          this.serializeReturnRequest(request),
        ),
      },
    };
  }

  async getManagerUnpaidMembers(
    user: AuthenticatedUser,
    query: PaymentQueryDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);

    const year = query.year ?? new Date().getUTCFullYear();
    const month = query.month ?? new Date().getUTCMonth() + 1;

    const { mealRate } = await this.computeMealRate(
      manager.messId,
      year,
      month,
    );

    const members = await this.prisma.messMember.findMany({
      where: {
        messId: manager.messId,
        requestStatus: MessJoinRequestStatus.APPROVED,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: {
        joinedAt: 'asc',
      },
    });

    const list = await Promise.all(
      members
        .filter((member) => member.role !== MessMembershipRole.OWNER)
        .map(async (member) => {
          const mealAgg = await this.prisma.mealDayMemberStatus.aggregate({
            where: {
              messMemberId: member.id,
              isEnabled: true,
              mealDay: {
                year,
                month,
              },
            },
            _count: {
              _all: true,
            },
            _sum: {
              guestCount: true,
            },
          });

          const approvedPayments = await this.prisma.payment.aggregate({
            where: {
              messMemberId: member.id,
              status: PaymentStatus.APPROVED,
              category: PaymentCategory.MEAL_CHARGE,
              year,
              month,
            },
            _sum: {
              payableAmount: true,
              amount: true,
            },
          });

          const mealCount =
            mealAgg._count._all + (mealAgg._sum.guestCount ?? 0);
          const expectedCharge = mealCount * mealRate;
          const paid = Number(
            approvedPayments._sum.payableAmount ??
              approvedPayments._sum.amount ??
              0,
          );

          return {
            membershipId: member.id,
            memberId: member.user.id,
            fullName: member.user.fullName,
            email: member.user.email,
            phoneNumber: member.user.phoneNumber,
            mealCount,
            mealRate,
            expectedCharge,
            paid,
            dueAmount: Math.max(0, expectedCharge - paid),
          };
        }),
    );

    const unpaidMembers = list.filter((item) => item.dueAmount > 0);

    return {
      success: true,
      message: 'Manager unpaid members fetched successfully',
      data: {
        messId: manager.messId,
        year,
        month,
        unpaidMembers,
      },
    };
  }

  async getManagerReport(
    user: AuthenticatedUser,
    query: PaymentQueryDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);

    const year = query.year ?? new Date().getUTCFullYear();
    const month = query.month ?? new Date().getUTCMonth() + 1;

    const members = await this.prisma.messMember.findMany({
      where: {
        messId: manager.messId,
        requestStatus: MessJoinRequestStatus.APPROVED,
      },
      select: {
        id: true,
        role: true,
      },
    });

    const memberIds = members
      .filter((member) => member.role !== MessMembershipRole.OWNER)
      .map((member) => member.id);

    const { mealRate, totalFoodExpense } = await this.computeMealRate(
      manager.messId,
      year,
      month,
    );

    const mealAgg = await this.prisma.mealDayMemberStatus.groupBy({
      by: ['messMemberId'],
      where: {
        messMemberId: {
          in: memberIds,
        },
        isEnabled: true,
        mealDay: {
          year,
          month,
        },
      },
      _count: {
        _all: true,
      },
      _sum: {
        guestCount: true,
      },
    });

    const totalMeals = mealAgg.reduce(
      (sum, row) => sum + row._count._all + (row._sum.guestCount ?? 0),
      0,
    );

    const expectedMealCharge = totalMeals * mealRate;

    const paymentAgg = await this.prisma.payment.groupBy({
      by: ['status'],
      where: {
        messId: manager.messId,
        year,
        month,
      },
      _count: {
        _all: true,
      },
      _sum: {
        amount: true,
        payableAmount: true,
      },
    });

    const paymentInfo = {
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      pendingAmount: 0,
      approvedAmount: 0,
      rejectedAmount: 0,
    };

    for (const row of paymentAgg) {
      const amount = Number(row._sum.payableAmount ?? row._sum.amount ?? 0);
      if (row.status === PaymentStatus.PENDING) {
        paymentInfo.pendingCount = row._count._all;
        paymentInfo.pendingAmount = amount;
      }
      if (row.status === PaymentStatus.APPROVED) {
        paymentInfo.approvedCount = row._count._all;
        paymentInfo.approvedAmount = amount;
      }
      if (row.status === PaymentStatus.REJECTED) {
        paymentInfo.rejectedCount = row._count._all;
        paymentInfo.rejectedAmount = amount;
      }
    }

    const returnAgg = await this.prisma.paymentReturnRequest.groupBy({
      by: ['status'],
      where: {
        messId: manager.messId,
        payment: {
          year,
          month,
        },
      },
      _count: {
        _all: true,
      },
      _sum: {
        amount: true,
      },
    });

    const returnInfo = {
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      pendingAmount: 0,
      approvedAmount: 0,
      rejectedAmount: 0,
    };

    for (const row of returnAgg) {
      const amount = Number(row._sum.amount ?? 0);
      if (row.status === ReturnRequestStatus.PENDING) {
        returnInfo.pendingCount = row._count._all;
        returnInfo.pendingAmount = amount;
      }
      if (row.status === ReturnRequestStatus.APPROVED) {
        returnInfo.approvedCount = row._count._all;
        returnInfo.approvedAmount = amount;
      }
      if (row.status === ReturnRequestStatus.REJECTED) {
        returnInfo.rejectedCount = row._count._all;
        returnInfo.rejectedAmount = amount;
      }
    }

    return {
      success: true,
      message: 'Manager payment report fetched successfully',
      data: {
        messId: manager.messId,
        messName: manager.messName,
        year,
        month,
        approvedMemberCount: memberIds.length,
        totalFoodExpense,
        mealRate,
        totalMeals,
        expectedMealCharge,
        payments: paymentInfo,
        returns: returnInfo,
        totalDueAmount: Math.max(
          0,
          expectedMealCharge - paymentInfo.approvedAmount,
        ),
      },
    };
  }

  private async computeMealRate(messId: string, year?: number, month?: number) {
    const approvedFoodExpenses = await this.prisma.expense.findMany({
      where: {
        messId,
        status: ExpenseStatus.APPROVED,
        ...(year ? { year } : {}),
        ...(month ? { month } : {}),
      },
      select: {
        category: true,
        totalValue: true,
      },
    });

    const totalFoodExpense = approvedFoodExpenses
      .filter((expense) => expense.category.trim().toLowerCase() === 'food')
      .reduce((sum, expense) => sum + Number(expense.totalValue), 0);

    const approvedMemberCount = await this.prisma.messMember.count({
      where: {
        messId,
        requestStatus: MessJoinRequestStatus.APPROVED,
      },
    });

    return {
      totalFoodExpense,
      approvedMemberCount,
      mealRate:
        approvedMemberCount > 0 ? totalFoodExpense / approvedMemberCount : 0,
    };
  }

  private async getManagerContextOrThrow(
    user: AuthenticatedUser,
  ): Promise<ManagerContext> {
    if (user.role !== Role.MANAGER) {
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only managers can access this resource',
      });
    }

    const mess = await this.prisma.mess.findUnique({
      where: { ownerUserId: user.id },
      include: {
        members: {
          where: {
            userId: user.id,
            requestStatus: MessJoinRequestStatus.APPROVED,
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
      messId: mess.id,
      messName: mess.name,
      membershipId: mess.members[0].id,
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
        message: 'You must be an approved mess member to access payments',
      });
    }

    return {
      messId: membership.messId,
      messName: membership.mess.name,
      membershipId: membership.id,
      membershipRole: membership.role,
    };
  }

  private async getPaymentInMessOrThrow(paymentId: string, messId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        messMember: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
        returnRequests: true,
      },
    });

    if (!payment || payment.messId !== messId) {
      throw new NotFoundException({
        code: ERROR_CODES.PAYMENT_NOT_FOUND,
        message: 'Payment not found',
      });
    }

    return payment;
  }

  private serializePayment(payment: {
    id: string;
    messId: string;
    messMemberId: string;
    paymentDate: Date;
    year: number;
    month: number;
    category: PaymentCategory;
    amount: { toString(): string };
    returnAmountRequested: { toString(): string };
    payableAmount: { toString(): string } | null;
    status: PaymentStatus;
    managerNote: string | null;
    rejectionReason: string | null;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    messMember: {
      id: string;
      role: MessMembershipRole;
      user: {
        id: string;
        fullName: string;
        email: string | null;
        phoneNumber: string | null;
      };
    };
    returnRequests: Array<{
      id: string;
      amount: { toString(): string };
      status: ReturnRequestStatus;
      createdAt: Date;
    }>;
  }) {
    return {
      id: payment.id,
      messId: payment.messId,
      messMemberId: payment.messMemberId,
      paymentDate: payment.paymentDate,
      year: payment.year,
      month: payment.month,
      category: payment.category,
      amount: Number(payment.amount),
      returnAmountRequested: Number(payment.returnAmountRequested),
      payableAmount:
        payment.payableAmount !== null ? Number(payment.payableAmount) : null,
      status: payment.status,
      managerNote: payment.managerNote,
      rejectionReason: payment.rejectionReason,
      approvedAt: payment.approvedAt,
      rejectedAt: payment.rejectedAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      member: {
        membershipId: payment.messMember.id,
        role: payment.messMember.role,
        userId: payment.messMember.user.id,
        fullName: payment.messMember.user.fullName,
        email: payment.messMember.user.email,
        phoneNumber: payment.messMember.user.phoneNumber,
      },
      returnRequests: payment.returnRequests.map((request) => ({
        id: request.id,
        amount: Number(request.amount),
        status: request.status,
        createdAt: request.createdAt,
      })),
    };
  }

  private serializeReturnRequest(request: {
    id: string;
    paymentId: string;
    messId: string;
    messMemberId: string;
    amount: { toString(): string };
    method: string;
    transferTarget: string | null;
    status: ReturnRequestStatus;
    managerNote: string | null;
    memberReason: string | null;
    respondedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    payment: {
      id: string;
      paymentDate: Date;
      year: number;
      month: number;
      category: PaymentCategory;
      amount: { toString(): string };
      status: PaymentStatus;
    };
  }) {
    return {
      id: request.id,
      paymentId: request.paymentId,
      messId: request.messId,
      messMemberId: request.messMemberId,
      amount: Number(request.amount),
      method: request.method,
      transferTarget: request.transferTarget,
      status: request.status,
      managerNote: request.managerNote,
      memberReason: request.memberReason,
      respondedAt: request.respondedAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      payment: {
        id: request.payment.id,
        paymentDate: request.payment.paymentDate,
        year: request.payment.year,
        month: request.payment.month,
        category: request.payment.category,
        amount: Number(request.payment.amount),
        status: request.payment.status,
      },
    };
  }
}
