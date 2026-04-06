import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService, JwtAuthGuard, RolesGuard],
})
export class ExpensesModule {}
