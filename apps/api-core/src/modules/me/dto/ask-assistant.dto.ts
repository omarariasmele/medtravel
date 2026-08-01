import { IsString, MinLength } from 'class-validator';

export class AskAssistantDto {
  @IsString()
  @MinLength(2)
  question: string;
}
