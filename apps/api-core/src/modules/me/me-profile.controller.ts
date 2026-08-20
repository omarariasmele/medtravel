import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { unlink } from 'fs/promises';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { mapPgError } from '@common/database/pg-error.mapper';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';
import { AuthService } from '@modules/auth/auth.service';

import { UpdateProfileDto } from './dto/update-profile.dto';

const AVATARS_DIR = join(process.cwd(), 'uploads', 'avatars');
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

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
  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly config: ConfigService,
    private readonly authService: AuthService,
  ) {}

  private blindIndex(value: string): string {
    const key = this.config.get<string>('DB_BLIND_INDEX_KEY')!;
    return createHmac('sha256', key)
      .update(value.trim().toLowerCase())
      .digest('hex');
  }

  @Get()
  async get(@CurrentContext() context: RequestContextData) {
    const row = await this.txManager.runInTransaction(async (queryRunner) => {
      const rows = await queryRunner.query(
        `SELECT id, core.decrypt_pii(first_name) AS first_name,
                core.decrypt_pii(last_name) AS last_name, birth_date, gender_id,
                nationality_id, country_residence_id, preferred_lang, timezone,
                photo_path, health_record_last_updated_at
         FROM core.persons WHERE id = $1`,
        [context.personId],
      );
      return rows[0];
    });

    if (!row) {
      throw new NotFoundException();
    }

    const [phoneRow] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`SELECT * FROM core.get_user_phone($1)`, [
        context.userId,
      ]),
    );

    const [emailRow] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`SELECT core.get_user_email($1) AS email`, [
        context.userId,
      ]),
    );

    return {
      ...row,
      email: emailRow?.email ?? null,
      phone: phoneRow?.phone ?? null,
      phone_verified: phoneRow?.phone_verified ?? false,
      email_verified: phoneRow?.email_verified ?? false,
    };
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
           timezone       = COALESCE($6, timezone),
           gender_id      = COALESCE($7, gender_id)
         WHERE id = $1`,
        [
          context.personId,
          dto.firstName ?? null,
          dto.lastName ?? null,
          dto.birthDate ?? null,
          dto.preferredLang ?? null,
          dto.timezone ?? null,
          dto.genderId ?? null,
        ],
      ),
    );

    if (dto.phone) {
      const phoneIdx = this.blindIndex(dto.phone);
      await this.txManager.runInTransaction((queryRunner) =>
        queryRunner.query(`SELECT core.update_user_phone($1, $2, $3)`, [
          context.userId,
          dto.phone,
          phoneIdx,
        ]),
      );
    }

    // Pedido explícito del usuario: si se equivocó al cargar el mail
    // tiene que poder entrar a corregirlo. core.update_user_email
    // resetea email_verified a FALSE sola (mismo criterio que el
    // teléfono) — de paso se manda un código nuevo a la dirección
    // recién cargada, nunca a la vieja.
    if (dto.email) {
      const [currentEmailRow] = await this.txManager.runInTransaction((queryRunner) =>
        queryRunner.query(`SELECT core.get_user_email($1) AS email`, [context.userId]),
      );
      const currentEmail = (currentEmailRow?.email as string | null)?.trim().toLowerCase();
      const newEmail = dto.email.trim().toLowerCase();
      if (currentEmail !== newEmail) {
        const emailIdx = this.blindIndex(dto.email);
        try {
          await this.txManager.runInTransaction((queryRunner) =>
            queryRunner.query(`SELECT core.update_user_email($1, $2, $3)`, [
              context.userId,
              dto.email,
              emailIdx,
            ]),
          );
        } catch (error) {
          mapPgError(error);
        }
        await this.authService.resendVerificationCode(context.userId!);
      }
    }

    return this.get(context);
  }

  /**
   * Primera subida de archivos real de la app — disco local del
   * servidor (uploads/avatars/, gitignored), servido después solo por
   * un endpoint autenticado (clinical/patient-photo, nunca un
   * directorio estático público: es un dato personal, no un asset). El
   * nombre en disco es un UUID random, no depende del personId (evita
   * cualquier dependencia de orden entre el guard JWT y el multer
   * storage engine, que corren en fases distintas del pipeline).
   */
  @Post('photo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: AVATARS_DIR,
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(new BadRequestException('Solo se aceptan imágenes JPG o PNG'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadPhoto(
    @CurrentContext() context: RequestContextData,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Falta el archivo');
    }

    const previous = await this.txManager.runInTransaction(async (queryRunner) => {
      const [row] = await queryRunner.query(
        `SELECT photo_path FROM core.persons WHERE id = $1`,
        [context.personId],
      );
      await queryRunner.query(
        `UPDATE core.persons SET photo_path = $2 WHERE id = $1`,
        [context.personId, file.filename],
      );
      return row?.photo_path as string | null | undefined;
    });

    if (previous) {
      await unlink(join(AVATARS_DIR, previous)).catch(() => undefined);
    }

    return { photoPath: file.filename };
  }
}
