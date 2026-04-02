import { OtpPurpose } from '@prisma/client';
import { IsEnum, IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'phoneNumber must be a valid phone number' })
  phoneNumber: string;

  @IsEnum(OtpPurpose)
  purpose: OtpPurpose;

  @IsString()
  @Length(4, 4)
  otp: string;
}
