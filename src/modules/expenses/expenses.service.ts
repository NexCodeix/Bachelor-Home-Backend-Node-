import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExpenseMoneySource,
  ExpenseStatus,
  MessJoinRequestStatus,
  MessMembershipRole,
  Role,
} from '@prisma/client';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { ApiResponse } from '../../common/interfaces/api-response.interface';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../database/prisma.service';
import { CreateManagerExpenseDto } from './dto/create-manager-expense.dto';
import { CreateMemberExpenseDto } from './dto/create-member-expense.dto';
import { DecideExpenseDto } from './dto/decide-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { UpdateManagerExpenseDto } from './dto/update-manager-expense.dto';

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
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async createManagerExpense(
    user: AuthenticatedUser,
    dto: CreateManagerExpenseDto,
    voucherImage?: Express.Multer.File,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);
    const dateTime = new Date(dto.date);

    const expense = await this.prisma.expense.create({
      data: {
        messId: manager.messId,
        messMemberId: manager.membershipId,
        dateTime,
        year: dateTime.getUTCFullYear(),
        month: dateTime.getUTCMonth() + 1,
        category: dto.category,
        itemName: dto.itemName,
        amountValue: dto.amountValue,
        perAmountValue: dto.perAmountValue,
        voucherImageUrl: voucherImage
          ? this.buildExpenseVoucherUrl(voucherImage.filename)
          : null,
        totalValue: dto.totalValue,
        status: ExpenseStatus.APPROVED,
        respondedAt: new Date(),
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
      },
    });

    return {
      success: true,
      message: 'Expense added by manager successfully',
      data: this.serializeExpense(expense),
    };
  }

  async updateManagerExpense(
    user: AuthenticatedUser,
    expenseId: string,
    dto: UpdateManagerExpenseDto,
    voucherImage?: Express.Multer.File,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);
    const expense = await this.getExpenseInMessOrThrow(
      expenseId,
      manager.messId,
    );

    if (expense.messMemberId !== manager.membershipId) {
      throw new ForbiddenException({
        code: ERROR_CODES.EXPENSE_UPDATE_FORBIDDEN,
        message: 'Managers can update only their own expenses',
      });
    }

    const dateTime = dto.date ? new Date(dto.date) : expense.dateTime;

    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        dateTime,
        year: dateTime.getUTCFullYear(),
        month: dateTime.getUTCMonth() + 1,
        category: dto.category ?? expense.category,
        itemName: dto.itemName ?? expense.itemName,
        amountValue: dto.amountValue ?? expense.amountValue,
        perAmountValue:
          dto.perAmountValue !== undefined
            ? dto.perAmountValue
            : expense.perAmountValue,
        totalValue: dto.totalValue ?? expense.totalValue,
        voucherImageUrl: voucherImage
          ? this.buildExpenseVoucherUrl(voucherImage.filename)
          : expense.voucherImageUrl,
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
      },
    });

    return {
      success: true,
      message: 'Manager expense updated successfully',
      data: this.serializeExpense(updated),
    };
  }

  async removeManagerExpense(
    user: AuthenticatedUser,
    expenseId: string,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);
    const expense = await this.getExpenseInMessOrThrow(
      expenseId,
      manager.messId,
    );

    if (expense.messMemberId !== manager.membershipId) {
      throw new ForbiddenException({
        code: ERROR_CODES.EXPENSE_UPDATE_FORBIDDEN,
        message: 'Managers can remove only their own expenses',
      });
    }

    await this.prisma.expense.delete({ where: { id: expenseId } });

    return {
      success: true,
      message: 'Manager expense removed successfully',
    };
  }

  async getManagerSummary(
    user: AuthenticatedUser,
    query: ExpenseQueryDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);

    const where = {
      messId: manager.messId,
      ...(query.year ? { year: query.year } : {}),
      ...(query.month ? { month: query.month } : {}),
      status: ExpenseStatus.APPROVED,
    };

    const expenses = await this.prisma.expense.findMany({
      where,
      select: {
        category: true,
        totalValue: true,
      },
    });

    const approvedMemberCount = await this.prisma.messMember.count({
      where: {
        messId: manager.messId,
        requestStatus: MessJoinRequestStatus.APPROVED,
      },
    });

    const totalExpenses = expenses.reduce(
      (sum, expense) => sum + Number(expense.totalValue),
      0,
    );
    const totalFoodExpenses = expenses
      .filter((expense) => this.isFoodCategory(expense.category))
      .reduce((sum, expense) => sum + Number(expense.totalValue), 0);
    const totalOtherExpenses = totalExpenses - totalFoodExpenses;

    return {
      success: true,
      message: 'Manager expense summary fetched successfully',
      data: {
        messId: manager.messId,
        messName: manager.messName,
        year: query.year ?? null,
        month: query.month ?? null,
        totalExpenses,
        totalFoodExpenses,
        totalOtherExpenses,
        mealRate:
          approvedMemberCount > 0 ? totalFoodExpenses / approvedMemberCount : 0,
      },
    };
  }

  async getManagerExpenses(
    user: AuthenticatedUser,
    query: ExpenseQueryDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);

    const expenses = await this.prisma.expense.findMany({
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
      },
      orderBy: [{ dateTime: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      success: true,
      message: 'Manager expenses fetched successfully',
      data: {
        messId: manager.messId,
        expenses: expenses.map((expense) => this.serializeExpense(expense)),
      },
    };
  }

  async getManagerMemberExpenses(
    user: AuthenticatedUser,
    memberId: string,
    query: ExpenseQueryDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);

    const member = await this.prisma.messMember.findFirst({
      where: {
        messId: manager.messId,
        userId: memberId,
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
    });

    if (!member) {
      throw new NotFoundException({
        code: ERROR_CODES.MEAL_MEMBER_NOT_FOUND,
        message: 'Member not found in this mess',
      });
    }

    const expenses = await this.prisma.expense.findMany({
      where: {
        messId: manager.messId,
        messMemberId: member.id,
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
      },
      orderBy: [{ dateTime: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      success: true,
      message: 'Member expenses fetched successfully for manager',
      data: {
        member: {
          id: member.user.id,
          fullName: member.user.fullName,
          email: member.user.email,
          phoneNumber: member.user.phoneNumber,
        },
        expenses: expenses.map((expense) => this.serializeExpense(expense)),
      },
    };
  }

  async decideExpense(
    user: AuthenticatedUser,
    expenseId: string,
    dto: DecideExpenseDto,
  ): Promise<ApiResponse> {
    const manager = await this.getManagerContextOrThrow(user);
    const expense = await this.getExpenseInMessOrThrow(
      expenseId,
      manager.messId,
    );

    if (expense.messMember.role === MessMembershipRole.OWNER) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_EXPENSE_STATUS,
        message: 'Manager decision is allowed only for member-created expenses',
      });
    }

    if (expense.status !== ExpenseStatus.PENDING) {
      throw new ConflictException({
        code: ERROR_CODES.EXPENSE_ALREADY_PROCESSED,
        message: 'Expense has already been processed',
      });
    }

    if (dto.action === 'REJECTED' && !dto.rejectionReason?.trim()) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_EXPENSE_PAYLOAD,
        message: 'rejectionReason is required when action is REJECTED',
      });
    }

    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        status: dto.action,
        rejectionReason: dto.action === 'REJECTED' ? dto.rejectionReason : null,
        respondedAt: new Date(),
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
      },
    });

    return {
      success: true,
      message:
        dto.action === 'APPROVED'
          ? 'Expense approved successfully'
          : 'Expense rejected successfully',
      data: this.serializeExpense(updated),
    };
  }

  async createMemberExpense(
    user: AuthenticatedUser,
    dto: CreateMemberExpenseDto,
    voucherImage?: Express.Multer.File,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);

    if (
      dto.moneySource === ExpenseMoneySource.MESS_FUND &&
      dto.receivedMessFundAmount === undefined
    ) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_EXPENSE_PAYLOAD,
        message:
          'receivedMessFundAmount is required when moneySource is MESS_FUND',
      });
    }

    if (
      dto.moneySource === ExpenseMoneySource.SELF_FUND &&
      dto.receivedMessFundAmount !== undefined
    ) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_EXPENSE_PAYLOAD,
        message:
          'receivedMessFundAmount is not allowed when moneySource is SELF_FUND',
      });
    }

    const dateTime = new Date(dto.dateTime);

    const expense = await this.prisma.expense.create({
      data: {
        messId: member.messId,
        messMemberId: member.membershipId,
        dateTime,
        year: dateTime.getUTCFullYear(),
        month: dateTime.getUTCMonth() + 1,
        category: dto.category,
        itemName: dto.itemName,
        amountValue: dto.amountValue,
        amountUnitName: dto.amountUnitName,
        perAmountValue: dto.perAmountValue,
        voucherImageUrl: voucherImage
          ? this.buildExpenseVoucherUrl(voucherImage.filename)
          : null,
        totalValue: dto.totalValue,
        moneySource: dto.moneySource,
        receivedMessFundAmount: dto.receivedMessFundAmount,
        returnAmount: dto.returnAmount,
        status: ExpenseStatus.PENDING,
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
      },
    });

    return {
      success: true,
      message: 'Expense submitted successfully',
      data: this.serializeExpense(expense),
    };
  }

  async getMemberExpenses(
    user: AuthenticatedUser,
    query: ExpenseQueryDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);

    const expenses = await this.prisma.expense.findMany({
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
      },
      orderBy: [{ dateTime: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      success: true,
      message: 'Member expenses fetched successfully',
      data: {
        messId: member.messId,
        messName: member.messName,
        expenses: expenses.map((expense) => this.serializeExpense(expense)),
      },
    };
  }

  async getMealRate(
    user: AuthenticatedUser,
    query: ExpenseQueryDto,
  ): Promise<ApiResponse> {
    const member = await this.getMemberContextOrThrow(user);

    const approvedFoodExpenses = await this.prisma.expense.findMany({
      where: {
        messId: member.messId,
        status: ExpenseStatus.APPROVED,
        ...(query.year ? { year: query.year } : {}),
        ...(query.month ? { month: query.month } : {}),
      },
      select: {
        category: true,
        totalValue: true,
      },
    });

    const foodTotal = approvedFoodExpenses
      .filter((expense) => this.isFoodCategory(expense.category))
      .reduce((sum, expense) => sum + Number(expense.totalValue), 0);

    const approvedMembers = await this.prisma.messMember.count({
      where: {
        messId: member.messId,
        requestStatus: MessJoinRequestStatus.APPROVED,
      },
    });

    return {
      success: true,
      message: 'Meal rate fetched successfully',
      data: {
        messId: member.messId,
        year: query.year ?? null,
        month: query.month ?? null,
        totalFoodExpense: foodTotal,
        approvedMemberCount: approvedMembers,
        mealRate: approvedMembers > 0 ? foodTotal / approvedMembers : 0,
      },
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
        message: 'You must be an approved mess member to access expenses',
      });
    }

    return {
      messId: membership.messId,
      messName: membership.mess.name,
      membershipId: membership.id,
      membershipRole: membership.role,
    };
  }

  private async getExpenseInMessOrThrow(expenseId: string, messId: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
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
      },
    });

    if (!expense || expense.messId !== messId) {
      throw new NotFoundException({
        code: ERROR_CODES.EXPENSE_NOT_FOUND,
        message: 'Expense not found',
      });
    }

    return expense;
  }

  private buildExpenseVoucherUrl(filename: string): string {
    return `/uploads/expenses/${filename}`;
  }

  private isFoodCategory(category: string): boolean {
    return category.trim().toLowerCase() === 'food';
  }

  private serializeExpense(expense: {
    id: string;
    messId: string;
    dateTime: Date;
    year: number;
    month: number;
    category: string;
    itemName: string;
    amountValue: { toString(): string };
    amountUnitName: string | null;
    perAmountValue: { toString(): string } | null;
    voucherImageUrl: string | null;
    totalValue: { toString(): string };
    moneySource: string | null;
    receivedMessFundAmount: { toString(): string } | null;
    returnAmount: { toString(): string } | null;
    status: ExpenseStatus;
    rejectionReason: string | null;
    respondedAt: Date | null;
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
  }) {
    return {
      id: expense.id,
      messId: expense.messId,
      dateTime: expense.dateTime,
      year: expense.year,
      month: expense.month,
      category: expense.category,
      itemName: expense.itemName,
      amountValue: Number(expense.amountValue),
      amountUnitName: expense.amountUnitName,
      perAmountValue:
        expense.perAmountValue !== null ? Number(expense.perAmountValue) : null,
      voucherImageUrl: expense.voucherImageUrl,
      totalValue: Number(expense.totalValue),
      moneySource: expense.moneySource,
      receivedMessFundAmount:
        expense.receivedMessFundAmount !== null
          ? Number(expense.receivedMessFundAmount)
          : null,
      returnAmount:
        expense.returnAmount !== null ? Number(expense.returnAmount) : null,
      status: expense.status,
      rejectionReason: expense.rejectionReason,
      respondedAt: expense.respondedAt,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
      addedBy: {
        membershipId: expense.messMember.id,
        role: expense.messMember.role,
        userId: expense.messMember.user.id,
        fullName: expense.messMember.user.fullName,
        email: expense.messMember.user.email,
        phoneNumber: expense.messMember.user.phoneNumber,
      },
    };
  }
}
