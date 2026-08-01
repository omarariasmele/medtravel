import { IsString, MinLength } from 'class-validator';

export class ClaimShareNoteDto {
  @IsString()
  @MinLength(10)
  claimToken: string;
}
