import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MealRequestType } from '@prisma/client';

export class CreateMealRequestDto {
  @IsUUID()
  mealDayId: string;

  @IsEnum(MealRequestType)
  requestType: MealRequestType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  guestCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}