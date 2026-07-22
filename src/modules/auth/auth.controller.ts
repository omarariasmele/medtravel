import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { TokenPairDto } from './dto/token-pair.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
