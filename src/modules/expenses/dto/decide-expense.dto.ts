import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideExpenseDto {
  @IsIn(['APPROVED', 'REJECTED'])
  action: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
