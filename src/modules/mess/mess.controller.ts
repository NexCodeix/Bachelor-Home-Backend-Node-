import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateMessDto } from './dto/create-mess.dto';
import { JoinMessDto } from './dto/join-mess.dto';
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
}
