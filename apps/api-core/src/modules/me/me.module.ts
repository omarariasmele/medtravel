import { Module } from '@nestjs/common';

import { MeProfileController } from './me-profile.controller';
import { MeCoveragesController } from './me-coverages.controller';
import { MeTripsController } from './me-trips.controller';
import { MeClinicalController } from './me-clinical.controller';
import { MeEmergencyController } from './me-emergency.controller';

/**
 * API mínima de cara al viajero (Paso 1 del brief, "ver pantallas
 * reales cuanto antes") — siempre scoped a "lo mío" vía el personId del
 * JWT, nunca recibe un :id de otra persona en la URL. Distinto del CRUD
 * genérico /identity, /coverage, /operations, etc. (ese sirve al lado
 * operador/admin, donde sí hace falta apuntar a un recurso ajeno con
 * permiso).
 */
@Module({
  controllers: [
    MeProfileController,
    MeCoveragesController,
    MeTripsController,
    MeClinicalController,
    MeEmergencyController,
  ],
})
export class MeModule {}
