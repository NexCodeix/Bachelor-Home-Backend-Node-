import { Type } from 'class-transformer';
import { PaymentCategory } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class SubmitPaymentDto {
  @IsDateString()
  paymentDate: string;

  @IsEnum(PaymentCategory)
  category: PaymentCategory;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  returnAmountRequested?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  payableAmount?: number;
}
