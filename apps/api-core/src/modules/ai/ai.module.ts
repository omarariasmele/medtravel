import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ParamsModule } from '@modules/params/params.module';

import { OpenAIProvider } from './providers/openai.provider';
import { AIService } from './ai.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { AiAdminResourceController } from './ai-admin-resource.controller';
import { DestinationHealthInfoAdminController } from './destination-health-info-admin.controller';
import { InterviewQuestionEntity } from './entities/interview-question.entity';

@Module({
  imports: [ParamsModule, TypeOrmModule.forFeature([InterviewQuestionEntity])],
  controllers: [KnowledgeBaseController, AiAdminResourceController, DestinationHealthInfoAdminController],
  providers: [OpenAIProvider, AIService],
  exports: [AIService],
})
export class AIModule {}
