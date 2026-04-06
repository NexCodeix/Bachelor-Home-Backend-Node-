import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateManagerExpenseDto } from './dto/create-manager-expense.dto';
import { CreateMemberExpenseDto } from './dto/create-member-expense.dto';
import { DecideExpenseDto } from './dto/decide-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { UpdateManagerExpenseDto } from './dto/update-manager-expense.dto';
import { ExpensesService } from './expenses.service';

const expenseUploadDestination = join(process.cwd(), 'uploads', 'expenses');

const expenseStorage = diskStorage({
  destination: (_request, _file, callback) => {
    mkdirSync(expenseUploadDestination, { recursive: true });
    callback(null, expenseUploadDestination);
  },
  filename: (_request, file, callback) => {
    const extension = extname(file.originalname) || '.jpg';
    const safeBaseName =
      file.originalname
        .replace(extension, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'expense-voucher';

    callback(null, `${safeBaseName}-${Date.now()}${extension.toLowerCase()}`);
  },
});

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post('manager')
  @Roles(Role.MANAGER)
  @UseInterceptors(
    FileInterceptor('voucherImage', {
      storage: expenseStorage,
      fileFilter: (_request, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(
            new BadRequestException({
              code: ERROR_CODES.VALIDATION_ERROR,
              message: 'voucherImage must be an image file',
            }),
            false,
          );
          return;
        }

        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  createManagerExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateManagerExpenseDto,
    @UploadedFile() voucherImage?: Express.Multer.File,
  ) {
    return this.expensesService.createManagerExpense(user, dto, voucherImage);
  }

  @Patch('manager/:expenseId')
  @Roles(Role.MANAGER)
  @UseInterceptors(
    FileInterceptor('voucherImage', {
      storage: expenseStorage,
      fileFilter: (_request, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(
            new BadRequestException({
              code: ERROR_CODES.VALIDATION_ERROR,
              message: 'voucherImage must be an image file',
            }),
            false,
          );
          return;
        }

        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  updateManagerExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Param('expenseId', new ParseUUIDPipe()) expenseId: string,
    @Body() dto: UpdateManagerExpenseDto,
    @UploadedFile() voucherImage?: Express.Multer.File,
  ) {
    return this.expensesService.updateManagerExpense(
      user,
      expenseId,
      dto,
      voucherImage,
    );
  }

  @Delete('manager/:expenseId')
  @Roles(Role.MANAGER)
  removeManagerExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Param('expenseId', new ParseUUIDPipe()) expenseId: string,
  ) {
    return this.expensesService.removeManagerExpense(user, expenseId);
  }

  @Get('manager/summary')
  @Roles(Role.MANAGER)
  getManagerSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expensesService.getManagerSummary(user, query);
  }

  @Get('manager/list')
  @Roles(Role.MANAGER)
  getManagerExpenses(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expensesService.getManagerExpenses(user, query);
  }

  @Get('manager/members/:memberId')
  @Roles(Role.MANAGER)
  getManagerMemberExpenses(
    @CurrentUser() user: AuthenticatedUser,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expensesService.getManagerMemberExpenses(user, memberId, query);
  }

  @Patch('manager/:expenseId/decision')
  @Roles(Role.MANAGER)
  decideExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Param('expenseId', new ParseUUIDPipe()) expenseId: string,
    @Body() dto: DecideExpenseDto,
  ) {
    return this.expensesService.decideExpense(user, expenseId, dto);
  }

  @Post('member')
  @Roles(Role.MEMBER)
  @UseInterceptors(
    FileInterceptor('voucherImage', {
      storage: expenseStorage,
      fileFilter: (_request, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(
            new BadRequestException({
              code: ERROR_CODES.VALIDATION_ERROR,
              message: 'voucherImage must be an image file',
            }),
            false,
          );
          return;
        }

        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  createMemberExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMemberExpenseDto,
    @UploadedFile() voucherImage?: Express.Multer.File,
  ) {
    return this.expensesService.createMemberExpense(user, dto, voucherImage);
  }

  @Get('member/my')
  @Roles(Role.MEMBER)
  getMemberExpenses(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expensesService.getMemberExpenses(user, query);
  }

  @Get('member/meal-rate')
  @Roles(Role.MEMBER)
  getMealRate(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expensesService.getMealRate(user, query);
  }
}
