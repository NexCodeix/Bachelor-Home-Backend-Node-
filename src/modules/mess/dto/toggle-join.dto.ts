import { IsBoolean } from 'class-validator';

export class ToggleJoinDto {
  @IsBoolean()
  isJoinEnabled: boolean;
}
