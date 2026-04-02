import { Module } from '@nestjs/common';
import { MessController } from './mess.controller';
import { MessService } from './mess.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [MessController],
  providers: [MessService, JwtAuthGuard, RolesGuard],
})
export class MessModule {}
