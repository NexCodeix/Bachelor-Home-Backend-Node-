import { PartialType } from '@nestjs/mapped-types';
import { Role } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class AdminUpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
