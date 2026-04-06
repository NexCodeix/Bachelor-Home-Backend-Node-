import { Type } from 'class-transformer';
import { ExpenseStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ExpenseQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @IsOptional()
  @IsUUID()
  memberId?: string;
}
