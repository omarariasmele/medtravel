import { EntityTarget, ObjectLiteral } from 'typeorm';

import { InterviewQuestionEntity } from './entities/interview-question.entity';
import { DestinationHealthInfoEntity } from './entities/destination-health-info.entity';

export const AI_REGISTRY: Record<string, EntityTarget<ObjectLiteral>> = {
  'interview-questions': InterviewQuestionEntity,
  'destination-health-info': DestinationHealthInfoEntity,
};
