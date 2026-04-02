import { OtpPurpose } from '@prisma/client';
import { IsEnum, IsString, Matches } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'phoneNumber must be a valid phone number' })
  phoneNumber: string;

  @IsEnum(OtpPurpose)
  purpose: OtpPurpose;
}
