import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateMessDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'ownerPhoneNumber must be a valid phone number' })
  ownerPhoneNumber: string;

  @IsString()
  @IsNotEmpty()
  district: string;

  @IsString()
  @IsNotEmpty()
  subDistrict: string;

  @IsString()
  @IsNotEmpty()
  thana: string;

  @IsString()
  @IsNotEmpty()
  fullAddress: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  capacity: number;
}
