import { MealRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideMealRequestDto {
  @IsEnum([MealRequestStatus.APPROVED, MealRequestStatus.REJECTED], {
    message: 'action must be either APPROVED or REJECTED',
  })
  action: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  managerNote?: string;
}