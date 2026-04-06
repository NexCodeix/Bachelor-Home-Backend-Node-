import { AttendanceStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class MarkAttendanceDto {
  @IsEnum([AttendanceStatus.GOT_MEAL, AttendanceStatus.DID_NOT_GET], {
    message: 'status must be either GOT_MEAL or DID_NOT_GET',
  })
  status: 'GOT_MEAL' | 'DID_NOT_GET';
}