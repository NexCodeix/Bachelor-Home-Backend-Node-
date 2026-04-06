import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum MemberActivityFilter {
  ALL = 'all',
  REQUEST = 'request',
  CHANGE = 'change',
}

export class MemberActivityQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsOptional()
  @IsEnum(MemberActivityFilter)
  filter?: MemberActivityFilter;
}