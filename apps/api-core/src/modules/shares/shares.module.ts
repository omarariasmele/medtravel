import { Module } from '@nestjs/common';

import { PublicSharesController } from './public-shares.controller';
import { EmergencyShareTokenGuard } from './emergency-share-token.guard';

/**
 * Portal público de "compartir historia clínica con el médico
 * tratante" (QR/link) — deliberadamente separado de MeModule/ClinicalModule:
 * sus rutas bajo /public/shares/* nunca llevan AuthGuard('jwt'), y
 * conviene que quede obvio con solo mirar los imports de este módulo
 * que ninguno de sus controllers requiere sesión.
 */
@Module({
  controllers: [PublicSharesController],
  providers: [EmergencyShareTokenGuard],
})
export class SharesModule {}
