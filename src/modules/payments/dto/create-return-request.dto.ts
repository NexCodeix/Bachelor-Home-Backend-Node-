import { Type } from 'class-transformer';
import { ReturnMethod, ReturnTransferTarget } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReturnRequestDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsEnum(ReturnMethod)
  method: ReturnMethod;

  @IsOptional()
  @IsEnum(ReturnTransferTarget)
  transferTarget?: ReturnTransferTarget;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  managerNote?: string;
}
