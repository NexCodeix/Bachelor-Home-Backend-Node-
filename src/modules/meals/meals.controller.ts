import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateMealRequestDto } from './dto/create-meal-request.dto';
import { DecideMealRequestDto } from './dto/decide-meal-request.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { MemberActivityQueryDto } from './dto/member-activity-query.dto';
import { MealHistoryQueryDto } from './dto/meal-history-query.dto';
import { MonthQueryDto } from './dto/month-query.dto';
import { SetWeeklyRoutineDto } from './dto/set-weekly-routine.dto';
import { UpdateMealRequestDto } from './dto/update-meal-request.dto';
import { UpsertMonthMenuDto } from './dto/upsert-month-menu.dto';
import { MealsService } from './meals.service';

@Controller('meals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MealsController {
  constructor(private readonly mealsService: MealsService) {}

  @Get('manager/dashboard')
  @Roles(Role.MANAGER)
  getManagerDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthQueryDto,
  ) {
    return this.mealsService.getManagerDashboard(user, query);
  }

  @Get('manager/menu')
  @Roles(Role.MANAGER)
  getManagerMonthMenu(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthQueryDto,
  ) {
    return this.mealsService.getManagerMonthMenu(user, query);
  }

  @Put('manager/menu')
  @Roles(Role.MANAGER)
  upsertManagerMonthMenu(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertMonthMenuDto,
  ) {
    return this.mealsService.upsertManagerMonthMenu(user, dto);
  }

  @Get('manager/routine')
  @Roles(Role.MANAGER)
  getManagerRoutine(@CurrentUser() user: AuthenticatedUser) {
    return this.mealsService.getManagerRoutine(user);
  }

  @Put('manager/routine')
  @Roles(Role.MANAGER)
  setManagerRoutine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetWeeklyRoutineDto,
  ) {
    return this.mealsService.setManagerRoutine(user, dto);
  }

  @Get('manager/requests/pending')
  @Roles(Role.MANAGER)
  getPendingMealRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthQueryDto,
  ) {
    return this.mealsService.getPendingMealRequests(user, query);
  }

  @Patch('manager/requests/:requestId/decision')
  @Roles(Role.MANAGER)
  decideMealRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: DecideMealRequestDto,
  ) {
    return this.mealsService.decideMealRequest(user, requestId, dto);
  }

  @Get('manager/history')
  @Roles(Role.MANAGER)
  getManagerHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MealHistoryQueryDto,
  ) {
    return this.mealsService.getManagerHistory(user, query);
  }

  @Get('manager/members/:memberId/activity')
  @Roles(Role.MANAGER)
  getManagerMemberActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
    @Query() query: MonthQueryDto,
  ) {
    return this.mealsService.getManagerMemberActivity(user, memberId, query);
  }

  @Get('member/summary')
  @Roles(Role.MEMBER, Role.MANAGER)
  getMemberSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthQueryDto,
  ) {
    return this.mealsService.getMemberSummary(user, query);
  }

  @Get('member/calendar')
  @Roles(Role.MEMBER, Role.MANAGER)
  getMemberCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthQueryDto,
  ) {
    return this.mealsService.getMemberCalendar(user, query);
  }

  @Get('member/routine')
  @Roles(Role.MEMBER, Role.MANAGER)
  getMemberRoutine(@CurrentUser() user: AuthenticatedUser) {
    return this.mealsService.getMemberRoutine(user);
  }

  @Put('member/routine')
  @Roles(Role.MEMBER, Role.MANAGER)
  setMemberRoutine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetWeeklyRoutineDto,
  ) {
    return this.mealsService.setMemberRoutine(user, dto);
  }

  @Post('member/requests')
  @Roles(Role.MEMBER, Role.MANAGER)
  createMealRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMealRequestDto,
  ) {
    return this.mealsService.createMealRequest(user, dto);
  }

  @Patch('member/requests/:requestId')
  @Roles(Role.MEMBER, Role.MANAGER)
  updateMealRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: UpdateMealRequestDto,
  ) {
    return this.mealsService.updateMealRequest(user, requestId, dto);
  }

  @Patch('member/requests/:requestId/cancel')
  @Roles(Role.MEMBER, Role.MANAGER)
  cancelMealRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.mealsService.cancelMealRequest(user, requestId);
  }

  @Patch('member/attendance/:mealDayId')
  @Roles(Role.MEMBER, Role.MANAGER)
  markAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('mealDayId', new ParseUUIDPipe()) mealDayId: string,
    @Body() dto: MarkAttendanceDto,
  ) {
    return this.mealsService.markAttendance(user, mealDayId, dto);
  }

  @Get('member/history')
  @Roles(Role.MEMBER, Role.MANAGER)
  getMemberHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthQueryDto,
  ) {
    return this.mealsService.getMemberHistory(user, query);
  }

  @Get('member/activity')
  @Roles(Role.MEMBER, Role.MANAGER)
  getMemberActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MemberActivityQueryDto,
  ) {
    return this.mealsService.getMemberActivity(user, query);
  }

  @Get('member/report')
  @Roles(Role.MEMBER, Role.MANAGER)
  getMemberReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthQueryDto,
  ) {
    return this.mealsService.getMemberReport(user, query);
  }
}