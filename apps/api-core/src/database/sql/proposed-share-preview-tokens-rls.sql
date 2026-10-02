-- ============================================================
-- Bug real reportado en vivo: "Probar flujo completo" en la vista
-- previa "como la vería el médico" (share-preview.page.tsx) tiraba
-- "No se pudo generar el link de prueba" — el log del backend mostraba
-- "el nuevo registro viola la política de seguridad de registros para
-- la tabla «tokens»" (RLS).
--
-- Causa: la política tokens_insert de emergency.tokens solo dejaba
-- crear un token si member_id/person_id pertenecían al USUARIO
-- AUTENTICADO (pensada solo para /me/shares, donde el viajero crea su
-- propio link). SharePreviewController.generateLink es un OPERADOR
-- creando un token para OTRA persona (el viajero que está previendo) —
-- un caso legítimo (mismo acceso clínico que ya lo dejó ver la ficha,
-- ver SharePreviewController.get) que la política nunca contempló.
--
-- Fix: reusar clinical.has_clinical_access(person_id) — la misma
-- función SECURITY DEFINER que ya gatea el resto del acceso clínico
-- (titular, token de emergencia activo, break-glass, admin de
-- plataforma, consentimiento, caso de emergencia activo) — en vez de
-- duplicar una condición aparte. Cubre el caso ya soportado (el
-- viajero crea su propio token, caso 1 de la función) y agrega el que
-- faltaba (operador con acceso clínico legítimo).
-- ============================================================

ALTER POLICY tokens_insert ON emergency.tokens
  WITH CHECK (clinical.has_clinical_access(person_id));
