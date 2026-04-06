import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RespondReturnRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  action: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
