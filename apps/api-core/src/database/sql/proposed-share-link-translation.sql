-- ============================================================
-- Pedido explícito del usuario: al compartir la Ficha de Salud por
-- QR/link, poder elegir el idioma de destino — la IA traduce el
-- contenido antes de mostrarlo, UNA sola vez al generar el link (no en
-- cada vista, el link ya es de corta duración) — ver
-- MeSharesController.createDoctorInvite / OpenAIProvider.translateSharedProfile.
-- ============================================================

ALTER TABLE emergency.tokens
  ADD COLUMN IF NOT EXISTS translated_profile JSONB,
  ADD COLUMN IF NOT EXISTS translated_language VARCHAR(5);
