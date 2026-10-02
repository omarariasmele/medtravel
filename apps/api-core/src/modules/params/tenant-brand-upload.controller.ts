import { BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';

import { ConfigAccessGuard } from '@common/auth/config-access.guard';

export const TENANT_BRANDS_DIR = join(process.cwd(), 'uploads', 'tenant-brands');
if (!existsSync(TENANT_BRANDS_DIR)) mkdirSync(TENANT_BRANDS_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

/**
 * Fase 1 — pedido explícito del usuario: subir el logo como archivo,
 * no solo pegar una URL, con formato validado por el sistema (antes
 * era un TextField libre, sin ninguna garantía de que lo pegado fuera
 * siquiera una imagen). A diferencia de AVATARS_DIR (foto de perfil,
 * dato personal, servida solo autenticada vía patient-photo.controller),
 * el logo de una empresa no es sensible — se sirve como archivo
 * estático público (ver useStaticAssets en main.ts) para que tanto
 * admin-web como la app mobile (Image.network, sin poder mandar
 * headers de auth en cada request de imagen) lo puedan mostrar directo.
 */
@ApiTags('params/admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ConfigAccessGuard)
@Controller('params/admin/tenant-brand-assets')
export class TenantBrandUploadController {
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: TENANT_BRANDS_DIR,
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(new BadRequestException('Solo se aceptan imágenes PNG, JPG o WEBP (máx. 2MB)'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Falta el archivo');
    }
    return { url: `/uploads/tenant-brands/${file.filename}` };
  }
}
