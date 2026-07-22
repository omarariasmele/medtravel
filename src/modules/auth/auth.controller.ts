import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { TokenPairDto } from './dto/token-pair.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Límite propio, más estricto que el global (ThrottlerModule.forRoot en
   * app.module.ts) — el lockout de AuthService actúa sobre la cuenta
   * (por user_id), esto actúa sobre la IP, para frenar fuerza bruta
   * probando muchos emails distintos.
   */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @ApiOperation({ summary: 'Autentica un core.users por email + password' })
  @ApiOkResponse({ type: TokenPairDto })
  login(@Body() dto: LoginDto): Promise<TokenPairDto> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Emite un nuevo access token a partir de un refresh token válido',
  })
  @ApiOkResponse({ type: TokenPairDto })
  refresh(@Body() dto: RefreshDto): Promise<TokenPairDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoca la sesión actual (core.security_sessions)' })
  logout(
    @CurrentContext() context: RequestContextData,
  ): Promise<{ ok: boolean }> {
    return this.authService.logout(context.userId!, context.sessionId!);
  }
}
