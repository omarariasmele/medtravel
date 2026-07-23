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
import { MfaRequiredResponseDto } from './dto/mfa-required-response.dto';
import { MfaEnrollResponseDto } from './dto/mfa-enroll-response.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';

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
  login(@Body() dto: LoginDto): Promise<TokenPairDto | MfaRequiredResponseDto> {
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

  @Post('mfa/enroll')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Genera un secreto TOTP nuevo para el usuario autenticado (sin verificar todavía)',
  })
  @ApiOkResponse({ type: MfaEnrollResponseDto })
  enrollMfa(
    @CurrentContext() context: RequestContextData,
  ): Promise<MfaEnrollResponseDto> {
    return this.authService.enrollMfa(context.userId!);
  }

  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirma la inscripción MFA pendiente con un código TOTP',
  })
  verifyMfa(
    @CurrentContext() context: RequestContextData,
    @Body() dto: MfaVerifyDto,
  ): Promise<{ ok: boolean }> {
    return this.authService.verifyMfaEnrollment(context.userId!, dto.code);
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desactiva el MFA del usuario autenticado' })
  disableMfa(
    @CurrentContext() context: RequestContextData,
  ): Promise<{ ok: boolean }> {
    return this.authService.disableMfa(context.userId!);
  }

  /** Mismo límite que login: frena fuerza bruta de emails por IP. */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('password-reset/request')
  @ApiOperation({
    summary:
      'Envía un link de reset de contraseña por email si la cuenta existe',
  })
  requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
  ): Promise<{ ok: boolean }> {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('password-reset/confirm')
  @ApiOperation({
    summary:
      'Confirma el reset con el token del email y establece la nueva contraseña',
  })
  confirmPasswordReset(
    @Body() dto: ConfirmPasswordResetDto,
  ): Promise<{ ok: boolean }> {
    return this.authService.resetPassword(dto);
  }
}
