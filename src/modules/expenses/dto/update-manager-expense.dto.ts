import { PartialType } from '@nestjs/mapped-types';
import { CreateManagerExpenseDto } from './create-manager-expense.dto';

export class UpdateManagerExpenseDto extends PartialType(CreateManagerExpenseDto) {}
