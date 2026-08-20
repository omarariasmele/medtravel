import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SynthesizeSpeechDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsString()
  voice?: string;
}
