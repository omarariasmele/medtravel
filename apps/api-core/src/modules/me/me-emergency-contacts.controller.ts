import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import { CreateEmergencyContactDto } from './dto/create-emergency-contact.dto';
import { UpdateEmergencyContactDto } from './dto/update-emergency-contact.dto';

const MAX_ACTIVE_CONTACTS = 3;

/**
 * Contactos de emergencia del propio viajero — reusa core.member_contacts
 * tal cual (no una tabla nueva), pero cargados por person_id directo
 * (gap #37): un viajero sin core.members (sin cobertura) también puede
 * tener sus 3 contactos, igual que ya puede tener alergias/medicamentos
 * propios. phone se cifra + blind index explícitos acá (no CRUD
 * genérico), mismo criterio que me-document.controller.ts.
 */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/emergency-contacts')
export class MeEmergencyContactsController {
  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly config: ConfigService,
  ) {}

  private blindIndex(value: string): string {
    const key = this.config.get<string>('DB_BLIND_INDEX_KEY')!;
    return createHmac('sha256', key)
      .update(value.trim().toLowerCase())
      .digest('hex');
  }

  @Get()
  async list(@CurrentContext() context: RequestContextData) {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT id, first_name, last_name, core.decrypt_pii(phone) AS phone,
                relationship_type_id, active
         FROM core.member_contacts
         WHERE person_id = $1 AND active = TRUE
         ORDER BY contact_priority, created_at`,
        [context.personId],
      ),
    );
  }

  @Post()
  async create(
    @CurrentContext() context: RequestContextData,
    @Body() dto: CreateEmergencyContactDto,
  ) {
    const phoneIdx = this.blindIndex(dto.phone);

    return this.txManager.runInTransaction(async (queryRunner) => {
      const [{ count }] = await queryRunner.query(
        `SELECT COUNT(*)::int AS count FROM core.member_contacts
         WHERE person_id = $1 AND active = TRUE`,
        [context.personId],
      );
      if (count >= MAX_ACTIVE_CONTACTS) {
        throw new BadRequestException(
          `Ya cargaste el máximo de ${MAX_ACTIVE_CONTACTS} contactos de emergencia`,
        );
      }

      const [row] = await queryRunner.query(
        `INSERT INTO core.member_contacts
           (person_id, first_name, last_name, phone, phone_blind_index,
            relationship_type_id, is_emergency_contact)
         VALUES ($1, $2, $3, core.encrypt_pii($4), $5, $6, TRUE)
         RETURNING id, first_name, last_name, relationship_type_id, active`,
        [
          context.personId,
          dto.firstName,
          dto.lastName,
          dto.phone,
          phoneIdx,
          dto.relationshipTypeId,
        ],
      );
      return row;
    });
  }

  @Patch(':id')
  async update(
    @CurrentContext() context: RequestContextData,
    @Param('id') id: string,
    @Body() dto: UpdateEmergencyContactDto,
  ) {
    const phoneIdx = dto.phone ? this.blindIndex(dto.phone) : null;

    return this.txManager.runInTransaction(async (queryRunner) => {
      const [existing] = await queryRunner.query(
        `SELECT id FROM core.member_contacts WHERE id = $1 AND person_id = $2`,
        [id, context.personId],
      );
      if (!existing) {
        throw new NotFoundException('Contacto no encontrado');
      }

      const [row] = await queryRunner.query(
        `UPDATE core.member_contacts SET
           first_name           = COALESCE($3, first_name),
           last_name            = COALESCE($4, last_name),
           phone                = COALESCE(core.encrypt_pii($5), phone),
           phone_blind_index    = COALESCE($6, phone_blind_index),
           relationship_type_id = COALESCE($7, relationship_type_id),
           active               = COALESCE($8, active),
           updated_at           = NOW()
         WHERE id = $1 AND person_id = $2
         RETURNING id, first_name, last_name, relationship_type_id, active`,
        [
          id,
          context.personId,
          dto.firstName ?? null,
          dto.lastName ?? null,
          dto.phone ?? null,
          phoneIdx,
          dto.relationshipTypeId ?? null,
          dto.active ?? null,
        ],
      );
      return row;
    });
  }
}
