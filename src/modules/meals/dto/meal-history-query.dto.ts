import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum ManagerMealHistoryScope {
  OWN = 'OWN',
  MEMBER = 'MEMBER',
  ALL = 'ALL',
  GUEST = 'GUEST',
}

export class MealHistoryQueryDto {
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

  @IsOptional()
  @IsEnum(ManagerMealHistoryScope)
  scope?: ManagerMealHistoryScope;

  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsString()
  filter?: string;
}