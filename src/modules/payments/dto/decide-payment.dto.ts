import {
  IsIn,
  IsOptional,
  IsString,
  IsEnum,
  MaxLength,
  IsNumber,
  Min,
} from 'class-validator';
import { ReturnMethod, ReturnTransferTarget } from '@prisma/client';
import { Type } from 'class-transformer';

export class DecidePaymentDto {
  @IsIn(['APPROVED', 'REJECTED'])
  action: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  managerNote?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  returnAmount?: number;

  @IsOptional()
  @IsEnum(ReturnMethod)
  returnMethod?: ReturnMethod;

  @IsOptional()
  @IsEnum(ReturnTransferTarget)
  returnTransferTarget?: ReturnTransferTarget;
}
