import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { CreateMessDto } from './dto/create-mess.dto';
import { DecideJoinRequestDto } from './dto/decide-join-request.dto';
import { JoinMessDto } from './dto/join-mess.dto';
import { ToggleJoinDto } from './dto/toggle-join.dto';
import { MessService } from './mess.service';

@Controller('messes')
export class MessController {
  constructor(private readonly messService: MessService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  createMess(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMessDto,
  ) {
    return this.messService.createMess(user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('join')
  @HttpCode(HttpStatus.OK)
  joinMess(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinMessDto) {
    return this.messService.joinMess(user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('join-requests/my-status')
  getMyJoinRequestStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Query('messId', new ParseUUIDPipe()) messId: string,
  ) {
    return this.messService.getMyJoinRequestStatus(user, messId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  @Patch('join-settings')
  updateJoinSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ToggleJoinDto,
  ) {
    return this.messService.updateJoinSettings(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  @Get('join-requests/pending')
  getPendingJoinRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query('messId', new ParseUUIDPipe()) messId: string,
  ) {
    return this.messService.getPendingJoinRequests(user, messId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  @Patch('join-requests/:requestId/decision')
  decideJoinRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: DecideJoinRequestDto,
  ) {
    return this.messService.decideJoinRequest(user, requestId, dto);
  }
}
