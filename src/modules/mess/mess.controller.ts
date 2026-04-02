import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateMessDto } from './dto/create-mess.dto';
import { JoinMessDto } from './dto/join-mess.dto';
import { MessService } from './mess.service';

@Controller('messes')
export class MessController {
  constructor(private readonly messService: MessService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  @Post()
  createMess(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMessDto) {
    return this.messService.createMess(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MEMBER)
  @Post('join')
  joinMess(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinMessDto) {
    return this.messService.joinMess(user, dto);
  }
}
