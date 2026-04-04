import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

export class JoinMessDto {
  @IsString()
  @Length(8, 8)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'inviteCode must be uppercase alphanumeric',
  })
  @Transform(({ value }) => String(value).toUpperCase())
  inviteCode: string;
}
