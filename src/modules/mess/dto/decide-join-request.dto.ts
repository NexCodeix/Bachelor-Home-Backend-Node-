import { IsEnum } from 'class-validator';
import { MessJoinRequestStatus } from '@prisma/client';

export class DecideJoinRequestDto {
  @IsEnum([MessJoinRequestStatus.APPROVED, MessJoinRequestStatus.REJECTED], {
    message: 'action must be either APPROVED or REJECTED',
  })
  action: 'APPROVED' | 'REJECTED';
}
