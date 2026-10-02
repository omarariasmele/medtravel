import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/text_normalize.dart';
import '../../core/auth_state.dart';
import '../../core/catalog_service.dart';
import '../../l10n/app_strings.dart';
import '../assistant/health_assistant_screen.dart' show healthDataVersion, openHealthAssistant;
import 'documents_screen.dart' show DocumentsTab;

/// Sin esto, un GET que falla (servidor caído, `adb reverse` perdido,
/// token vencido) deja `_loading` en true para siempre — la pantalla
/// gira sin parar y sin mostrar ningún mensaje (reportado en vivo).
/// Pedido explícito del usuario: las fechas se mostraban en crudo, formato
/// ISO ("2026-01-09") — siempre con "/" y en formato día/mes/año (el uso
/// habitual en Argentina/Latinoamérica, la base de usuarios actual).
/// Adaptar el orden día/mes según país de registro del usuario que mira
/// queda pendiente — no hay hoy ningún lugar donde se registre ese país.
String _formatDate(DateTime date) =>
    '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';

String _formatIsoDate(String iso) {
  final datePart = iso.split('T').first;
  final parts = datePart.split('-');
  if (parts.length != 3) return datePart;
  return '${parts[2]}/${parts[1]}/${parts[0]}';
}

String _errorMessage(Object error, String fallback) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map && data['message'] is String) {
      return data['message'] as String;
    }
    if (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout) {
      return 'No se pudo conectar al servidor. Revisá tu conexión e intentá de nuevo.';
    }
  }
  return fallback;
}

/// Pedido explícito del usuario: los antecedentes (alergias, comorbilidades,
/// cirugías, medicamentos, implantes) se veían como una fila de texto plano
/// ("10/02/2022  Diabetes Tipo 1") — se reemplaza por una tarjeta con ícono
/// por categoría, el dato destacado, una etiqueta de estado/tipo, y la
/// fecha como texto secundario. Un solo widget reutilizado en las 5 tabs
/// de antecedentes para que se vea consistente.
/// Pedido explícito del usuario: mostrar en Condiciones/Medicamentos si
/// un antecedente cargado por un profesional está pendiente de
/// confirmación (o ya se confirmó, por el titular o por la plataforma)
/// — mismo mapeo que ya usa _EncounterCard en Atenciones recibidas,
/// centralizado acá para no repetirlo tres veces.
({String label, Color bg, Color color})? recordConfirmationBadge(
  BuildContext context, {
  required String? confirmationCode,
  required bool certified,
}) {
  if (certified) {
    return (label: context.tr('health.encounter.certifiedBadge'), bg: _RecordColors.conditionBg, color: _RecordColors.conditionIcon);
  }
  switch (confirmationCode) {
    case 'MEMBER_CONFIRMED':
      return (label: context.tr('health.encounter.confirmedBadge'), bg: _RecordColors.conditionBg, color: _RecordColors.conditionIcon);
    case 'PLATFORM_CONFIRMED':
      return (label: context.tr('health.encounter.platformConfirmedBadge'), bg: _RecordColors.conditionBg, color: _RecordColors.conditionIcon);
    case 'MEMBER_CHALLENGED':
      return (label: context.tr('health.encounter.challengedBadge'), bg: _RecordColors.allergyBg, color: _RecordColors.allergyIcon);
    case 'PENDING':
      return (label: context.tr('health.encounter.pendingBadge'), bg: _RecordColors.allergyAmberBg, color: _RecordColors.allergyAmberIcon);
    default:
      // NULL — antecedente propio (SELF_DECLARED) o de la IA, nunca
      // pasa por este circuito de confirmación: no se muestra nada.
      return null;
  }
}

String? catalogCodeFor(List<CatalogValue> catalog, String? id) {
  if (id == null) return null;
  for (final c in catalog) {
    if (c.id == id) return c.code;
  }
  return null;
}

class _RecordCard extends StatelessWidget {
  const _RecordCard({
    required this.icon,
    required this.iconBackground,
    required this.iconColor,
    required this.title,
    this.badgeLabel,
    this.badgeBackground,
    this.badgeColor,
    this.secondaryBadgeLabel,
    this.secondaryBadgeBackground,
    this.secondaryBadgeColor,
    this.subtitle,
    this.onDelete,
    this.onEdit,
  });

  final IconData icon;
  final Color iconBackground;
  final Color iconColor;
  final String title;
  final String? badgeLabel;
  final Color? badgeBackground;
  final Color? badgeColor;
  final String? secondaryBadgeLabel;
  final Color? secondaryBadgeBackground;
  final Color? secondaryBadgeColor;
  final String? subtitle;
  /// Pedido explícito del usuario: poder borrar (baja lógica) un
  /// antecedente mal cargado directo desde la tarjeta.
  final VoidCallback? onDelete;
  /// Pedido explícito del usuario: poder corregir un dato mal cargado,
  /// no solo borrarlo y volver a cargarlo.
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade300, width: 0.5),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(color: iconBackground, shape: BoxShape.circle),
            child: Icon(icon, size: 17, color: iconColor),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
                    if (badgeLabel != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(color: badgeBackground, borderRadius: BorderRadius.circular(20)),
                        child: Text(
                          badgeLabel!,
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: badgeColor),
                        ),
                      ),
                    if (secondaryBadgeLabel != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(color: secondaryBadgeBackground, borderRadius: BorderRadius.circular(20)),
                        child: Text(
                          secondaryBadgeLabel!,
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: secondaryBadgeColor),
                        ),
                      ),
                  ],
                ),
                if (subtitle != null && subtitle!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(subtitle!, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                ],
              ],
            ),
          ),
          if (onEdit != null)
            IconButton(
              icon: Icon(Icons.edit_outlined, size: 20, color: Colors.grey.shade600),
              tooltip: context.tr('common.edit'),
              onPressed: onEdit,
            ),
          if (onDelete != null)
            IconButton(
              icon: Icon(Icons.delete_outline, size: 20, color: Colors.grey.shade600),
              tooltip: context.tr('common.delete'),
              onPressed: onDelete,
            ),
        ],
      ),
    );
  }
}

/// Pedido explícito del usuario: poder corregir/borrar un antecedente
/// mal cargado. Como clinical.*_no_delete bloquea el DELETE real a
/// propósito (nunca se borra un dato clínico de verdad, ver
/// proposed-clinical-edit-permission.sql), "borrar" acá es una baja
/// lógica vía PATCH deletedAt — desaparece de todas las listas y de
/// la ficha compartida, pero queda registrado que existió. Reutilizado
/// en las 5 tabs de antecedentes para no repetir el diálogo de
/// confirmación + llamada a la API cinco veces.
Future<void> _confirmAndSoftDelete({
  required BuildContext context,
  required String resource,
  required String id,
  required String itemLabel,
  required Future<void> Function() onDeleted,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(context.tr('health.deleteThisData')),
      content: Text(context.tr('health.deleteConfirmBody', params: {'item': itemLabel})),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(context.tr('common.cancel'))),
        FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(context.tr('common.delete'))),
      ],
    ),
  );
  if (confirmed != true) return;
  if (!context.mounted) return;
  final deleteErrorFallback = context.tr('health.deleteError');
  try {
    await ApiClient.instance.dio.patch('/clinical/$resource/$id', data: {
      'deletedAt': DateTime.now().toUtc().toIso8601String(),
    });
    await onDeleted();
  } catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_errorMessage(e, deleteErrorFallback))),
    );
  }
}

/// Colores por categoría — misma paleta en las 5 tabs de antecedentes para
/// que la categoría se reconozca de un vistazo (verde=comorbilidad,
/// coral=cirugía, rojo=alergia, azul=medicamento, violeta=implante).
class _RecordColors {
  static const conditionBg = Color(0xFFEAF3DE);
  static const conditionIcon = Color(0xFF27500A);
  static const surgeryBg = Color(0xFFFAECE7);
  static const surgeryIcon = Color(0xFF4A1B0C);
  static const allergyBg = Color(0xFFFCEBEB);
  static const allergyIcon = Color(0xFF501313);
  static const allergyAmberBg = Color(0xFFFAEEDA);
  static const allergyAmberIcon = Color(0xFF633806);
  static const medicationBg = Color(0xFFE6F1FB);
  static const medicationIcon = Color(0xFF042C53);
  static const implantBg = Color(0xFFEEEDFE);
  static const implantIcon = Color(0xFF26215C);
  static const treatmentBg = Color(0xFFFDE9F3);
  static const treatmentIcon = Color(0xFF5C1B40);
  static const neutralBg = Color(0xFFF1EFE8);
  static const neutralIcon = Color(0xFF444441);
  static const vitalsBg = Color(0xFFE1F5EE);
  static const vitalsIcon = Color(0xFF085041);
  static const encounterBg = Color(0xFFE8EAF6);
  static const encounterIcon = Color(0xFF283593);
}

class _LoadErrorView extends StatelessWidget {
  const _LoadErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 40, color: Colors.grey),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: Text(context.tr('common.retry'))),
          ],
        ),
      ),
    );
  }
}

/// "Ficha médica" del viajero — mismo modelo que clinical-history.section.tsx
/// en admin-web (allergies/conditions/medications con canonical_status
/// PROVISIONAL + provenance SELF_DECLARED cuando lo carga el propio
/// viajero), pero acá es la pantalla PRINCIPAL de completar datos de
/// salud, no un accesorio de un caso.
class HealthRecordsScreen extends StatefulWidget {
  const HealthRecordsScreen({super.key});

  @override
  State<HealthRecordsScreen> createState() => _HealthRecordsScreenState();
}

class _HealthRecordsScreenState extends State<HealthRecordsScreen> {
  DateTime? _lastUpdatedAt;
  int _reminderDays = 60;
  bool _loadingLastUpdated = true;
  /// Pedido explícito del usuario: "pensaba en hacer algo similar a lo
  /// que es la pantalla principal... con botones que accedan a cada
  /// sección" — antes esto era un TabBar horizontal con 9 solapas (la
  /// mayoría fuera de pantalla, había que deslizar para encontrarlas).
  /// null = mostrando el menú de botones (el "hub"); si no, es el
  /// índice de la sección abierta en _sections() más abajo.
  int? _selectedSection;

  /// Bug real reportado en vivo: corregir una alergia por voz ("polen"
  /// -> "polvo") se guardaba bien en la base (confirmado en el log del
  /// servidor: UPDATE + COMMIT, sin ningún revert) pero la pestaña de
  /// Alergias seguía mostrando el valor viejo al volver del asistente.
  /// Cada una de las 7 pestañas solo carga sus datos UNA vez, en su
  /// propio initState — HomeShell las mantiene todas vivas en un
  /// IndexedStack, así que volver acá después de usar el asistente no
  /// las reconstruye solo. Cambiar la key de cada pestaña las obliga a
  /// recrearse (y por lo tanto a recargar) apenas se vuelve del
  /// asistente — mismo problema, mismo tipo de arreglo, que el cartel
  /// de "no cargaste información" en Inicio (ver _navigateAndRefresh).
  int _reloadKey = 0;

  Future<void> _openAssistantAndReload() async {
    await openHealthAssistant(context);
    if (!mounted) return;
    setState(() => _reloadKey++);
    _loadLastUpdated();
  }

  @override
  void initState() {
    super.initState();
    _loadLastUpdated();
    // Ver el comentario de healthDataVersion en health_assistant_screen.dart:
    // esta pantalla puede estar viva en el IndexedStack de HomeShell sin
    // haber sido ella quien abrió el asistente (ej. se abrió desde
    // Inicio) — sin este listener, "Salud" nunca se enteraba de que
    // había datos nuevos.
    healthDataVersion.addListener(_onHealthDataChangedElsewhere);
  }

  void _onHealthDataChangedElsewhere() {
    if (!mounted) return;
    setState(() => _reloadKey++);
    _loadLastUpdated();
  }

  @override
  void dispose() {
    healthDataVersion.removeListener(_onHealthDataChangedElsewhere);
    super.dispose();
  }

  /// Pedido explícito del usuario: mostrar en algún lugar visible
  /// cuándo fue la última actualización del Historial de Salud, y
  /// avisar si pasaron muchos días — funciona sin importar por dónde
  /// se haya cargado el dato (chat de IA o los formularios manuales acá
  /// mismo, ver el trigger de health_record_last_updated_at).
  Future<void> _loadLastUpdated() async {
    try {
      final results = await Future.wait([
        ApiClient.instance.dio.get('/me/profile'),
        ApiClient.instance.dio.get('/params/app-settings'),
      ]);
      final profileData = results[0].data as Map<String, dynamic>;
      final settingsRows = results[1].data as List;
      final rawDate = profileData['health_record_last_updated_at'] as String?;
      final reminderSetting = settingsRows.cast<Map<String, dynamic>>().firstWhere(
            (s) => s['key'] == 'health.reminder_days',
            orElse: () => const {},
          )['value'] as String?;
      if (!mounted) return;
      setState(() {
        _lastUpdatedAt = rawDate != null ? DateTime.tryParse(rawDate) : null;
        _reminderDays = int.tryParse(reminderSetting ?? '') ?? 60;
        _loadingLastUpdated = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingLastUpdated = false);
    }
  }

  bool get _needsReminder {
    if (_lastUpdatedAt == null) return true; // nunca cargó nada todavía
    return DateTime.now().difference(_lastUpdatedAt!).inDays >= _reminderDays;
  }

  // Pedido explícito del usuario: "eliminar el título Comorbilidades de
  // todos lados, es enfermedades o enfermedades crónicas" — esta sección
  // agrupa ambas (crónicas y no crónicas), por eso queda "Enfermedades"
  // (sin "Crónicas"), igual que en admin-web. Los colores de cada botón
  // reusan la misma paleta por categoría que ya usan las tarjetas
  // adentro de cada sección (_RecordColors) — un color por sección,
  // ninguno repetido, para reconocerlas de un vistazo igual que ya se
  // reconoce cada tipo de antecedente en las tarjetas.
  List<_HealthSection> _sections(BuildContext context) => [
        _HealthSection(
          titleKey: 'health.tabAllergies',
          icon: Icons.warning_amber_outlined,
          background: _RecordColors.allergyBg,
          iconColor: _RecordColors.allergyIcon,
          builder: (key) => _AllergiesTab(key: key),
        ),
        _HealthSection(
          titleKey: 'health.tabConditions',
          icon: Icons.favorite_border,
          background: _RecordColors.conditionBg,
          iconColor: _RecordColors.conditionIcon,
          builder: (key) => _ConditionsTab(key: key),
        ),
        _HealthSection(
          titleKey: 'health.tabMedications',
          icon: Icons.medication_outlined,
          background: _RecordColors.medicationBg,
          iconColor: _RecordColors.medicationIcon,
          builder: (key) => _MedicationsTab(key: key),
        ),
        _HealthSection(
          titleKey: 'health.tabSurgeries',
          icon: Icons.healing_outlined,
          background: _RecordColors.surgeryBg,
          iconColor: _RecordColors.surgeryIcon,
          builder: (key) => _SurgeriesTab(key: key),
        ),
        _HealthSection(
          titleKey: 'health.tabImplants',
          icon: Icons.settings_input_component_outlined,
          background: _RecordColors.implantBg,
          iconColor: _RecordColors.implantIcon,
          builder: (key) => _ImplantsTab(key: key),
        ),
        _HealthSection(
          titleKey: 'health.tabTreatments',
          icon: Icons.medical_services_outlined,
          background: _RecordColors.treatmentBg,
          iconColor: _RecordColors.treatmentIcon,
          builder: (key) => _TreatmentsTab(key: key),
        ),
        _HealthSection(
          titleKey: 'health.tabVitals',
          icon: Icons.monitor_weight_outlined,
          background: _RecordColors.vitalsBg,
          iconColor: _RecordColors.vitalsIcon,
          builder: (key) => _VitalsTab(key: key),
        ),
        _HealthSection(
          titleKey: 'health.tabLabResults',
          icon: Icons.science_outlined,
          background: _RecordColors.allergyAmberBg,
          iconColor: _RecordColors.allergyAmberIcon,
          builder: (key) => _LabResultsTab(key: key),
        ),
        _HealthSection(
          titleKey: 'documents.tabTitle',
          icon: Icons.folder_open_outlined,
          background: _RecordColors.neutralBg,
          iconColor: _RecordColors.neutralIcon,
          builder: (key) => DocumentsTab(key: key),
        ),
        // Pedido explícito del usuario: "las notas [que deja un médico]
        // se deben poder visualizar... en el historial de salud... es
        // en la ficha debería ir abajo de documentos" — última sección
        // a propósito, por eso mismo.
        _HealthSection(
          titleKey: 'health.tabEncounters',
          icon: Icons.medical_information_outlined,
          background: _RecordColors.encounterBg,
          iconColor: _RecordColors.encounterIcon,
          builder: (key) => _EncountersTab(key: key),
        ),
      ];

  void _openSection(int index) => setState(() => _selectedSection = index);
  void _backToHub() => setState(() => _selectedSection = null);

  @override
  Widget build(BuildContext context) {
    final sections = _sections(context);
    final selected = _selectedSection;
    return PopScope<Object?>(
      canPop: selected == null,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        _backToHub();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: selected != null
              ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: _backToHub)
              : null,
          title: Text(selected != null ? context.tr(sections[selected].titleKey) : context.tr('health.title')),
          actions: [
            IconButton(
              icon: const Icon(Icons.health_and_safety_outlined),
              tooltip: context.tr('home.updateHealthTitle'),
              onPressed: _openAssistantAndReload,
            ),
          ],
        ),
        body: Column(
          children: [
            if (!_loadingLastUpdated) _LastUpdatedBanner(
              lastUpdatedAt: _lastUpdatedAt,
              needsReminder: _needsReminder,
              onUpdatePressed: _openAssistantAndReload,
            ),
            Expanded(
              child: selected == null
                  ? ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: sections.length,
                      itemBuilder: (context, i) => _HealthSectionButton(
                        section: sections[i],
                        onTap: () => _openSection(i),
                      ),
                    )
                  : sections[selected].builder(ValueKey('${sections[selected].titleKey}-$_reloadKey')),
            ),
          ],
        ),
      ),
    );
  }
}

/// Ver el comentario de _sections() arriba — un botón del menú principal
/// de Historial de Salud. `builder` recibe la key de recarga (mismo
/// mecanismo de ValueKey que ya usaba TabBarView para forzar recarga al
/// volver del asistente, ver _reloadKey) para construir el widget de la
/// sección recién cuando se abre, no de entrada — cada sección sigue
/// cargando sus propios datos sola, como antes.
class _HealthSection {
  const _HealthSection({
    required this.titleKey,
    required this.icon,
    required this.background,
    required this.iconColor,
    required this.builder,
  });

  final String titleKey;
  final IconData icon;
  final Color background;
  final Color iconColor;
  final Widget Function(Key key) builder;
}

/// Mismo estilo que _QuickAction de home_screen.dart — pedido explícito
/// del usuario: "algo similar a lo que es la pantalla principal... con
/// botones que accedan a cada sección".
class _HealthSectionButton extends StatelessWidget {
  const _HealthSectionButton({required this.section, required this.onTap});

  final _HealthSection section;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: section.background,
          child: Icon(section.icon, color: section.iconColor),
        ),
        title: Text(context.tr(section.titleKey)),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

/// Franja fija arriba de las pestañas — muestra la fecha siempre, y si
/// pasaron muchos días (o nunca se cargó nada) cambia a un tono de
/// aviso con un botón directo para actualizar con el asistente.
class _LastUpdatedBanner extends StatelessWidget {
  const _LastUpdatedBanner({
    required this.lastUpdatedAt,
    required this.needsReminder,
    required this.onUpdatePressed,
  });

  final DateTime? lastUpdatedAt;
  final bool needsReminder;
  final VoidCallback onUpdatePressed;

  /// Pedido explícito del usuario: "nunca" como fecha quedaba confuso —
  /// si TODAVÍA no se cargó ningún dato, el mensaje tiene que decirlo
  /// directamente (y invitar a cargar), no mostrar una fecha inexistente.
  /// Si SÍ hay datos, siempre se muestra la fecha real de la última
  /// actualización — recién ahí, si pasó mucho tiempo, se suma el aviso
  /// de novedades.
  @override
  Widget build(BuildContext context) {
    final hasData = lastUpdatedAt != null;
    final String message;
    if (!hasData) {
      message = context.tr('health.noDataYet');
    } else if (needsReminder) {
      message = context.tr('health.lastUpdatedReminder', params: {'date': _formatDate(lastUpdatedAt!)});
    } else {
      message = context.tr('health.lastUpdated', params: {'date': _formatDate(lastUpdatedAt!)});
    }
    final needsAttention = !hasData || needsReminder;
    return Container(
      width: double.infinity,
      color: needsAttention
          ? Theme.of(context).colorScheme.errorContainer
          : Theme.of(context).colorScheme.surfaceContainerHighest,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Icon(
            needsAttention ? Icons.notification_important_outlined : Icons.update,
            size: 18,
            color: needsAttention ? Theme.of(context).colorScheme.onErrorContainer : null,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                fontSize: 12,
                color: needsAttention ? Theme.of(context).colorScheme.onErrorContainer : null,
              ),
            ),
          ),
          if (needsAttention)
            TextButton(onPressed: onUpdatePressed, child: Text(hasData ? context.tr('health.updateButton') : context.tr('health.enterDataButton'))),
        ],
      ),
    );
  }
}

class _AllergiesTab extends StatefulWidget {
  const _AllergiesTab({super.key});
  @override
  State<_AllergiesTab> createState() => _AllergiesTabState();
}

class _AllergiesTabState extends State<_AllergiesTab> {
  List<dynamic> _items = [];
  List<CatalogValue> _severityCatalog = [];
  bool _loading = true;
  String? _error;

  String get _personId => context.read<AuthState>().personId!;

  @override
  void initState() {
    super.initState();
    _load();
  }

  CatalogValue? _severityOf(String? id) {
    if (id == null) return null;
    for (final s in _severityCatalog) {
      if (s.id == id) return s;
    }
    return null;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Future.wait con tipos mixtos infería List<Object>, rompiendo el
      // cast a .data (bug real ya encontrado en esta pantalla) — se
      // esperan por separado.
      final response = await ApiClient.instance.dio.get('/clinical/allergies', queryParameters: {'personId': _personId});
      final severityCatalog = await CatalogService.get('REACTION_SEVERITY');
      if (!mounted) return;
      setState(() {
        _items = response.data as List;
        _severityCatalog = severityCatalog;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _errorMessage(e, context.tr('health.allergy.loadError'));
        _loading = false;
      });
    }
  }

  /// Pedido explícito del usuario: poder corregir un dato mal cargado
  /// (no solo borrarlo y volver a cargarlo). Mismo formulario que
  /// "Agregar", precargado con los valores actuales cuando `existing`
  /// no es null — al guardar hace PATCH sobre ese registro en vez de
  /// POST de uno nuevo.
  Future<void> _openForm([Map<String, dynamic>? existing]) async {
    final isEdit = existing != null;
    final typeCatalog = await CatalogService.get('ALLERGEN_TYPE');
    final severityCatalog = await CatalogService.get('REACTION_SEVERITY');
    final statusCatalog = await CatalogService.get('CANONICAL_STATUS');
    final provenanceCatalog = await CatalogService.get('PROVENANCE_TYPE');
    final allergenCatalog = await CatalogService.get('ALLERGEN');
    late TextEditingController nameController;
    final notesController = TextEditingController(text: existing?['notes'] as String? ?? '');
    String? typeId = existing?['allergenTypeId'] as String?;
    String? severityId = existing?['severityId'] as String?;

    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 16, right: 16, top: 16,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
        ),
        child: StatefulBuilder(
          builder: (ctx, setSheetState) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(isEdit ? context.tr('health.allergy.editTitle') : context.tr('health.allergy.addTitle'), style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 12),
              // Bug real reportado en vivo: escribir "ñ" (u otro acento
              // vía popup de tecla larga en teclados Android) se perdía
              // acá — el onChanged de antes llamaba setSheetState en CADA
              // tecla, reconstruyendo todo el sheet mientras el IME
              // todavía tenía una composición en curso, y el caracter se
              // descartaba. El nombre se lee directo de nameController.text
              // recién al guardar, no hace falta reflejarlo en el árbol
              // de widgets mientras se escribe.
              Autocomplete<CatalogValue>(
                initialValue: TextEditingValue(text: existing?['allergenName'] as String? ?? ''),
                displayStringForOption: (c) => c.label(context.lang),
                optionsBuilder: (v) => v.text.isEmpty
                    ? const Iterable<CatalogValue>.empty()
                    : allergenCatalog.where((c) => c.label(context.lang).toLowerCase().contains(v.text.toLowerCase())),
                fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
                  nameController = controller;
                  return TextField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: InputDecoration(labelText: context.tr('health.allergy.allergenLabel')),
                  );
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: typeId,
                isExpanded: true,
                decoration: InputDecoration(labelText: context.tr('health.allergy.typeLabel')),
                items: typeCatalog.map((c) => DropdownMenuItem(value: c.id, child: Text(c.label(context.lang), overflow: TextOverflow.ellipsis))).toList(),
                onChanged: (v) => setSheetState(() => typeId = v),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: severityId,
                isExpanded: true,
                decoration: InputDecoration(labelText: context.tr('health.allergy.severityLabel')),
                items: severityCatalog.map((c) => DropdownMenuItem(value: c.id, child: Text(c.label(context.lang), overflow: TextOverflow.ellipsis))).toList(),
                onChanged: (v) => setSheetState(() => severityId = v),
              ),
              const SizedBox(height: 12),
              TextField(controller: notesController, decoration: InputDecoration(labelText: context.tr('health.allergy.notesOptional'))),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: (typeId == null || severityId == null)
                    ? null
                    : () async {
                        if (nameController.text.trim().isEmpty) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(content: Text(context.tr('health.allergy.enterAllergenError'))),
                          );
                          return;
                        }
                        final name = normalizeSpanishAccents(nameController.text.trim());
                        final allergenCatalogId = await CatalogService.resolveOrCreate('ALLERGEN', name, allergenCatalog);
                        if (isEdit) {
                          await ApiClient.instance.dio.patch('/clinical/allergies/${existing['id']}', data: {
                            'allergenName': name,
                            if (allergenCatalogId != null) 'allergenCatalogId': allergenCatalogId,
                            'allergenTypeId': typeId,
                            'severityId': severityId,
                            'notes': notesController.text.trim().isNotEmpty ? notesController.text.trim() : null,
                          });
                        } else {
                          final provisional = statusCatalog.firstWhere((s) => s.code == 'PROVISIONAL');
                          final selfDeclared = provenanceCatalog.firstWhere((p) => p.code == 'SELF_DECLARED');
                          await ApiClient.instance.dio.post('/clinical/allergies', data: {
                            'personId': _personId,
                            'allergenName': name,
                            if (allergenCatalogId != null) 'allergenCatalogId': allergenCatalogId,
                            'allergenTypeId': typeId,
                            'severityId': severityId,
                            'canonicalStatusId': provisional.id,
                            'provenanceId': selfDeclared.id,
                            if (notesController.text.trim().isNotEmpty) 'notes': notesController.text.trim(),
                          });
                        }
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        await _load();
                      },
                child: Text(context.tr('common.save')),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _LoadErrorView(message: _error!, onRetry: _load);
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: _items.isEmpty
            ? ListView(children: [
                Padding(padding: const EdgeInsets.all(24), child: Text(context.tr('health.allergy.emptyList'))),
              ])
            : ListView.builder(
                itemCount: _items.length,
                itemBuilder: (context, i) {
                  final a = _items[i] as Map<String, dynamic>;
                  final severity = _severityOf(a['severityId'] as String?);
                  final isHighSeverity = severity?.code == 'SEVERE' || severity?.code == 'CRITICAL';
                  // clinical.allergies no tiene fecha clínica propia (a
                  // diferencia de condiciones/cirugías/implantes) — se
                  // muestra la fecha de carga como referencia, pedido
                  // explícito del usuario de no dejar ningún registro
                  // sin fecha visible.
                  final createdAt = a['createdAt'] as String?;
                  final subtitleParts = <String>[
                    if (createdAt != null) context.tr('health.allergy.registeredOn', params: {'date': _formatIsoDate(createdAt)}),
                    if (a['notes'] != null) a['notes'] as String,
                  ];
                  return _RecordCard(
                    icon: Icons.warning_amber_outlined,
                    iconBackground: isHighSeverity ? _RecordColors.allergyBg : _RecordColors.allergyAmberBg,
                    iconColor: isHighSeverity ? _RecordColors.allergyIcon : _RecordColors.allergyAmberIcon,
                    title: a['allergenName'] as String? ?? '',
                    badgeLabel: severity?.label(context.lang),
                    badgeBackground: isHighSeverity ? _RecordColors.allergyBg : _RecordColors.allergyAmberBg,
                    badgeColor: isHighSeverity ? _RecordColors.allergyIcon : _RecordColors.allergyAmberIcon,
                    subtitle: subtitleParts.isEmpty ? null : subtitleParts.join(' · '),
                    onEdit: () => _openForm(a),
                    onDelete: () => _confirmAndSoftDelete(
                      context: context,
                      resource: 'allergies',
                      id: a['id'] as String,
                      itemLabel: a['allergenName'] as String? ?? context.tr('health.allergy.deletedFallback'),
                      onDeleted: _load,
                    ),
                  );
                },
              ),
      ),
      floatingActionButton: FloatingActionButton(onPressed: _openForm, child: const Icon(Icons.add)),
    );
  }
}

class _ConditionsTab extends StatefulWidget {
  const _ConditionsTab({super.key});
  @override
  State<_ConditionsTab> createState() => _ConditionsTabState();
}

class _ConditionsTabState extends State<_ConditionsTab> {
  List<dynamic> _items = [];
  List<CatalogValue> _statusCatalog = [];
  List<CatalogValue> _confirmationCatalog = [];
  List<CatalogValue> _certificationCatalog = [];
  bool _loading = true;
  String? _error;

  String get _personId => context.read<AuthState>().personId!;

  String? get _chronicStatusId {
    for (final c in _statusCatalog) {
      if (c.code == 'CHRONIC') return c.id;
    }
    return null;
  }

  String _statusLabel(String? statusId) => CatalogService.labelFor(_statusCatalog, statusId, lang: context.lang);

  /// Pedido explícito del usuario: "Activa" es el estado por default de
  /// toda condición — mostrarlo en todas las tarjetas es ruido. Si no
  /// estuviera más, el viajero la habría borrado o marcado como
  /// resuelta; el chip solo aporta algo cuando el estado NO es el
  /// default (Resuelta/En remisión — Crónica ya se ve en el título de
  /// la sección, no hace falta repetirlo en el chip).
  String? _statusCode(String? statusId) {
    if (statusId == null) return null;
    for (final c in _statusCatalog) {
      if (c.id == statusId) return c.code;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ApiClient.instance.dio.get('/clinical/conditions', queryParameters: {'personId': _personId});
      final statusCatalog = await CatalogService.get('CONDITION_STATUS');
      final confirmationCatalog = await CatalogService.get('CONFIRMATION_STATUS');
      final certificationCatalog = await CatalogService.get('CERTIFICATION_STATUS');
      if (!mounted) return;
      setState(() {
        _items = response.data as List;
        _statusCatalog = statusCatalog;
        _confirmationCatalog = confirmationCatalog;
        _certificationCatalog = certificationCatalog;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _errorMessage(e, context.tr('health.condition.loadError'));
        _loading = false;
      });
    }
  }

  Future<void> _openForm([Map<String, dynamic>? existing]) async {
    final isEdit = existing != null;
    final statusCatalog = await CatalogService.get('CONDITION_STATUS');
    final canonicalCatalog = await CatalogService.get('CANONICAL_STATUS');
    final provenanceCatalog = await CatalogService.get('PROVENANCE_TYPE');
    final conditionCatalog = await CatalogService.get('CONDITION_CATALOG');
    late TextEditingController nameController;
    String? statusId = existing?['statusId'] as String?;
    // "Fecha de diagnóstico" (mismo término y campo que ya usa
    // clinical.conditions.diagnosed_at / admin-web) — pedido explícito
    // del usuario: faltaba poder cargarla desde la app. Opcional y
    // aproximada a propósito: en la práctica clínica real rara vez se
    // recuerda el día exacto de un diagnóstico viejo, solo el
    // mes/año — se prefiere una fecha aproximada a no cargar ninguna.
    DateTime? diagnosedAt = existing?['diagnosedAt'] != null
        ? DateTime.tryParse(existing!['diagnosedAt'] as String)
        : null;

    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: StatefulBuilder(
          builder: (ctx, setSheetState) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(isEdit ? context.tr('health.condition.editTitle') : context.tr('health.condition.addTitle'), style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 12),
              Autocomplete<CatalogValue>(
                initialValue: TextEditingValue(text: existing?['conditionName'] as String? ?? ''),
                displayStringForOption: (c) => c.label(context.lang),
                optionsBuilder: (v) => v.text.isEmpty
                    ? const Iterable<CatalogValue>.empty()
                    : conditionCatalog.where((c) => c.label(context.lang).toLowerCase().contains(v.text.toLowerCase())),
                fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
                  nameController = controller;
                  return TextField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: InputDecoration(labelText: context.tr('health.condition.nameLabel'), helperText: context.tr('health.condition.nameHelper')),
                  );
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: statusId,
                isExpanded: true,
                decoration: InputDecoration(labelText: context.tr('health.condition.statusLabel')),
                items: statusCatalog.map((c) => DropdownMenuItem(value: c.id, child: Text(c.label(context.lang), overflow: TextOverflow.ellipsis))).toList(),
                onChanged: (v) => setSheetState(() => statusId = v),
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(diagnosedAt != null
                    ? context.tr('health.condition.diagnosedDateWithValue', params: {'date': _formatDate(diagnosedAt!)})
                    : context.tr('health.condition.diagnosedDateEmpty')),
                trailing: const Icon(Icons.calendar_today),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: DateTime(2000),
                    firstDate: DateTime(1930),
                    lastDate: DateTime.now(),
                  );
                  if (picked != null) setSheetState(() => diagnosedAt = picked);
                },
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: statusId == null
                    ? null
                    : () async {
                        if (nameController.text.trim().isEmpty) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(content: Text(context.tr('health.condition.enterConditionError'))),
                          );
                          return;
                        }
                        final name = normalizeSpanishAccents(nameController.text.trim());
                        final conditionCatalogId = await CatalogService.resolveOrCreate('CONDITION_CATALOG', name, conditionCatalog);
                        if (isEdit) {
                          await ApiClient.instance.dio.patch('/clinical/conditions/${existing['id']}', data: {
                            'conditionName': name,
                            if (conditionCatalogId != null) 'conditionCatalogId': conditionCatalogId,
                            'statusId': statusId,
                            'diagnosedAt': diagnosedAt != null ? diagnosedAt!.toIso8601String().split('T').first : null,
                          });
                        } else {
                          final provisional = canonicalCatalog.firstWhere((s) => s.code == 'PROVISIONAL');
                          final selfDeclared = provenanceCatalog.firstWhere((p) => p.code == 'SELF_DECLARED');
                          await ApiClient.instance.dio.post('/clinical/conditions', data: {
                            'personId': _personId,
                            'conditionName': name,
                            if (conditionCatalogId != null) 'conditionCatalogId': conditionCatalogId,
                            'statusId': statusId,
                            if (diagnosedAt != null) 'diagnosedAt': diagnosedAt!.toIso8601String().split('T').first,
                            'canonicalStatusId': provisional.id,
                            'provenanceId': selfDeclared.id,
                          });
                        }
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        await _load();
                      },
                child: Text(context.tr('common.save')),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _LoadErrorView(message: _error!, onRetry: _load);
    final chronicId = _chronicStatusId;
    final chronic = _items.where((e) => (e as Map<String, dynamic>)['statusId'] == chronicId).toList();
    final other = _items.where((e) => (e as Map<String, dynamic>)['statusId'] != chronicId).toList();
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: _items.isEmpty
            ? ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(context.tr('health.condition.emptyList')))])
            : ListView(
                children: [
                  if (chronic.isNotEmpty) ..._conditionSection(context.tr('health.condition.chronicSectionTitle'), chronic),
                  if (other.isNotEmpty) ..._conditionSection(context.tr('health.condition.otherSectionTitle'), other),
                ],
              ),
      ),
      floatingActionButton: FloatingActionButton(onPressed: _openForm, child: const Icon(Icons.add)),
    );
  }

  List<Widget> _conditionSection(String title, List<dynamic> items) => [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
          child: Text(title, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
        ),
        ...items.map((raw) {
          final e = raw as Map<String, dynamic>;
          final confirmation = recordConfirmationBadge(
            context,
            confirmationCode: catalogCodeFor(_confirmationCatalog, e['confirmationStatusId'] as String?),
            certified: catalogCodeFor(_certificationCatalog, e['certificationStatusId'] as String?) == 'PROFESSIONALLY_CERTIFIED',
          );
          return _RecordCard(
            icon: Icons.favorite_border,
            iconBackground: _RecordColors.conditionBg,
            iconColor: _RecordColors.conditionIcon,
            title: e['conditionName'] as String? ?? '',
            badgeLabel: const {'ACTIVE', 'CHRONIC'}.contains(_statusCode(e['statusId'] as String?))
                ? null
                : _statusLabel(e['statusId'] as String?),
            badgeBackground: e['statusId'] == _chronicStatusId ? _RecordColors.conditionBg : _RecordColors.neutralBg,
            badgeColor: e['statusId'] == _chronicStatusId ? _RecordColors.conditionIcon : _RecordColors.neutralIcon,
            secondaryBadgeLabel: confirmation?.label,
            secondaryBadgeBackground: confirmation?.bg,
            secondaryBadgeColor: confirmation?.color,
            subtitle: e['diagnosedAt'] != null ? context.tr('health.condition.diagnosedOn', params: {'date': _formatIsoDate(e['diagnosedAt'] as String)}) : null,
            onEdit: () => _openForm(e),
            onDelete: () => _confirmAndSoftDelete(
              context: context,
              resource: 'conditions',
              id: e['id'] as String,
              itemLabel: e['conditionName'] as String? ?? context.tr('health.condition.deletedFallback'),
              onDeleted: _load,
            ),
          );
        }),
      ];
}

class _MedicationsTab extends StatefulWidget {
  const _MedicationsTab({super.key});
  @override
  State<_MedicationsTab> createState() => _MedicationsTabState();
}

class _MedicationsTabState extends State<_MedicationsTab> {
  List<dynamic> _items = [];
  List<CatalogValue> _confirmationCatalog = [];
  List<CatalogValue> _certificationCatalog = [];
  bool _loading = true;
  String? _error;

  String get _personId => context.read<AuthState>().personId!;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ApiClient.instance.dio.get('/clinical/medications', queryParameters: {'personId': _personId});
      final confirmationCatalog = await CatalogService.get('CONFIRMATION_STATUS');
      final certificationCatalog = await CatalogService.get('CERTIFICATION_STATUS');
      if (!mounted) return;
      setState(() {
        _items = response.data as List;
        _confirmationCatalog = confirmationCatalog;
        _certificationCatalog = certificationCatalog;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _errorMessage(e, context.tr('health.medication.loadError'));
        _loading = false;
      });
    }
  }

  Future<void> _openForm([Map<String, dynamic>? existing]) async {
    final isEdit = existing != null;
    final canonicalCatalog = await CatalogService.get('CANONICAL_STATUS');
    final provenanceCatalog = await CatalogService.get('PROVENANCE_TYPE');
    final doseUnitCatalog = await CatalogService.get('DOSE_UNIT');
    final medicationCatalog = await CatalogService.get('MEDICATION');
    late TextEditingController nameController;
    final brandController = TextEditingController(text: existing?['brandName'] as String? ?? '');
    final manufacturerController = TextEditingController(text: existing?['manufacturer'] as String? ?? '');
    final doseAmountController = TextEditingController(text: existing?['doseAmount']?.toString() ?? '');
    String? doseUnitId = existing?['doseUnitId'] as String?;
    DateTime? prescribedDate = existing?['prescribedDate'] != null
        ? DateTime.tryParse(existing!['prescribedDate'] as String)
        : null;

    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: StatefulBuilder(
          builder: (ctx, setSheetState) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(isEdit ? context.tr('health.medication.editTitle') : context.tr('health.medication.addTitle'), style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 12),
              Autocomplete<CatalogValue>(
                initialValue: TextEditingValue(text: existing?['genericName'] as String? ?? ''),
                displayStringForOption: (c) => c.label(context.lang),
                optionsBuilder: (v) => v.text.isEmpty
                    ? const Iterable<CatalogValue>.empty()
                    : medicationCatalog.where((c) => c.label(context.lang).toLowerCase().contains(v.text.toLowerCase())),
                fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
                  nameController = controller;
                  return TextField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: InputDecoration(labelText: context.tr('health.medication.genericNameLabel')),
                  );
                },
              ),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: TextField(
                      controller: doseAmountController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: InputDecoration(labelText: context.tr('health.medication.doseOptional')),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: doseUnitId,
                      isExpanded: true,
                      decoration: InputDecoration(labelText: context.tr('health.medication.unitLabel')),
                      items: doseUnitCatalog.map((c) => DropdownMenuItem(value: c.id, child: Text(c.label(context.lang), overflow: TextOverflow.ellipsis))).toList(),
                      onChanged: (v) => setSheetState(() => doseUnitId = v),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(controller: brandController, decoration: InputDecoration(labelText: context.tr('health.medication.brandOptional'))),
              const SizedBox(height: 12),
              TextField(controller: manufacturerController, decoration: InputDecoration(labelText: context.tr('health.medication.manufacturerOptional'))),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(prescribedDate == null ? context.tr('health.medication.prescribedDateOptional') : _formatDate(prescribedDate!)),
                trailing: const Icon(Icons.calendar_today_outlined, size: 20),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: prescribedDate ?? DateTime.now(),
                    firstDate: DateTime(1900),
                    lastDate: DateTime.now(),
                  );
                  if (picked != null) setSheetState(() => prescribedDate = picked);
                },
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () async {
                        if (nameController.text.trim().isEmpty) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(content: Text(context.tr('health.medication.enterDrugError'))),
                          );
                          return;
                        }
                        final name = normalizeSpanishAccents(nameController.text.trim());
                        final medicationCatalogId = await CatalogService.resolveOrCreate('MEDICATION', name, medicationCatalog);
                        if (isEdit) {
                          await ApiClient.instance.dio.patch('/clinical/medications/${existing['id']}', data: {
                            'genericName': name,
                            if (medicationCatalogId != null) 'medicationCatalogId': medicationCatalogId,
                            'brandName': brandController.text.trim().isNotEmpty ? brandController.text.trim() : null,
                            'manufacturer': manufacturerController.text.trim().isNotEmpty ? manufacturerController.text.trim() : null,
                            'doseAmount': doseAmountController.text.trim().isNotEmpty ? doseAmountController.text.trim() : null,
                            'doseUnitId': doseUnitId,
                            'prescribedDate': prescribedDate != null ? prescribedDate!.toIso8601String().split('T').first : null,
                          });
                        } else {
                          final provisional = canonicalCatalog.firstWhere((s) => s.code == 'PROVISIONAL');
                          final selfDeclared = provenanceCatalog.firstWhere((p) => p.code == 'SELF_DECLARED');
                          await ApiClient.instance.dio.post('/clinical/medications', data: {
                            'personId': _personId,
                            'genericName': name,
                            if (medicationCatalogId != null) 'medicationCatalogId': medicationCatalogId,
                            if (brandController.text.trim().isNotEmpty) 'brandName': brandController.text.trim(),
                            if (manufacturerController.text.trim().isNotEmpty) 'manufacturer': manufacturerController.text.trim(),
                            if (doseAmountController.text.trim().isNotEmpty) 'doseAmount': doseAmountController.text.trim(),
                            if (doseUnitId != null) 'doseUnitId': doseUnitId,
                            if (prescribedDate != null) 'prescribedDate': prescribedDate!.toIso8601String().split('T').first,
                            'isCurrent': true,
                            'canonicalStatusId': provisional.id,
                            'provenanceId': selfDeclared.id,
                          });
                        }
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        await _load();
                      },
                child: Text(context.tr('common.save')),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _LoadErrorView(message: _error!, onRetry: _load);
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: _items.isEmpty
            ? ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(context.tr('health.medication.emptyList')))])
            : ListView.builder(
                itemCount: _items.length,
                itemBuilder: (context, i) {
                  final m = _items[i] as Map<String, dynamic>;
                  final brand = m['brandName'] as String?;
                  final manufacturer = m['manufacturer'] as String?;
                  final doseAmount = m['doseAmount'];
                  final startedAt = m['startedAt'] as String?;
                  final subtitleParts = <String>[
                    if (doseAmount != null) '$doseAmount',
                    if (manufacturer != null) manufacturer,
                    if (startedAt != null) context.tr('health.medication.sinceDate', params: {'date': _formatIsoDate(startedAt)}),
                  ];
                  final isCurrent = m['isCurrent'] != false;
                  final confirmation = recordConfirmationBadge(
                    context,
                    confirmationCode: catalogCodeFor(_confirmationCatalog, m['confirmationStatusId'] as String?),
                    certified: catalogCodeFor(_certificationCatalog, m['certificationStatusId'] as String?) == 'PROFESSIONALLY_CERTIFIED',
                  );
                  return _RecordCard(
                    icon: Icons.medication_outlined,
                    iconBackground: _RecordColors.medicationBg,
                    iconColor: _RecordColors.medicationIcon,
                    title: '${m['genericName']}${brand != null ? ' ($brand)' : ''}',
                    badgeLabel: isCurrent ? context.tr('health.medication.currentBadge') : context.tr('health.medication.discontinuedBadge'),
                    badgeBackground: isCurrent ? _RecordColors.medicationBg : _RecordColors.neutralBg,
                    badgeColor: isCurrent ? _RecordColors.medicationIcon : _RecordColors.neutralIcon,
                    secondaryBadgeLabel: confirmation?.label,
                    secondaryBadgeBackground: confirmation?.bg,
                    secondaryBadgeColor: confirmation?.color,
                    subtitle: subtitleParts.isEmpty ? null : subtitleParts.join(' · '),
                    onEdit: () => _openForm(m),
                    onDelete: () => _confirmAndSoftDelete(
                      context: context,
                      resource: 'medications',
                      id: m['id'] as String,
                      itemLabel: m['genericName'] as String? ?? context.tr('health.medication.deletedFallback'),
                      onDeleted: _load,
                    ),
                  );
                },
              ),
      ),
      floatingActionButton: FloatingActionButton(onPressed: _openForm, child: const Icon(Icons.add)),
    );
  }
}

class _SurgeriesTab extends StatefulWidget {
  const _SurgeriesTab({super.key});
  @override
  State<_SurgeriesTab> createState() => _SurgeriesTabState();
}

class _SurgeriesTabState extends State<_SurgeriesTab> {
  List<dynamic> _items = [];
  bool _loading = true;
  String? _error;

  String get _personId => context.read<AuthState>().personId!;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ApiClient.instance.dio.get('/clinical/surgeries', queryParameters: {'personId': _personId});
      if (!mounted) return;
      setState(() {
        _items = response.data as List;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _errorMessage(e, context.tr('health.surgery.loadError'));
        _loading = false;
      });
    }
  }

  Future<void> _openForm([Map<String, dynamic>? existing]) async {
    final isEdit = existing != null;
    final canonicalCatalog = await CatalogService.get('CANONICAL_STATUS');
    final provenanceCatalog = await CatalogService.get('PROVENANCE_TYPE');
    final surgeryCatalog = await CatalogService.get('SURGERY_CATALOG');
    late TextEditingController nameController;
    DateTime? performedAt = existing?['performedAt'] != null
        ? DateTime.tryParse(existing!['performedAt'] as String)
        : null;

    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: StatefulBuilder(
          builder: (ctx, setSheetState) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(isEdit ? context.tr('health.surgery.editTitle') : context.tr('health.surgery.addTitle'), style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 12),
              Autocomplete<CatalogValue>(
                initialValue: TextEditingValue(text: existing?['procedureName'] as String? ?? ''),
                displayStringForOption: (c) => c.label(context.lang),
                optionsBuilder: (v) => v.text.isEmpty
                    ? const Iterable<CatalogValue>.empty()
                    : surgeryCatalog.where((c) => c.label(context.lang).toLowerCase().contains(v.text.toLowerCase())),
                fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
                  nameController = controller;
                  return TextField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: InputDecoration(labelText: context.tr('health.surgery.nameLabel'), helperText: context.tr('health.surgery.nameHelper')),
                  );
                },
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(performedAt != null
                    ? context.tr('health.surgery.dateWithValue', params: {'date': _formatDate(performedAt!)})
                    : context.tr('health.surgery.dateEmpty')),
                trailing: const Icon(Icons.calendar_today),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: DateTime(2000),
                    firstDate: DateTime(1930),
                    lastDate: DateTime.now(),
                  );
                  if (picked != null) setSheetState(() => performedAt = picked);
                },
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: performedAt == null
                    ? null
                    : () async {
                        if (nameController.text.trim().isEmpty) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(content: Text(context.tr('health.surgery.enterSurgeryError'))),
                          );
                          return;
                        }
                        final name = normalizeSpanishAccents(nameController.text.trim());
                        final procedureCatalogId = await CatalogService.resolveOrCreate('SURGERY_CATALOG', name, surgeryCatalog);
                        if (isEdit) {
                          await ApiClient.instance.dio.patch('/clinical/surgeries/${existing['id']}', data: {
                            'procedureName': name,
                            if (procedureCatalogId != null) 'procedureCatalogId': procedureCatalogId,
                            'performedAt': performedAt!.toIso8601String().split('T').first,
                          });
                        } else {
                          final provisional = canonicalCatalog.firstWhere((s) => s.code == 'PROVISIONAL');
                          final selfDeclared = provenanceCatalog.firstWhere((p) => p.code == 'SELF_DECLARED');
                          await ApiClient.instance.dio.post('/clinical/surgeries', data: {
                            'personId': _personId,
                            'procedureName': name,
                            if (procedureCatalogId != null) 'procedureCatalogId': procedureCatalogId,
                            'performedAt': performedAt!.toIso8601String().split('T').first,
                            'canonicalStatusId': provisional.id,
                            'provenanceId': selfDeclared.id,
                          });
                        }
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        await _load();
                      },
                child: Text(context.tr('common.save')),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _LoadErrorView(message: _error!, onRetry: _load);
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: _items.isEmpty
            ? ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(context.tr('health.surgery.emptyList')))])
            : ListView.builder(
                itemCount: _items.length,
                itemBuilder: (context, i) {
                  final s = _items[i] as Map<String, dynamic>;
                  final date = s['performedAt'] as String?;
                  return _RecordCard(
                    icon: Icons.healing_outlined,
                    iconBackground: _RecordColors.surgeryBg,
                    iconColor: _RecordColors.surgeryIcon,
                    title: s['procedureName'] as String? ?? '',
                    badgeLabel: context.tr('health.surgery.badgeLabel'),
                    badgeBackground: _RecordColors.neutralBg,
                    badgeColor: _RecordColors.neutralIcon,
                    subtitle: date != null ? _formatIsoDate(date) : null,
                    onEdit: () => _openForm(s),
                    onDelete: () => _confirmAndSoftDelete(
                      context: context,
                      resource: 'surgeries',
                      id: s['id'] as String,
                      itemLabel: s['procedureName'] as String? ?? context.tr('health.surgery.deletedFallback'),
                      onDeleted: _load,
                    ),
                  );
                },
              ),
      ),
      floatingActionButton: FloatingActionButton(onPressed: _openForm, child: const Icon(Icons.add)),
    );
  }
}

class _VitalsTab extends StatefulWidget {
  const _VitalsTab({super.key});
  @override
  State<_VitalsTab> createState() => _VitalsTabState();
}

class _VitalsTabState extends State<_VitalsTab> {
  List<dynamic> _items = [];
  bool _loading = true;
  String? _error;
  // Pedido explícito del usuario: "Grupo Sanguíneo... siempre es el
  // mismo... debe permitir su modificación por si hay un error" — a
  // diferencia de peso/altura/presión (mediciones repetibles, abajo),
  // el grupo sanguíneo ya no vive en "Nueva medición": se muestra acá
  // como dato fijo (core.persons.blood_type_id) con un link a Perfil
  // para corregirlo, igual que el sexo.
  String? _bloodTypeId;
  List<CatalogValue> _bloodTypeCatalog = [];

  String get _personId => context.read<AuthState>().personId!;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        ApiClient.instance.dio.get('/clinical/vitals-history', queryParameters: {'personId': _personId}),
        ApiClient.instance.dio.get('/me/profile'),
        CatalogService.get('BLOOD_TYPE'),
      ]);
      if (!mounted) return;
      final profile = (results[1] as dynamic).data as Map<String, dynamic>;
      setState(() {
        _items = ((results[0] as dynamic).data as List)..sort((a, b) => (b['measuredAt'] as String).compareTo(a['measuredAt'] as String));
        _bloodTypeId = profile['blood_type_id'] as String?;
        _bloodTypeCatalog = results[2] as List<CatalogValue>;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _errorMessage(e, context.tr('health.vitals.loadError'));
        _loading = false;
      });
    }
  }

  Future<void> _openForm() async {
    final provenanceCatalog = await CatalogService.get('PROVENANCE_TYPE');
    final weightController = TextEditingController();
    final heightController = TextEditingController();
    final sysController = TextEditingController();
    final diaController = TextEditingController();
    DateTime measuredAt = DateTime.now();

    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: StatefulBuilder(
          builder: (ctx, setSheetState) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(context.tr('health.vitals.newMeasurementTitle'), style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                context.tr('health.vitals.hint'),
                style: Theme.of(ctx).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: weightController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(labelText: context.tr('health.vitals.weightLabel')),
                onChanged: (_) => setSheetState(() {}),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: heightController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(labelText: context.tr('health.vitals.heightLabel')),
                onChanged: (_) => setSheetState(() {}),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: sysController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(labelText: context.tr('health.vitals.systolicLabel')),
                      onChanged: (_) => setSheetState(() {}),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: diaController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(labelText: context.tr('health.vitals.diastolicLabel')),
                      onChanged: (_) => setSheetState(() {}),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(context.tr('health.vitals.measurementDate', params: {'date': _formatDate(measuredAt)})),
                trailing: const Icon(Icons.calendar_today),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: measuredAt,
                    firstDate: DateTime(1930),
                    lastDate: DateTime.now(),
                  );
                  if (picked != null) setSheetState(() => measuredAt = picked);
                },
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: (weightController.text.trim().isEmpty &&
                        heightController.text.trim().isEmpty &&
                        sysController.text.trim().isEmpty &&
                        diaController.text.trim().isEmpty)
                    ? null
                    : () async {
                        final selfDeclared = provenanceCatalog.firstWhere((p) => p.code == 'SELF_DECLARED');
                        await ApiClient.instance.dio.post('/clinical/vitals-history', data: {
                          'personId': _personId,
                          if (weightController.text.trim().isNotEmpty) 'weightKg': weightController.text.trim(),
                          if (heightController.text.trim().isNotEmpty) 'heightCm': heightController.text.trim(),
                          if (sysController.text.trim().isNotEmpty) 'bloodPressureSys': sysController.text.trim(),
                          if (diaController.text.trim().isNotEmpty) 'bloodPressureDia': diaController.text.trim(),
                          'measuredAt': measuredAt.toIso8601String(),
                          'provenanceId': selfDeclared.id,
                        });
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        await _load();
                      },
                child: Text(context.tr('common.save')),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Pedido explícito del usuario: si una carga no repite la altura, el
  /// IMC de esa fecha se calcula igual arrastrando la última altura
  /// conocida (cálculo de presentación, no se reescribe la base).
  Map<String, dynamic> _heightAndBmi(int index) {
    String? height;
    for (var i = _items.length - 1; i >= index; i--) {
      final h = (_items[i] as Map<String, dynamic>)['heightCm'];
      if (h != null) height = h.toString();
    }
    final v = _items[index] as Map<String, dynamic>;
    var bmi = v['bmi']?.toString();
    if (bmi == null && v['weightKg'] != null && height != null) {
      final h = (double.tryParse(height) ?? 0) / 100;
      final w = double.tryParse(v['weightKg'].toString());
      if (h > 0 && w != null) bmi = (w / (h * h)).toStringAsFixed(1);
    }
    return {'height': height, 'heightIsCarried': v['heightCm'] == null && height != null, 'bmi': bmi};
  }

  Widget _bloodTypeHeader(BuildContext context) {
    final matches = _bloodTypeCatalog.where((b) => b.id == _bloodTypeId);
    final label = matches.isEmpty ? null : matches.first.label(context.lang);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Row(
        children: [
          Icon(Icons.bloodtype_outlined, color: _RecordColors.vitalsIcon),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label != null
                  ? context.tr('health.vitals.bloodTypeFixedWithValue', params: {'value': label})
                  : context.tr('health.vitals.bloodTypeFixedEmpty'),
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          TextButton(
            onPressed: () => context.push('/profile'),
            child: Text(context.tr('health.vitals.bloodTypeEditLink')),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _LoadErrorView(message: _error!, onRetry: _load);
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: Column(
          children: [
            _bloodTypeHeader(context),
            const Divider(height: 1),
            Expanded(
              child: _items.isEmpty
                  ? ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(context.tr('health.vitals.emptyList')))])
                  : ListView.builder(
                      itemCount: _items.length,
                      itemBuilder: (context, i) {
                  final v = _items[i] as Map<String, dynamic>;
                  final weight = v['weightKg'];
                  final computed = _heightAndBmi(i);
                  final sys = v['bloodPressureSys'];
                  final dia = v['bloodPressureDia'];
                  final parts = <String>[
                    if (computed['height'] != null)
                      context.tr('health.vitals.heightWithValue', params: {'value': '${computed['height']}'}) +
                          (computed['heightIsCarried'] == true ? context.tr('health.vitals.heightCarriedSuffix') : ''),
                    if (computed['bmi'] != null) context.tr('health.vitals.bmiWithValue', params: {'value': '${computed['bmi']}'}),
                    if (sys != null && dia != null) context.tr('health.vitals.pressureWithValue', params: {'value': '$sys/$dia'}),
                  ];
                  final measuredAt = v['measuredAt'] as String?;
                  return _RecordCard(
                    icon: Icons.monitor_weight_outlined,
                    iconBackground: _RecordColors.vitalsBg,
                    iconColor: _RecordColors.vitalsIcon,
                    title: weight != null ? context.tr('health.vitals.weightTitle', params: {'value': '$weight'}) : context.tr('health.vitals.measurementTitle'),
                    badgeLabel: measuredAt != null ? _formatIsoDate(measuredAt) : null,
                    badgeBackground: _RecordColors.vitalsBg,
                    badgeColor: _RecordColors.vitalsIcon,
                    subtitle: parts.isEmpty ? null : parts.join(' · '),
                  );
                      },
                    ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(onPressed: _openForm, child: const Icon(Icons.add)),
    );
  }
}

/// "Estudios" — pedido explícito del usuario: cargaba análisis por el
/// asistente de IA (proposalType LAB_RESULT) pero no había forma de
/// verlos ni cargarlos a mano acá, aunque clinical.lab_results ya
/// existía. Mismo recurso genérico /clinical/lab-results que usa la IA.
class _LabResultsTab extends StatefulWidget {
  const _LabResultsTab({super.key});
  @override
  State<_LabResultsTab> createState() => _LabResultsTabState();
}

/// Indicadores sembrados que YA tienen columna dedicada en el form —
/// se excluyen de la lista dinámica de LAB_INDICATOR para sangre así
/// no aparecen duplicados (una vez como campo fijo, otra vez como
/// indicador genérico). El resto de los indicadores de sangre (ej.
/// RED_BLOOD_CELLS, UREA) y todos los de otros tipos de estudio no
/// tienen columna propia — van por customValues.
const _dedicatedFieldIndicatorCodes = {'HEMOGLOBIN', 'GLUCOSE_FASTING'};

class _LabResultsTabState extends State<_LabResultsTab> {
  List<dynamic> _items = [];
  List<CatalogValue> _studyTypeCatalog = [];
  List<CatalogValue> _indicatorCatalog = [];
  bool _loading = true;
  String? _error;

  String get _personId => context.read<AuthState>().personId!;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ApiClient.instance.dio.get('/clinical/lab-results', queryParameters: {'personId': _personId});
      final studyTypeCatalog = await CatalogService.get('LAB_STUDY_TYPE');
      final indicatorCatalog = await CatalogService.get('LAB_INDICATOR');
      if (!mounted) return;
      setState(() {
        _items = (response.data as List)..sort((a, b) => (b['performedAt'] as String).compareTo(a['performedAt'] as String));
        _studyTypeCatalog = studyTypeCatalog;
        _indicatorCatalog = indicatorCatalog;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _errorMessage(e, context.tr('health.labResult.loadError'));
        _loading = false;
      });
    }
  }

  String? _studyTypeCode(String? studyTypeId) {
    for (final s in _studyTypeCatalog) {
      if (s.id == studyTypeId) return s.code;
    }
    return null;
  }

  String _customValueLabel(Map v) {
    final name = v['name'] as String? ?? '';
    final value = v['value'];
    for (final i in _indicatorCatalog) {
      if (i.code == name) {
        final unit = i.metadata['unit'] as String?;
        return '${i.label(context.lang)}: $value${unit != null ? ' $unit' : ''}';
      }
    }
    return '$name: $value';
  }

  Future<void> _openForm() async {
    final provenanceCatalog = await CatalogService.get('PROVENANCE_TYPE');
    final canonicalCatalog = await CatalogService.get('CANONICAL_STATUS');
    final labNameController = TextEditingController();
    final glucoseController = TextEditingController();
    final hba1cController = TextEditingController();
    final cholesterolController = TextEditingController();
    final creatinineController = TextEditingController();
    final hemoglobinController = TextEditingController();
    final plateletsController = TextEditingController();
    final ptInrController = TextEditingController();
    final apttController = TextEditingController();
    final notesController = TextEditingController();
    final indicatorControllers = <String, TextEditingController>{};
    DateTime performedAt = DateTime.now();
    String? studyTypeId = _studyTypeCatalog.isEmpty
        ? null
        : _studyTypeCatalog.firstWhere((s) => s.code == 'BLOOD', orElse: () => _studyTypeCatalog.first).id;

    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: StatefulBuilder(
          builder: (ctx, setSheetState) {
            final studyTypeCode = _studyTypeCode(studyTypeId);
            final isBlood = studyTypeCode == 'BLOOD' || studyTypeCode == null;
            final dynamicIndicators = _indicatorCatalog.where((ind) {
              if (ind.metadata['studyTypeCode'] != studyTypeCode) return false;
              if (studyTypeCode == 'BLOOD' && _dedicatedFieldIndicatorCodes.contains(ind.code)) return false;
              return true;
            }).toList();
            for (final ind in dynamicIndicators) {
              indicatorControllers.putIfAbsent(ind.id, () => TextEditingController());
            }

            return SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(context.tr('health.labResult.newStudyTitle'), style: Theme.of(ctx).textTheme.titleLarge),
                  const SizedBox(height: 4),
                  Text(
                    context.tr('health.labResult.hint'),
                    style: Theme.of(ctx).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 12),
                  if (_studyTypeCatalog.isNotEmpty)
                    DropdownButtonFormField<String>(
                      initialValue: studyTypeId,
                      isExpanded: true,
                      decoration: InputDecoration(labelText: context.tr('health.labResult.studyTypeLabel')),
                      items: _studyTypeCatalog.map((s) => DropdownMenuItem(value: s.id, child: Text(s.label(context.lang), overflow: TextOverflow.ellipsis))).toList(),
                      onChanged: (v) => setSheetState(() => studyTypeId = v),
                    ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: labNameController,
                    decoration: InputDecoration(labelText: context.tr('health.labResult.studyNameLabel')),
                  ),
                  const SizedBox(height: 12),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(context.tr('health.labResult.studyDate', params: {'date': _formatDate(performedAt)})),
                    trailing: const Icon(Icons.calendar_today),
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: ctx,
                        initialDate: performedAt,
                        firstDate: DateTime(1930),
                        lastDate: DateTime.now(),
                      );
                      if (picked != null) setSheetState(() => performedAt = picked);
                    },
                  ),
                  if (isBlood) ...[
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: glucoseController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: InputDecoration(labelText: context.tr('health.labResult.glucoseLabel')),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: hba1cController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: InputDecoration(labelText: context.tr('health.labResult.hba1cLabel')),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: cholesterolController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: InputDecoration(labelText: context.tr('health.labResult.cholesterolLabel')),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: creatinineController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: InputDecoration(labelText: context.tr('health.labResult.creatinineLabel')),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: hemoglobinController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: InputDecoration(labelText: context.tr('health.labResult.hemoglobinLabel')),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: plateletsController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: InputDecoration(labelText: context.tr('health.labResult.plateletsLabel')),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: ptInrController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: InputDecoration(labelText: context.tr('health.labResult.inrLabel')),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: apttController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: InputDecoration(labelText: context.tr('health.labResult.apttLabel')),
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (dynamicIndicators.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(context.tr('health.labResult.otherIndicatorsTitle'), style: Theme.of(ctx).textTheme.titleSmall),
                    for (final ind in dynamicIndicators)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: TextField(
                          controller: indicatorControllers[ind.id],
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: InputDecoration(
                            labelText: ind.metadata['unit'] != null ? '${ind.label(context.lang)} (${ind.metadata['unit']})' : ind.label(context.lang),
                          ),
                        ),
                      ),
                  ],
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    maxLines: 2,
                    decoration: InputDecoration(labelText: context.tr('health.labResult.notesLabel')),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () async {
                      // Bug real reportado en vivo: faltaba canonicalStatusId
                      // (obligatorio en la base, todas las demás pestañas lo
                      // mandan) y no había ningún try/catch — el guardado
                      // fallaba siempre y quedaba en silencio total, sin
                      // avisarle nada al usuario.
                      final saveErrorFallback = context.tr('health.labResult.saveError');
                      try {
                        final provisional = canonicalCatalog.firstWhere((s) => s.code == 'PROVISIONAL');
                        final selfDeclared = provenanceCatalog.firstWhere((p) => p.code == 'SELF_DECLARED');
                        final customValues = <Map<String, String>>[
                          for (final ind in dynamicIndicators)
                            if ((indicatorControllers[ind.id]?.text ?? '').trim().isNotEmpty)
                              {'name': ind.code, 'value': indicatorControllers[ind.id]!.text.trim()},
                          if (notesController.text.trim().isNotEmpty)
                            {'name': 'Notas', 'value': notesController.text.trim()},
                        ];
                        await ApiClient.instance.dio.post('/clinical/lab-results', data: {
                          'personId': _personId,
                          if (labNameController.text.trim().isNotEmpty) 'labName': labNameController.text.trim(),
                          'performedAt': performedAt.toIso8601String(),
                          if (studyTypeId != null) 'studyTypeId': studyTypeId,
                          if (isBlood && glucoseController.text.trim().isNotEmpty) 'glucoseFasting': glucoseController.text.trim(),
                          if (isBlood && hba1cController.text.trim().isNotEmpty) 'hba1c': hba1cController.text.trim(),
                          if (isBlood && cholesterolController.text.trim().isNotEmpty) 'totalCholesterol': cholesterolController.text.trim(),
                          if (isBlood && creatinineController.text.trim().isNotEmpty) 'creatinine': creatinineController.text.trim(),
                          if (isBlood && hemoglobinController.text.trim().isNotEmpty) 'hemoglobin': hemoglobinController.text.trim(),
                          if (isBlood && plateletsController.text.trim().isNotEmpty) 'platelets': plateletsController.text.trim(),
                          if (isBlood && ptInrController.text.trim().isNotEmpty) 'ptInr': ptInrController.text.trim(),
                          if (isBlood && apttController.text.trim().isNotEmpty) 'aptt': apttController.text.trim(),
                          'customValues': customValues,
                          'canonicalStatusId': provisional.id,
                          'provenanceId': selfDeclared.id,
                        });
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        await _load();
                      } catch (e) {
                        if (ctx.mounted) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(content: Text(_errorMessage(e, saveErrorFallback))),
                          );
                        }
                      }
                    },
                    child: Text(context.tr('common.save')),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _resultTile(Map<String, dynamic> r) {
    final labName = r['labName'] as String?;
    final parts = <String>[
      if (r['glucoseFasting'] != null) '${context.tr('health.labResult.glucoseLabel')}: ${r['glucoseFasting']}',
      if (r['hba1c'] != null) '${context.tr('health.labResult.hba1cLabel')}: ${r['hba1c']}',
      if (r['totalCholesterol'] != null) '${context.tr('health.labResult.cholesterolLabel')}: ${r['totalCholesterol']}',
      if (r['creatinine'] != null) '${context.tr('health.labResult.creatinineLabel')}: ${r['creatinine']}',
      if (r['hemoglobin'] != null) '${context.tr('health.labResult.hemoglobinLabel')}: ${r['hemoglobin']}',
      if (r['platelets'] != null) '${context.tr('health.labResult.plateletsLabel')}: ${r['platelets']}',
      if (r['ptInr'] != null) '${context.tr('health.labResult.inrLabel')}: ${r['ptInr']}',
      if (r['aptt'] != null) '${context.tr('health.labResult.apttLabel')}: ${r['aptt']}',
      if (r['customValues'] is List)
        for (final v in (r['customValues'] as List))
          if (v is Map) _customValueLabel(v),
    ];
    return ListTile(
      title: Text(labName?.isNotEmpty == true ? labName! : context.tr('health.labResult.defaultStudyLabel')),
      subtitle: Text([
        _formatIsoDate(r['performedAt'] as String? ?? ''),
        if (parts.isNotEmpty) parts.join(' · '),
      ].join(' — ')),
      isThreeLine: parts.isNotEmpty,
    );
  }

  List<Widget> _buildGroups() {
    final widgets = <Widget>[];
    final types = _studyTypeCatalog.isNotEmpty
        ? _studyTypeCatalog
        : [CatalogValue(id: '', code: 'OTHER', labelEs: context.tr('health.labResult.otherStudiesGroupLabel'))];
    for (final type in types) {
      final groupItems = _studyTypeCatalog.isEmpty
          ? _items
          : _items.where((e) => (e as Map<String, dynamic>)['studyTypeId'] == type.id).toList();
      if (groupItems.isEmpty) continue;
      widgets.add(Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
        child: Text(type.label(context.lang), style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
      ));
      widgets.add(_resultTile(groupItems.first as Map<String, dynamic>));
      final older = groupItems.skip(1).toList();
      if (older.isNotEmpty) {
        widgets.add(ExpansionTile(
          title: Text(context.tr('health.labResult.viewOlderStudies', params: {'n': '${older.length}'})),
          children: older.map((e) => _resultTile(e as Map<String, dynamic>)).toList(),
        ));
      }
    }
    return widgets;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _LoadErrorView(message: _error!, onRetry: _load);
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: _items.isEmpty
            ? ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(context.tr('health.labResult.emptyList')))])
            : ListView(children: _buildGroups()),
      ),
      floatingActionButton: FloatingActionButton(onPressed: _openForm, child: const Icon(Icons.add)),
    );
  }
}

class _ImplantsTab extends StatefulWidget {
  const _ImplantsTab({super.key});
  @override
  State<_ImplantsTab> createState() => _ImplantsTabState();
}

class _ImplantsTabState extends State<_ImplantsTab> {
  List<dynamic> _items = [];
  List<CatalogValue> _typeCatalog = [];
  bool _loading = true;
  String? _error;

  String get _personId => context.read<AuthState>().personId!;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ApiClient.instance.dio.get('/clinical/implants-devices', queryParameters: {'personId': _personId});
      final typeCatalog = await CatalogService.get('IMPLANT_TYPE');
      if (!mounted) return;
      setState(() {
        _items = response.data as List;
        _typeCatalog = typeCatalog;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _errorMessage(e, context.tr('health.implant.loadError'));
        _loading = false;
      });
    }
  }

  Future<void> _openForm([Map<String, dynamic>? existing]) async {
    final isEdit = existing != null;
    final canonicalCatalog = await CatalogService.get('CANONICAL_STATUS');
    final provenanceCatalog = await CatalogService.get('PROVENANCE_TYPE');
    late TextEditingController nameController;
    final notesController = TextEditingController(text: existing?['notes'] as String? ?? '');
    DateTime? implantedAt = existing?['implantedAt'] != null
        ? DateTime.tryParse(existing!['implantedAt'] as String)
        : null;

    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: StatefulBuilder(
          builder: (ctx, setSheetState) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(isEdit ? context.tr('health.implant.editTitle') : context.tr('health.implant.addTitle'), style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                context.tr('health.implant.hint'),
                style: Theme.of(ctx).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              Autocomplete<CatalogValue>(
                initialValue: TextEditingValue(text: existing?['deviceName'] as String? ?? ''),
                displayStringForOption: (c) => c.label(context.lang),
                optionsBuilder: (v) => v.text.isEmpty
                    ? const Iterable<CatalogValue>.empty()
                    : _typeCatalog.where((c) => c.label(context.lang).toLowerCase().contains(v.text.toLowerCase())),
                fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
                  nameController = controller;
                  return TextField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: InputDecoration(labelText: context.tr('health.implant.nameLabel')),
                  );
                },
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(implantedAt != null
                    ? context.tr('health.implant.dateWithValue', params: {'date': _formatDate(implantedAt!)})
                    : context.tr('health.implant.dateEmptyOptional')),
                trailing: const Icon(Icons.calendar_today),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: DateTime(2000),
                    firstDate: DateTime(1930),
                    lastDate: DateTime.now(),
                  );
                  if (picked != null) setSheetState(() => implantedAt = picked);
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: notesController,
                maxLines: 2,
                decoration: InputDecoration(labelText: context.tr('health.allergy.notesOptional')),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () async {
                        if (nameController.text.trim().isEmpty) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(content: Text(context.tr('health.implant.enterDeviceError'))),
                          );
                          return;
                        }
                        final name = normalizeSpanishAccents(nameController.text.trim());
                        final deviceTypeId = await CatalogService.resolveOrCreate('IMPLANT_TYPE', name, _typeCatalog);
                        if (isEdit) {
                          await ApiClient.instance.dio.patch('/clinical/implants-devices/${existing['id']}', data: {
                            'deviceName': name,
                            if (deviceTypeId != null) 'deviceTypeId': deviceTypeId,
                            'implantedAt': implantedAt != null ? implantedAt!.toIso8601String().split('T').first : null,
                            'notes': notesController.text.trim().isNotEmpty ? notesController.text.trim() : null,
                          });
                        } else {
                          final provisional = canonicalCatalog.firstWhere((s) => s.code == 'PROVISIONAL');
                          final selfDeclared = provenanceCatalog.firstWhere((p) => p.code == 'SELF_DECLARED');
                          await ApiClient.instance.dio.post('/clinical/implants-devices', data: {
                            'personId': _personId,
                            'deviceName': name,
                            if (deviceTypeId != null) 'deviceTypeId': deviceTypeId,
                            if (implantedAt != null) 'implantedAt': implantedAt!.toIso8601String().split('T').first,
                            if (notesController.text.trim().isNotEmpty) 'notes': notesController.text.trim(),
                            'canonicalStatusId': provisional.id,
                            'provenanceId': selfDeclared.id,
                          });
                        }
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        await _load();
                      },
                child: Text(context.tr('common.save')),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _LoadErrorView(message: _error!, onRetry: _load);
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: _items.isEmpty
            ? ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(context.tr('health.implant.emptyList')))])
            : ListView.builder(
                itemCount: _items.length,
                itemBuilder: (context, i) {
                  final d = _items[i] as Map<String, dynamic>;
                  final date = d['implantedAt'] as String?;
                  final typeLabel = CatalogService.labelFor(_typeCatalog, d['deviceTypeId'] as String?, lang: context.lang);
                  return _RecordCard(
                    icon: Icons.settings_input_component_outlined,
                    iconBackground: _RecordColors.implantBg,
                    iconColor: _RecordColors.implantIcon,
                    title: d['deviceName'] as String? ?? '',
                    badgeLabel: d['deviceTypeId'] != null ? typeLabel : null,
                    badgeBackground: _RecordColors.implantBg,
                    badgeColor: _RecordColors.implantIcon,
                    subtitle: date != null ? _formatIsoDate(date) : null,
                    onEdit: () => _openForm(d),
                    onDelete: () => _confirmAndSoftDelete(
                      context: context,
                      resource: 'implants-devices',
                      id: d['id'] as String,
                      itemLabel: d['deviceName'] as String? ?? context.tr('health.implant.deletedFallback'),
                      onDeleted: _load,
                    ),
                  );
                },
              ),
      ),
      floatingActionButton: FloatingActionButton(onPressed: _openForm, child: const Icon(Icons.add)),
    );
  }
}

/// Pedido explícito del usuario: "para el caso de diálisis, como la
/// tenemos que tratar ya que es un tratamiento... deberíamos tener
/// también una tabla que pueda ser actualizada como enfermedades" —
/// mismo patrón que _ImplantsTab (arriba), con el agregado del
/// dropdown de estado (CONDITION_STATUS reutilizado) igual que
/// _ConditionsTab, ya que un tratamiento puede seguir en curso o haber
/// terminado.
class _TreatmentsTab extends StatefulWidget {
  const _TreatmentsTab({super.key});
  @override
  State<_TreatmentsTab> createState() => _TreatmentsTabState();
}

class _TreatmentsTabState extends State<_TreatmentsTab> {
  List<dynamic> _items = [];
  List<CatalogValue> _typeCatalog = [];
  List<CatalogValue> _statusCatalog = [];
  bool _loading = true;
  String? _error;

  String get _personId => context.read<AuthState>().personId!;

  String? get _activeStatusId {
    for (final c in _statusCatalog) {
      if (c.code == 'ACTIVE') return c.id;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ApiClient.instance.dio.get('/clinical/treatments', queryParameters: {'personId': _personId});
      final typeCatalog = await CatalogService.get('TREATMENT_TYPE');
      final statusCatalog = await CatalogService.get('CONDITION_STATUS');
      if (!mounted) return;
      setState(() {
        _items = response.data as List;
        _typeCatalog = typeCatalog;
        _statusCatalog = statusCatalog;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _errorMessage(e, context.tr('health.treatment.loadError'));
        _loading = false;
      });
    }
  }

  Future<void> _openForm([Map<String, dynamic>? existing]) async {
    final isEdit = existing != null;
    final canonicalCatalog = await CatalogService.get('CANONICAL_STATUS');
    final provenanceCatalog = await CatalogService.get('PROVENANCE_TYPE');
    late TextEditingController nameController;
    final notesController = TextEditingController(text: existing?['notes'] as String? ?? '');
    String? statusId = existing?['statusId'] as String? ?? _activeStatusId;
    DateTime? startedAt = existing?['startedAt'] != null
        ? DateTime.tryParse(existing!['startedAt'] as String)
        : null;

    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: StatefulBuilder(
          builder: (ctx, setSheetState) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(isEdit ? context.tr('health.treatment.editTitle') : context.tr('health.treatment.addTitle'), style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                context.tr('health.treatment.hint'),
                style: Theme.of(ctx).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              Autocomplete<CatalogValue>(
                initialValue: TextEditingValue(text: existing?['treatmentName'] as String? ?? ''),
                displayStringForOption: (c) => c.label(context.lang),
                optionsBuilder: (v) => v.text.isEmpty
                    ? const Iterable<CatalogValue>.empty()
                    : _typeCatalog.where((c) => c.label(context.lang).toLowerCase().contains(v.text.toLowerCase())),
                fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
                  nameController = controller;
                  return TextField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: InputDecoration(labelText: context.tr('health.treatment.nameLabel')),
                  );
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: statusId,
                isExpanded: true,
                decoration: InputDecoration(labelText: context.tr('health.condition.statusLabel')),
                items: _statusCatalog.map((c) => DropdownMenuItem(value: c.id, child: Text(c.label(context.lang), overflow: TextOverflow.ellipsis))).toList(),
                onChanged: (v) => setSheetState(() => statusId = v),
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(startedAt != null
                    ? context.tr('health.treatment.dateWithValue', params: {'date': _formatDate(startedAt!)})
                    : context.tr('health.treatment.dateEmptyOptional')),
                trailing: const Icon(Icons.calendar_today),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: DateTime(2020),
                    firstDate: DateTime(1930),
                    lastDate: DateTime.now(),
                  );
                  if (picked != null) setSheetState(() => startedAt = picked);
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: notesController,
                maxLines: 2,
                decoration: InputDecoration(labelText: context.tr('health.allergy.notesOptional')),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () async {
                        if (nameController.text.trim().isEmpty) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(content: Text(context.tr('health.treatment.enterTreatmentError'))),
                          );
                          return;
                        }
                        final name = normalizeSpanishAccents(nameController.text.trim());
                        final treatmentCatalogId = await CatalogService.resolveOrCreate('TREATMENT_TYPE', name, _typeCatalog);
                        if (isEdit) {
                          await ApiClient.instance.dio.patch('/clinical/treatments/${existing['id']}', data: {
                            'treatmentName': name,
                            if (treatmentCatalogId != null) 'treatmentCatalogId': treatmentCatalogId,
                            'statusId': statusId,
                            'startedAt': startedAt != null ? startedAt!.toIso8601String().split('T').first : null,
                            'notes': notesController.text.trim().isNotEmpty ? notesController.text.trim() : null,
                          });
                        } else {
                          final provisional = canonicalCatalog.firstWhere((s) => s.code == 'PROVISIONAL');
                          final selfDeclared = provenanceCatalog.firstWhere((p) => p.code == 'SELF_DECLARED');
                          await ApiClient.instance.dio.post('/clinical/treatments', data: {
                            'personId': _personId,
                            'treatmentName': name,
                            if (treatmentCatalogId != null) 'treatmentCatalogId': treatmentCatalogId,
                            'statusId': statusId,
                            if (startedAt != null) 'startedAt': startedAt!.toIso8601String().split('T').first,
                            if (notesController.text.trim().isNotEmpty) 'notes': notesController.text.trim(),
                            'canonicalStatusId': provisional.id,
                            'provenanceId': selfDeclared.id,
                          });
                        }
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        await _load();
                      },
                child: Text(context.tr('common.save')),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _LoadErrorView(message: _error!, onRetry: _load);
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: _items.isEmpty
            ? ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(context.tr('health.treatment.emptyList')))])
            : ListView.builder(
                itemCount: _items.length,
                itemBuilder: (context, i) {
                  final t = _items[i] as Map<String, dynamic>;
                  final date = t['startedAt'] as String?;
                  final statusCode = _statusCatalog.firstWhere(
                    (c) => c.id == t['statusId'],
                    orElse: () => CatalogValue(id: '', code: '', labelEs: ''),
                  ).code;
                  return _RecordCard(
                    icon: Icons.medical_services_outlined,
                    iconBackground: _RecordColors.treatmentBg,
                    iconColor: _RecordColors.treatmentIcon,
                    title: t['treatmentName'] as String? ?? '',
                    badgeLabel: statusCode != 'ACTIVE' && statusCode.isNotEmpty
                        ? CatalogService.labelFor(_statusCatalog, t['statusId'] as String?, lang: context.lang)
                        : null,
                    badgeBackground: _RecordColors.treatmentBg,
                    badgeColor: _RecordColors.treatmentIcon,
                    subtitle: date != null ? _formatIsoDate(date) : null,
                    onEdit: () => _openForm(t),
                    onDelete: () => _confirmAndSoftDelete(
                      context: context,
                      resource: 'treatments',
                      id: t['id'] as String,
                      itemLabel: t['treatmentName'] as String? ?? context.tr('health.treatment.deletedFallback'),
                      onDeleted: _load,
                    ),
                  );
                },
              ),
      ),
      floatingActionButton: FloatingActionButton(onPressed: _openForm, child: const Icon(Icons.add)),
    );
  }
}

/// Pedido explícito del usuario: poder ver, desde el Historial de
/// Salud, las notas que un médico dejó al atenderlo (por QR/link, ver
/// emergency.claim_share_note) — recomendaciones, tratamiento y notas
/// libres, con quién lo atendió y si esa nota ya quedó certificada o
/// todavía está pendiente de que el propio viajero la confirme. Solo
/// lectura a propósito: no hay ninguna acción de aprobar/objetar
/// todavía (queda para más adelante), así que no lleva FAB ni
/// edición/borrado como el resto de las pestañas.
class _EncountersTab extends StatefulWidget {
  const _EncountersTab({super.key});
  @override
  State<_EncountersTab> createState() => _EncountersTabState();
}

class _EncountersTabState extends State<_EncountersTab> {
  List<dynamic> _items = [];
  List<CatalogValue> _specialtyCatalog = [];
  List<CatalogValue> _docTypeCatalog = [];
  List<CatalogValue> _countryCatalog = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ApiClient.instance.dio.get('/me/clinical/encounters');
      final specialtyCatalog = await CatalogService.get('MEDICAL_SPECIALTY');
      final docTypeCatalog = await CatalogService.get('DOCUMENT_TYPE');
      final countryCatalog = await CatalogService.get('COUNTRY');
      if (!mounted) return;
      setState(() {
        _items = response.data as List;
        _specialtyCatalog = specialtyCatalog;
        _docTypeCatalog = docTypeCatalog;
        _countryCatalog = countryCatalog;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _errorMessage(e, context.tr('health.encounter.loadError'));
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _LoadErrorView(message: _error!, onRetry: _load);
    return RefreshIndicator(
      onRefresh: _load,
      child: _items.isEmpty
          ? ListView(children: [
              Padding(padding: const EdgeInsets.all(24), child: Text(context.tr('health.encounter.emptyList'))),
            ])
          : ListView.builder(
              itemCount: _items.length,
              itemBuilder: (context, i) => _EncounterCard(
                encounter: _items[i] as Map<String, dynamic>,
                specialtyCatalog: _specialtyCatalog,
                docTypeCatalog: _docTypeCatalog,
                countryCatalog: _countryCatalog,
                onConfirm: _confirm,
                onChallenge: _challenge,
              ),
            ),
    );
  }

  /// Fase 3 — el viajero confirma una nota pendiente. Ver
  /// MeClinicalController.confirmEncounter (mismo UPDATE probado en
  /// 009_tests.sql T2.2).
  Future<void> _confirm(String submissionId) async {
    try {
      await ApiClient.instance.dio.patch('/me/clinical/encounters/$submissionId/confirm');
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_errorMessage(e, context.tr('health.encounter.actionError')))),
      );
    }
  }

  /// Fase 3 — el viajero objeta una nota pendiente (motivo opcional).
  /// No revierte canonical_status_id del lado del backend — la nota
  /// queda visible igual, solo marcada como objetada.
  Future<void> _challenge(String submissionId, String? notes) async {
    try {
      await ApiClient.instance.dio.patch(
        '/me/clinical/encounters/$submissionId/challenge',
        data: {if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim()},
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_errorMessage(e, context.tr('health.encounter.actionError')))),
      );
    }
  }
}

class _EncounterCard extends StatelessWidget {
  const _EncounterCard({
    required this.encounter,
    required this.specialtyCatalog,
    required this.docTypeCatalog,
    required this.countryCatalog,
    required this.onConfirm,
    required this.onChallenge,
  });

  final Map<String, dynamic> encounter;
  final List<CatalogValue> specialtyCatalog;
  final List<CatalogValue> docTypeCatalog;
  final List<CatalogValue> countryCatalog;
  final Future<void> Function(String submissionId) onConfirm;
  final Future<void> Function(String submissionId, String? notes) onChallenge;

  @override
  Widget build(BuildContext context) {
    final firstName = encounter['professionalFirstName'] as String?;
    final lastName = encounter['professionalLastName'] as String?;
    final professionalName = (firstName != null || lastName != null)
        ? [firstName, lastName].where((s) => (s ?? '').isNotEmpty).join(' ')
        : null;
    final institution = encounter['professionalInstitution'] as String?;
    final specialtyId = encounter['professionalSpecialtyId'] as String?;
    final specialtyLabel = specialtyId != null
        ? CatalogService.labelFor(specialtyCatalog, specialtyId, lang: context.lang)
        : null;
    final date = encounter['encounterDate'] as String?;
    final clinicalData = encounter['clinicalData'] as Map<String, dynamic>?;
    final recommendations = clinicalData?['recommendations'] as String?;
    final treatment = clinicalData?['treatment'] as String?;
    final notes = clinicalData?['notes'] as String? ?? encounter['notes'] as String?;

    // Pedido explícito del usuario: poder referenciar al profesional —
    // matrícula, documento y país, no solo el nombre.
    final licenseNumber = encounter['professionalLicenseNumber'] as String?;
    final docNumber = encounter['professionalDocNumber'] as String?;
    final docTypeId = encounter['professionalDocTypeId'] as String?;
    final countryId = encounter['professionalCountryId'] as String?;
    final professionalIsActive = encounter['professionalIsActive'] as bool? ?? true;
    final professionalRefParts = <String>[
      if (licenseNumber != null && licenseNumber.isNotEmpty)
        context.tr('health.encounter.licenseLabel', params: {'value': licenseNumber}),
      if (docNumber != null && docNumber.isNotEmpty)
        '${docTypeId != null ? CatalogService.labelFor(docTypeCatalog, docTypeId, lang: context.lang) : ''} $docNumber'.trim(),
      if (countryId != null) CatalogService.labelFor(countryCatalog, countryId, lang: context.lang),
    ];

    final certified = encounter['submissionId'] != null &&
        (encounter['certificationCode'] as String?) == 'PROFESSIONALLY_CERTIFIED';
    final confirmationCode = encounter['confirmationCode'] as String?;
    final submissionId = encounter['submissionId'] as String?;
    final isPending = submissionId != null &&
        confirmationCode != 'MEMBER_CONFIRMED' &&
        confirmationCode != 'MEMBER_CHALLENGED' &&
        confirmationCode != 'PLATFORM_CONFIRMED';
    String? badgeLabel;
    Color badgeBg = _RecordColors.neutralBg;
    Color badgeColor = _RecordColors.neutralIcon;
    if (encounter['submissionId'] != null) {
      if (certified) {
        badgeLabel = context.tr('health.encounter.certifiedBadge');
        badgeBg = _RecordColors.conditionBg;
        badgeColor = _RecordColors.conditionIcon;
      } else if (confirmationCode == 'MEMBER_CONFIRMED') {
        badgeLabel = context.tr('health.encounter.confirmedBadge');
        badgeBg = _RecordColors.conditionBg;
        badgeColor = _RecordColors.conditionIcon;
      } else if (confirmationCode == 'PLATFORM_CONFIRMED') {
        badgeLabel = context.tr('health.encounter.platformConfirmedBadge');
        badgeBg = _RecordColors.conditionBg;
        badgeColor = _RecordColors.conditionIcon;
      } else if (confirmationCode == 'MEMBER_CHALLENGED') {
        badgeLabel = context.tr('health.encounter.challengedBadge');
        badgeBg = _RecordColors.allergyBg;
        badgeColor = _RecordColors.allergyIcon;
      } else {
        badgeLabel = context.tr('health.encounter.pendingBadge');
        badgeBg = _RecordColors.allergyAmberBg;
        badgeColor = _RecordColors.allergyAmberIcon;
      }
    }

    final subtitleParts = <String>[
      if (professionalName != null && professionalName.isNotEmpty) professionalName,
      if (specialtyLabel != null) specialtyLabel,
      if (institution != null && institution.isNotEmpty) institution,
    ];

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade300, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: const BoxDecoration(color: _RecordColors.encounterBg, shape: BoxShape.circle),
                child: const Icon(Icons.medical_information_outlined, size: 17, color: _RecordColors.encounterIcon),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        Text(
                          professionalName != null && professionalName.isNotEmpty
                              ? professionalName
                              : context.tr('health.encounter.unknownProfessional'),
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
                        ),
                        if (badgeLabel != null)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(color: badgeBg, borderRadius: BorderRadius.circular(20)),
                            child: Text(badgeLabel, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: badgeColor)),
                          ),
                      ],
                    ),
                    if (subtitleParts.length > 1 || date != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        [
                          if (subtitleParts.length > 1) subtitleParts.skip(1).join(' · '),
                          if (date != null) _formatIsoDate(date),
                        ].where((s) => s.isNotEmpty).join(' · '),
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                    ],
                    if (professionalRefParts.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        professionalRefParts.join(' · '),
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                    ],
                    if (!professionalIsActive && submissionId != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        context.tr('health.encounter.professionalNotValidated'),
                        style: TextStyle(fontSize: 11, color: Colors.orange.shade800),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if ((recommendations ?? '').isNotEmpty || (treatment ?? '').isNotEmpty || (notes ?? '').isNotEmpty) ...[
            const SizedBox(height: 10),
            if ((recommendations ?? '').isNotEmpty)
              _EncounterField(label: context.tr('health.encounter.recommendationsLabel'), value: recommendations!),
            if ((treatment ?? '').isNotEmpty)
              _EncounterField(label: context.tr('health.encounter.treatmentLabel'), value: treatment!),
            if ((notes ?? '').isNotEmpty)
              _EncounterField(label: context.tr('health.encounter.notesLabel'), value: notes!),
          ],
          if (isPending) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async {
                      final notesInput = await _showChallengeDialog(context);
                      if (notesInput == _challengeCancelled) return;
                      await onChallenge(submissionId, notesInput);
                    },
                    child: Text(context.tr('health.encounter.challengeAction')),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: () => onConfirm(submissionId),
                    child: Text(context.tr('health.encounter.confirmAction')),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  /// Sentinel para distinguir "canceló el diálogo" (no hacer nada) de
  /// "confirmó sin escribir motivo" (notas null, igual dispara la
  /// objeción) — showDialog<String>() ya devuelve null en ambos casos.
  static const _challengeCancelled = '__cancelled__';

  Future<String?> _showChallengeDialog(BuildContext context) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.tr('health.encounter.challengeDialogTitle')),
        content: TextField(
          controller: controller,
          maxLines: 3,
          decoration: InputDecoration(hintText: ctx.tr('health.encounter.challengeDialogHint')),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(_challengeCancelled),
            child: Text(ctx.tr('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text),
            child: Text(ctx.tr('health.encounter.challengeAction')),
          ),
        ],
      ),
    );
    return result ?? _challengeCancelled;
  }
}

class _EncounterField extends StatelessWidget {
  const _EncounterField({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
          Text(value, style: const TextStyle(fontSize: 13)),
        ],
      ),
    );
  }
}
