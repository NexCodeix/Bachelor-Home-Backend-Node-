import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MealType } from '@prisma/client';

class WeeklyRoutineItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @IsEnum(MealType, { message: 'mealType must be a valid meal type' })
  mealType: MealType;

  @IsBoolean()
  isEnabled: boolean;
}

export class SetWeeklyRoutineDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WeeklyRoutineItemDto)
  items: WeeklyRoutineItemDto[];
}