import { PartialType } from '@nestjs/mapped-types';
import { SubmitPaymentDto } from './submit-payment.dto';

export class UpdateMemberPaymentDto extends PartialType(SubmitPaymentDto) {}
