export class MfaEnrollResponseDto {
  /** Se muestra solo esta vez — no se puede volver a leer una vez cifrado en la base. */
  secret: string;
  /** otpauth://... — para generar el QR del lado del cliente. */
  otpauthUrl: string;
}
