-- ============================================================
-- Gap #43: core.tenants no distinguía "empresa de asistencia al
-- viajero real" (AXA, Universal Assistance, Assit Card) de OYSGROUP,
-- que es el administrador general de la plataforma, no una empresa de
-- asistencia — pedido explícito del usuario tras ver que "Pólizas"
-- mostraba OYSGROUP como si fuera una opción normal de empresa (porque
-- el operador de prueba pertenece al tenant OYSGROUP, y coverage/
-- partner-records.controller.ts SIEMPRE usa el tenant propio del
-- operador al cargar una póliza — por diseño, para que una empresa
-- nunca pueda cargar pólizas a nombre de otra; eso no se toca acá).
-- ============================================================

ALTER TABLE core.tenants
  ADD COLUMN is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE core.tenants SET is_platform_admin = TRUE WHERE code = 'DEMO95D141E1';
