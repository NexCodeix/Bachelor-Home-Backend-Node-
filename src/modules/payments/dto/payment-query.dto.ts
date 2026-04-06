import { Type } from 'class-transformer';
import { PaymentStatus, ReturnRequestStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class PaymentQueryDto {
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
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsEnum(ReturnRequestStatus)
  returnStatus?: ReturnRequestStatus;

  @IsOptional()
  @IsUUID()
  memberId?: string;
}
