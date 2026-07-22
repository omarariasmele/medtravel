import {
  Body,
  Controller,
  NotImplementedException,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { LoginDto } from './dto/login.dto';

/**
 * Login/refresh quedan como stub a propósito: core.users tiene RLS
 * habilitada y forzada pero SIN política SELECT (003_core_identity.sql) —
 * buscar un usuario por email_blind_index para autenticarlo requiere una
 * función SECURITY DEFINER (mismo patrón que clinical.has_clinical_access)
 * que todavía no existe en el schema aprobado v1.2.3. Implementar eso es
 * trabajo de schema + backend coordinado, no algo para resolver silenciosamente
 * acá en el scaffold.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  @Post('login')
  login(@Body() _dto: LoginDto): never {
    throw new NotImplementedException(
      'Login pendiente: requiere una función SECURITY DEFINER en el schema ' +
        'para resolver core.users por email_blind_index bajo RLS.',
    );
  }

  @Post('refresh')
  refresh(): never {
    throw new NotImplementedException(
      'Refresh de sesión pendiente de implementar.',
    );
  }
}
