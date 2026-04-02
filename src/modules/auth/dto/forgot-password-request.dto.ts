import { IsString, Matches } from 'class-validator';

export class ForgotPasswordRequestDto {
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber: string;
}
