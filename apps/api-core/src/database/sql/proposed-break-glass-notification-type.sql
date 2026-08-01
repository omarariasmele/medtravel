-- ============================================================
-- Gap encontrado al conectar Break Glass clínico a HTTP: el trigger
-- audit.log_break_glass_access() inserta en audit.access_notifications
-- usando params.catalog_id('NOTIFICATION_TYPE', 'BREAK_GLASS_ACCESS') —
-- pero el dominio NOTIFICATION_TYPE nunca se sembró. catalog_id()
-- devuelve NULL si no encuentra el valor (no lanza error), y
-- access_notifications.notification_type es NOT NULL — es decir, el
-- primer uso real de Break Glass habría fallado con una violación de
-- constraint, nunca detectado porque el flujo nunca se había ejercitado
-- de punta a punta (el service existe desde antes, pero sin controller).
-- ============================================================

INSERT INTO params.domain_catalogs (code, name_es, name_en, description_es, allows_tenant_override, allows_custom_values, is_ordered, is_system, active)
SELECT 'NOTIFICATION_TYPE', 'Tipo de notificación', 'Notification type',
       'Tipos de notificación push/email enviadas a viajeros', FALSE, TRUE, FALSE, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs WHERE code = 'NOTIFICATION_TYPE');

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, active)
SELECT d.id, v.code, v.label_es, v.label_en, v.display_order, TRUE, TRUE
FROM params.domain_catalogs d
CROSS JOIN (VALUES
  ('BREAK_GLASS_ACCESS', 'Acceso de emergencia a historial clínico', 'Emergency access to clinical record', 1)
) AS v(code, label_es, label_en, display_order)
WHERE d.code = 'NOTIFICATION_TYPE'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = v.code
  );
