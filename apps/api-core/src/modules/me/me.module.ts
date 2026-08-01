import { Module } from '@nestjs/common';

import { AIModule } from '@modules/ai/ai.module';

import { MeProfileController } from './me-profile.controller';
import { MeCoveragesController } from './me-coverages.controller';
import { MeTripsController } from './me-trips.controller';
import { MeClinicalController } from './me-clinical.controller';
import { MeEmergencyController } from './me-emergency.controller';
import { MeEmergencyCasesController } from './me-emergency-cases.controller';
import { MeDocumentController } from './me-document.controller';
import { MeSharesController } from './me-shares.controller';
import { MeAssistantController } from './me-assistant.controller';
import { MeHealthAssistantController } from './me-health-assistant.controller';

/**
 * API mínima de cara al viajero (Paso 1 del brief, "ver pantallas
 * reales cuanto antes") — siempre scoped a "lo mío" vía el personId del
 * JWT, nunca recibe un :id de otra persona en la URL. Distinto del CRUD
 * genérico /identity, /coverage, /operations, etc. (ese sirve al lado
 * operador/admin, donde sí hace falta apuntar a un recurso ajeno con
 * permiso).
 */
@Module({
  imports: [AIModule],
  controllers: [
    MeProfileController,
    MeCoveragesController,
    MeTripsController,
    MeClinicalController,
    MeEmergencyController,
    MeEmergencyCasesController,
    MeDocumentController,
    MeSharesController,
    MeAssistantController,
    MeHealthAssistantController,
  ],
})
export class MeModule {}
