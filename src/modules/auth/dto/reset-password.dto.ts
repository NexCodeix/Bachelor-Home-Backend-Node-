import { IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'phoneNumber must be a valid phone number' })
  phoneNumber: string;

  @IsString()
  resetToken: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
