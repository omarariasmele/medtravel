import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';

import { JwtPayload } from '@modules/auth/jwt-payload.interface';

/**
 * Pedido explícito del usuario: un médico que ingresa a la plataforma
 * "no debe poder ver otra cosa del sistema... solo lo que él ha
 * tratado, y no debe modificar nada". Sin esto, cualquier cuenta de
 * profesional (un core.users como cualquier otro, ver
 * professionals-registration.controller.ts) que consiguiera un JWT
 * válido podía pegarle igual a CUALQUIER endpoint que solo pidiera
 * AuthGuard('jwt') — el CRUD genérico de /clinical/:resource incluido.
 *
 * Middleware GLOBAL (no guard) a propósito: corre ANTES que cualquier
 * guard de ruta, así no depende de un orden de guards entre módulos
 * para funcionar. Decodifica el JWT SIN verificar firma (jwtService.
 * decode, no verify) — no hace falta: esto solo RESTRINGE acceso,
 * nunca lo concede, así que un token forjado/inválido igual va a
 * fallar más abajo contra el AuthGuard('jwt') real de cada ruta.
 *
 * Allowlist mínima: el propio portal del profesional, /auth (login/
 * refresh/logout — necesita poder loguearse) y el alta+claim de
 * profesionales (misma cuenta, mismo JWT recién emitido).
 */
const ALLOWED_PREFIXES = [
  '/professional/',
  '/auth/',
  '/clinical/professionals-registration',
  '/docs',
];

@Injectable()
export class ProfessionalScopeMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      let payload: JwtPayload | null = null;
      try {
        payload = this.jwtService.decode(token) as JwtPayload | null;
      } catch {
        // Token malformado — el AuthGuard('jwt') real de la ruta lo va a rechazar.
      }
      if (payload?.professionalId) {
        // req.path da '/' acá (Nest monta este middleware con
        // consumer.apply(...).forRoutes('*'), que en Express queda
        // relativo al match, no a la app) — req.originalUrl sí trae la
        // ruta real pedida.
        const path = req.originalUrl.split('?')[0];
        const allowed = ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
        if (!allowed) {
          res.status(403).json({
            statusCode: 403,
            message: 'Esta cuenta de profesional solo puede acceder al portal de profesionales.',
          });
          return;
        }
      }
    }
    next();
  }
}
