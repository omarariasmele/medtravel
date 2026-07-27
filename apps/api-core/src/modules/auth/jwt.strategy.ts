import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { JwtPayload } from './jwt-payload.interface';

/**
 * El objeto devuelto acá queda en request.user, que
 * PgSessionContextInterceptor lee para construir el RequestContext (y de
 * ahí las GUCs de sesión de Postgres). No devolver el payload crudo del
 * JWT sin mapear — los nombres de campo deben calzar con
 * RequestContextData.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      personId: payload.personId,
      sessionId: payload.sessionId,
      emergencyTokenActive: payload.emergencyTokenActive ?? false,
      emergencyTokenPersonId: payload.emergencyTokenPersonId,
    };
  }
}
