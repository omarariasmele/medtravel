import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import { UpdateProfileDto } from './dto/update-profile.dto';

/**
 * "Yo mismo" — a diferencia de /identity/persons (CRUD genérico, pide
 * el :id), acá el :id nunca aparece en la URL: siempre es el propio
 * personId del JWT. persons_self_access (RLS) ya exige
 * id = current_person_id, así que esto es solo una comodidad de API
 * para el cliente móvil/web, no una relajación de seguridad.
 */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/profile')
export class MeProfileController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get()
  async get(@CurrentContext() context: RequestContextData) {
    const row = await this.txManager.runInTransaction(async (queryRunner) => {
      const rows = await queryRunner.query(
        `SELECT id, core.decrypt_pii(first_name) AS first_name,
                core.decrypt_pii(last_name) AS last_name, birth_date, gender_id,
                nationality_id, country_residence_id, preferred_lang, timezone
         FROM core.persons WHERE id = $1`,
        [context.personId],
      );
      return rows[0];
    });

    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  @Put()
  async update(
    @CurrentContext() context: RequestContextData,
    @Body() dto: UpdateProfileDto,
  ) {
    await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `UPDATE core.persons SET
           first_name     = COALESCE(core.encrypt_pii($2), first_name),
           last_name      = COALESCE(core.encrypt_pii($3), last_name),
           birth_date     = COALESCE($4, birth_date),
           preferred_lang = COALESCE($5, preferred_lang),
           timezone       = COALESCE($6, timezone)
         WHERE id = $1`,
        [
          context.personId,
          dto.firstName ?? null,
          dto.lastName ?? null,
          dto.birthDate ?? null,
          dto.preferredLang ?? null,
          dto.timezone ?? null,
        ],
      ),
    );
    return this.get(context);
  }
}
