import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class HealthChatDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

export class ProposalActionParamsDto {
  @IsUUID()
  id: string;
}
