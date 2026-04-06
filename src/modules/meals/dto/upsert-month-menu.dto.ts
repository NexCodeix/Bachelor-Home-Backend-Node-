import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MealType } from '@prisma/client';

class MonthMenuItemDto {
  @IsEnum(MealType, { message: 'mealType must be a valid meal type' })
  mealType: MealType;

  @IsString()
  @IsNotEmpty()
  description: string;
}

export class UpsertMonthMenuDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MonthMenuItemDto)
  items: MonthMenuItemDto[];
}