import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { RequestContextData } from './request-context.types';

/**
 * Inyecta en un handler de controller el RequestContextData ya resuelto por
 * PgSessionContextInterceptor (request.medtravelContext).
 */
export const CurrentContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContextData => {
    const request = ctx.switchToHttp().getRequest();
    return request.medtravelContext ?? {};
  },
);
