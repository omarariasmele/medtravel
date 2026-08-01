import { Module } from '@nestjs/common';

import { OpenAIProvider } from './providers/openai.provider';
import { AIService } from './ai.service';

@Module({
  providers: [OpenAIProvider, AIService],
  exports: [AIService],
})
export class AIModule {}
