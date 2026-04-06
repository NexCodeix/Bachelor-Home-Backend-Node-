import { PartialType } from '@nestjs/mapped-types';
import { CreateMealRequestDto } from './create-meal-request.dto';

export class UpdateMealRequestDto extends PartialType(CreateMealRequestDto) {}