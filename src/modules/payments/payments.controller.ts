import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';
import { DecidePaymentDto } from './dto/decide-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { RespondReturnRequestDto } from './dto/respond-return-request.dto';
import { SubmitPaymentDto } from './dto/submit-payment.dto';
import { UpdateMemberPaymentDto } from './dto/update-member-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('manager/overview')
  @Roles(Role.MANAGER)
  getManagerOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentQueryDto,
  ) {
    return this.paymentsService.getManagerOverview(user, query);
  }

  @Get('manager/list')
  @Roles(Role.MANAGER)
  getManagerPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentQueryDto,
  ) {
    return this.paymentsService.getManagerPayments(user, query);
  }

  @Get('manager/unpaid-members')
  @Roles(Role.MANAGER)
  getManagerUnpaidMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentQueryDto,
  ) {
    return this.paymentsService.getManagerUnpaidMembers(user, query);
  }

  @Patch('manager/:paymentId/decision')
  @Roles(Role.MANAGER)
  decidePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body() dto: DecidePaymentDto,
  ) {
    return this.paymentsService.decidePayment(user, paymentId, dto);
  }

  @Post('manager/:paymentId/return-requests')
  @Roles(Role.MANAGER)
  createManagerReturnRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body() dto: CreateReturnRequestDto,
  ) {
    return this.paymentsService.createManagerReturnRequest(
      user,
      paymentId,
      dto,
    );
  }

  @Get('manager/return-requests')
  @Roles(Role.MANAGER)
  getManagerReturnRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentQueryDto,
  ) {
    return this.paymentsService.getManagerReturnRequests(user, query);
  }

  @Get('manager/report')
  @Roles(Role.MANAGER)
  getManagerReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentQueryDto,
  ) {
    return this.paymentsService.getManagerReport(user, query);
  }

  @Post('member')
  @Roles(Role.MEMBER)
  submitMemberPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitPaymentDto,
  ) {
    return this.paymentsService.submitMemberPayment(user, dto);
  }

  @Patch('member/:paymentId')
  @Roles(Role.MEMBER)
  updateMemberPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body() dto: UpdateMemberPaymentDto,
  ) {
    return this.paymentsService.updateMemberPayment(user, paymentId, dto);
  }

  @Delete('member/:paymentId')
  @Roles(Role.MEMBER)
  removeMemberPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
  ) {
    return this.paymentsService.removeMemberPayment(user, paymentId);
  }

  @Get('member/my')
  @Roles(Role.MEMBER)
  getMemberPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentQueryDto,
  ) {
    return this.paymentsService.getMemberPayments(user, query);
  }

  @Get('member/summary')
  @Roles(Role.MEMBER)
  getMemberSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentQueryDto,
  ) {
    return this.paymentsService.getMemberSummary(user, query);
  }

  @Get('member/return-requests')
  @Roles(Role.MEMBER)
  getMemberReturnRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentQueryDto,
  ) {
    return this.paymentsService.getMemberReturnRequests(user, query);
  }

  @Patch('member/return-requests/:returnRequestId/respond')
  @Roles(Role.MEMBER)
  respondReturnRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('returnRequestId', new ParseUUIDPipe()) returnRequestId: string,
    @Body() dto: RespondReturnRequestDto,
  ) {
    return this.paymentsService.respondReturnRequest(
      user,
      returnRequestId,
      dto,
    );
  }
}
