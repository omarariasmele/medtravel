import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateAppSettingDto {
  @IsString()
  @IsNotEmpty()
  value: string;
}
