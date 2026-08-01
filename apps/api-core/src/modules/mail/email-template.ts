import { join } from 'path';
import type { Attachment } from 'nodemailer/lib/mailer';

/**
 * Content-ID de la imagen del logo — así el HTML puede referenciarla como
 * `<img src="cid:...">` sin depender de una URL pública (el sitio
 * www.medtravelapp.com.ar todavía no existe). El logo viaja adjunto en
 * cada envío, no se linkea a nada externo.
 */
export const LOGO_CID = 'medtravelapp-logo';

/**
 * En dev corre con ts-node sobre src/, en prod con el JS compilado en
 * dist/ — nest-cli.json copia este PNG a dist/modules/mail/assets/ en el
 * build (ver "assets" en nest-cli.json), así que __dirname apunta al
 * lugar correcto en ambos casos sin lógica condicional.
 *
 * Usa la variante blanca del logo porque el encabezado tiene fondo verde
 * institucional (#0F6E5B) — el logo a color no se lee bien ahí.
 */
export function logoAttachment(): Attachment {
  return {
    filename: 'medtravelapp-logo.png',
    path: join(__dirname, 'assets', 'logo-horizontal-blanco.png'),
    cid: LOGO_CID,
  };
}

/**
 * Envuelve el contenido de cada mail del sistema (reset de contraseña,
 * notificaciones, prueba de configuración SMTP) en una plantilla
 * institucional común — mismo logo y pie en todos los envíos, pedido del
 * usuario para que los correos se vean "más institucionales" en vez de
 * texto suelto. Basada en tablas con estilos inline (no CSS externo ni
 * flexbox/grid) porque son lo único que se renderiza de forma consistente
 * en clientes de correo (Outlook desktop en particular ignora casi todo
 * lo demás); el ancho fluido (100% con max-width) es lo que la hace
 * legible tanto en el mail de una compu como en el celular sin necesitar
 * media queries.
 *
 * Bilingüe (ES/EN) a propósito: todavía no hay forma de saber en qué
 * idioma prefiere leer cada destinatario (aunque `core.users.preferred_lang`
 * ya existe en el schema para eso), así que en vez de asumir español se
 * manda el mismo contenido en los dos idiomas. El día que haya un agente
 * de IA armando estos mensajes según el idioma del viajero, `bodyHtml` se
 * arma en un solo idioma leyendo `preferred_lang` y este wrapper no
 * necesita cambiar.
 */
export function renderEmailHtml(bodyHtml: string): string {
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MedTravelApp</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f2f4f3; font-family:Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f3; padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#ffffff; border-radius:8px; overflow:hidden;">
            <tr>
              <td align="center" style="background-color:#0F6E5B; padding:24px 16px;">
                <img src="cid:${LOGO_CID}" alt="MedTravelApp" height="36" style="height:36px; width:auto; display:block; border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px; color:#222222; font-size:15px; line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px; background-color:#f7f8f8; border-top:1px solid #e6e8e7; text-align:center;">
                <p style="margin:0 0 4px; font-size:13px; font-weight:bold; color:#0F6E5B;">MedTravelApp</p>
                <p style="margin:0 0 4px; font-size:12px; color:#666666;">
                  Asistencia al viajero — plataforma administrada por OYSGROUP<br />
                  Travel assistance — platform managed by OYSGROUP
                </p>
                <p style="margin:0 0 8px; font-size:12px;">
                  <a href="https://www.medtravelapp.com.ar" style="color:#0F6E5B; text-decoration:none;">www.medtravelapp.com.ar</a>
                </p>
                <p style="margin:0; font-size:11px; color:#999999;">
                  © ${year} MedTravelApp. Este es un mensaje automático — por favor no respondas a este correo.<br />
                  This is an automated message — please do not reply.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
