import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { RequestContextStore } from './request-context.store';
import { RequestContextData } from './request-context.types';

/**
 * Construye el RequestContextData del request HTTP en curso y lo publica en
 * dos lugares:
 *  - request.medtravelContext, para @CurrentContext() en controllers.
 *  - RequestContextStore (AsyncLocalStorage), para que
 *    TenantTransactionManager lo pueda leer desde cualquier service sin
 *    recibir el request como parámetro.
 *
 * req.user lo puebla JwtAuthGuard/JwtStrategy (ver src/modules/auth). Los
 * headers x-access-purpose / x-authorization-context / x-active-case-id
 * declaran el propósito del acceso — el mismo campo que exige
 * audit.log_event() y clinical.has_clinical_access().
 */
@Injectable()
export class PgSessionContextInterceptor implements NestInterceptor {
  constructor(private readonly store: RequestContextStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user ?? {};

    const requestContext: RequestContextData = {
      userId: user.userId,
      tenantId: user.tenantId,
      personId: user.personId,
      sessionId: user.sessionId,
      clientIp: request.ip,
      accessPurpose: request.headers['x-access-purpose'],
      authorizationContext: request.headers['x-authorization-context'],
      activeCaseId: request.headers['x-active-case-id'],
      emergencyTokenActive: user.emergencyTokenActive ?? false,
      emergencyTokenPersonId: user.emergencyTokenPersonId,
    };

    request.medtravelContext = requestContext;

    let result: Observable<any>;
    this.store.run(requestContext, () => {
      result = next.handle();
    });
    return result!;
  }
}
