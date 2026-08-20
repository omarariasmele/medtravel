import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/text_normalize.dart';
import '../../core/auth_state.dart';
import '../../core/catalog_service.dart';
import '../assistant/health_assistant_screen.dart' show openHealthAssistant;

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
class _RecordCard extends StatelessWidget {
  const _RecordCard({
    required this.icon,
    required this.iconBackground,
    required this.iconColor,
    required this.title,
    this.badgeLabel,
    this.badgeBackground,
    this.badgeColor,
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
              tooltip: 'Editar',
              onPressed: onEdit,
            ),
          if (onDelete != null)
            IconButton(
              icon: Icon(Icons.delete_outline, size: 20, color: Colors.grey.shade600),
              tooltip: 'Borrar',
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
      title: const Text('¿Borrar este dato?'),
      content: Text('Vas a borrar "$itemLabel". Si lo cargaste por error, esta acción lo saca de tu Historial de Salud.'),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
        FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Borrar')),
      ],
    ),
  );
  if (confirmed != true) return;
  try {
    await ApiClient.instance.dio.patch('/clinical/$resource/$id', data: {
      'deletedAt': DateTime.now().toUtc().toIso8601String(),
    });
    await onDeleted();
  } catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_errorMessage(e, 'No se pudo borrar. Probá de nuevo.'))),
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
  static const neutralBg = Color(0xFFF1EFE8);
  static const neutralIcon = Color(0xFF444441);
  static const vitalsBg = Color(0xFFE1F5EE);
  static const vitalsIcon = Color(0xFF085041);
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
            OutlinedButton(onPressed: onRetry, child: const Text('Reintentar')),
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

class _HealthRecordsScreenState extends State<HealthRecordsScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  DateTime? _lastUpdatedAt;
  int _reminderDays = 60;
  bool _loadingLastUpdated = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 7, vsync: this);
    _loadLastUpdated();
  }

  @override
  void dispose() {
    _tabController.dispose();
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

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 7,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Historial de Salud'),
          actions: [
            IconButton(
              icon: const Icon(Icons.health_and_safety_outlined),
              tooltip: 'Actualizar información de la Ficha de Salud',
              onPressed: () => openHealthAssistant(context),
            ),
          ],
          // Pedido explícito del usuario: "eliminar el título Comorbilidades
          // de todos lados, es enfermedades o enfermedades crónicas" — esta
          // solapa agrupa ambas (crónicas y no crónicas), por eso queda
          // "Enfermedades" (sin "Crónicas"), igual que en admin-web.
          bottom: const TabBar(isScrollable: true, tabs: [
            Tab(text: 'Alergias'),
            Tab(text: 'Enfermedades'),
            Tab(text: 'Implantes'),
            Tab(text: 'Medicamentos'),
            Tab(text: 'Cirugías'),
            Tab(text: 'Peso y Mediciones'),
            Tab(text: 'Estudios'),
          ]),
        ),
        body: Column(
          children: [
            if (!_loadingLastUpdated) _LastUpdatedBanner(
              lastUpdatedAt: _lastUpdatedAt,
              needsReminder: _needsReminder,
              onUpdatePressed: () => openHealthAssistant(context),
            ),
            const Expanded(
              child: TabBarView(children: [
                _AllergiesTab(),
                _ConditionsTab(),
                _ImplantsTab(),
                _MedicationsTab(),
                _SurgeriesTab(),
                _VitalsTab(),
                _LabResultsTab(),
              ]),
            ),
          ],
        ),
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
      message = 'No hay información de salud registrada todavía. Ingresá tus datos por si los necesitás ante una emergencia.';
    } else if (needsReminder) {
      message = 'Última actualización: ${_formatDate(lastUpdatedAt!)}. ¿Tenés alguna novedad de salud? Actualizala.';
    } else {
      message = 'Última actualización: ${_formatDate(lastUpdatedAt!)}';
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
            TextButton(onPressed: onUpdatePressed, child: Text(hasData ? 'Actualizar' : 'Ingresar datos')),
        ],
      ),
    );
  }
}

class _AllergiesTab extends StatefulWidget {
  const _AllergiesTab();
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
        _error = _errorMessage(e, 'No se pudieron cargar las alergias.');
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
              Text(isEdit ? 'Editar alergia' : 'Agregar alergia', style: Theme.of(ctx).textTheme.titleLarge),
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
                displayStringForOption: (c) => c.labelEs,
                optionsBuilder: (v) => v.text.isEmpty
                    ? const Iterable<CatalogValue>.empty()
                    : allergenCatalog.where((c) => c.labelEs.toLowerCase().contains(v.text.toLowerCase())),
                fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
                  nameController = controller;
                  return TextField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: const InputDecoration(labelText: 'Alérgeno'),
                  );
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: typeId,
                decoration: const InputDecoration(labelText: 'Tipo'),
                items: typeCatalog.map((c) => DropdownMenuItem(value: c.id, child: Text(c.labelEs))).toList(),
                onChanged: (v) => setSheetState(() => typeId = v),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: severityId,
                decoration: const InputDecoration(labelText: 'Severidad'),
                items: severityCatalog.map((c) => DropdownMenuItem(value: c.id, child: Text(c.labelEs))).toList(),
                onChanged: (v) => setSheetState(() => severityId = v),
              ),
              const SizedBox(height: 12),
              TextField(controller: notesController, decoration: const InputDecoration(labelText: 'Notas (opcional)')),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: (typeId == null || severityId == null)
                    ? null
                    : () async {
                        if (nameController.text.trim().isEmpty) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            const SnackBar(content: Text('Ingresá el alérgeno.')),
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
                child: const Text('Guardar'),
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
            ? ListView(children: const [
                Padding(padding: EdgeInsets.all(24), child: Text('Sin alergias registradas.')),
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
                    if (createdAt != null) 'Registrada ${_formatIsoDate(createdAt)}',
                    if (a['notes'] != null) a['notes'] as String,
                  ];
                  return _RecordCard(
                    icon: Icons.warning_amber_outlined,
                    iconBackground: isHighSeverity ? _RecordColors.allergyBg : _RecordColors.allergyAmberBg,
                    iconColor: isHighSeverity ? _RecordColors.allergyIcon : _RecordColors.allergyAmberIcon,
                    title: a['allergenName'] as String? ?? '',
                    badgeLabel: severity?.labelEs,
                    badgeBackground: isHighSeverity ? _RecordColors.allergyBg : _RecordColors.allergyAmberBg,
                    badgeColor: isHighSeverity ? _RecordColors.allergyIcon : _RecordColors.allergyAmberIcon,
                    subtitle: subtitleParts.isEmpty ? null : subtitleParts.join(' · '),
                    onEdit: () => _openForm(a),
                    onDelete: () => _confirmAndSoftDelete(
                      context: context,
                      resource: 'allergies',
                      id: a['id'] as String,
                      itemLabel: a['allergenName'] as String? ?? 'esta alergia',
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
  const _ConditionsTab();
  @override
  State<_ConditionsTab> createState() => _ConditionsTabState();
}

class _ConditionsTabState extends State<_ConditionsTab> {
  List<dynamic> _items = [];
  List<CatalogValue> _statusCatalog = [];
  bool _loading = true;
  String? _error;

  String get _personId => context.read<AuthState>().personId!;

  String? get _chronicStatusId {
    for (final c in _statusCatalog) {
      if (c.code == 'CHRONIC') return c.id;
    }
    return null;
  }

  String _statusLabel(String? statusId) => CatalogService.labelFor(_statusCatalog, statusId);

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
      if (!mounted) return;
      setState(() {
        _items = response.data as List;
        _statusCatalog = statusCatalog;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _errorMessage(e, 'No se pudieron cargar los antecedentes.');
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
              Text(isEdit ? 'Editar condición' : 'Agregar condición', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 12),
              Autocomplete<CatalogValue>(
                initialValue: TextEditingValue(text: existing?['conditionName'] as String? ?? ''),
                displayStringForOption: (c) => c.labelEs,
                optionsBuilder: (v) => v.text.isEmpty
                    ? const Iterable<CatalogValue>.empty()
                    : conditionCatalog.where((c) => c.labelEs.toLowerCase().contains(v.text.toLowerCase())),
                fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
                  nameController = controller;
                  return TextField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: const InputDecoration(labelText: 'Condición', helperText: 'Ej. Diabetes tipo 2'),
                  );
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: statusId,
                decoration: const InputDecoration(labelText: 'Estado'),
                items: statusCatalog.map((c) => DropdownMenuItem(value: c.id, child: Text(c.labelEs))).toList(),
                onChanged: (v) => setSheetState(() => statusId = v),
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(diagnosedAt != null
                    ? 'Fecha de diagnóstico: ${_formatDate(diagnosedAt!)}'
                    : 'Fecha de diagnóstico (opcional, aproximada si no la recordás)'),
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
                            const SnackBar(content: Text('Ingresá la condición.')),
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
                child: const Text('Guardar'),
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
            ? ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('Sin condiciones registradas.'))])
            : ListView(
                children: [
                  if (chronic.isNotEmpty) ..._conditionSection('Enfermedades Crónicas', chronic),
                  if (other.isNotEmpty) ..._conditionSection('Enfermedades', other),
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
        for (final e in items)
          _RecordCard(
            icon: Icons.favorite_border,
            iconBackground: _RecordColors.conditionBg,
            iconColor: _RecordColors.conditionIcon,
            title: (e as Map<String, dynamic>)['conditionName'] as String? ?? '',
            badgeLabel: const {'ACTIVE', 'CHRONIC'}.contains(_statusCode(e['statusId'] as String?))
                ? null
                : _statusLabel(e['statusId'] as String?),
            badgeBackground: e['statusId'] == _chronicStatusId ? _RecordColors.conditionBg : _RecordColors.neutralBg,
            badgeColor: e['statusId'] == _chronicStatusId ? _RecordColors.conditionIcon : _RecordColors.neutralIcon,
            subtitle: e['diagnosedAt'] != null ? 'Diagnosticada ${_formatIsoDate(e['diagnosedAt'] as String)}' : null,
            onEdit: () => _openForm(e),
            onDelete: () => _confirmAndSoftDelete(
              context: context,
              resource: 'conditions',
              id: e['id'] as String,
              itemLabel: e['conditionName'] as String? ?? 'esta condición',
              onDeleted: _load,
            ),
          ),
      ];
}

class _MedicationsTab extends StatefulWidget {
  const _MedicationsTab();
  @override
  State<_MedicationsTab> createState() => _MedicationsTabState();
}

class _MedicationsTabState extends State<_MedicationsTab> {
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
      final response = await ApiClient.instance.dio.get('/clinical/medications', queryParameters: {'personId': _personId});
      if (!mounted) return;
      setState(() {
        _items = response.data as List;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _errorMessage(e, 'No se pudieron cargar los medicamentos.');
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
              Text(isEdit ? 'Editar medicamento' : 'Agregar medicamento', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 12),
              Autocomplete<CatalogValue>(
                initialValue: TextEditingValue(text: existing?['genericName'] as String? ?? ''),
                displayStringForOption: (c) => c.labelEs,
                optionsBuilder: (v) => v.text.isEmpty
                    ? const Iterable<CatalogValue>.empty()
                    : medicationCatalog.where((c) => c.labelEs.toLowerCase().contains(v.text.toLowerCase())),
                fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
                  nameController = controller;
                  return TextField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: const InputDecoration(labelText: 'Droga (nombre genérico)'),
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
                      decoration: const InputDecoration(labelText: 'Dosis (opcional)'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: doseUnitId,
                      decoration: const InputDecoration(labelText: 'Unidad'),
                      items: doseUnitCatalog.map((c) => DropdownMenuItem(value: c.id, child: Text(c.labelEs))).toList(),
                      onChanged: (v) => setSheetState(() => doseUnitId = v),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(controller: brandController, decoration: const InputDecoration(labelText: 'Nombre comercial (opcional)')),
              const SizedBox(height: 12),
              TextField(controller: manufacturerController, decoration: const InputDecoration(labelText: 'Laboratorio (opcional)')),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(prescribedDate == null ? 'Fecha de prescripción (opcional)' : _formatDate(prescribedDate!)),
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
                            const SnackBar(content: Text('Ingresá la droga.')),
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
                child: const Text('Guardar'),
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
            ? ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('Sin medicamentos registrados.'))])
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
                    if (startedAt != null) 'Desde ${_formatIsoDate(startedAt)}',
                  ];
                  final isCurrent = m['isCurrent'] != false;
                  return _RecordCard(
                    icon: Icons.medication_outlined,
                    iconBackground: _RecordColors.medicationBg,
                    iconColor: _RecordColors.medicationIcon,
                    title: '${m['genericName']}${brand != null ? ' ($brand)' : ''}',
                    badgeLabel: isCurrent ? 'Actual' : 'Discontinuado',
                    badgeBackground: isCurrent ? _RecordColors.medicationBg : _RecordColors.neutralBg,
                    badgeColor: isCurrent ? _RecordColors.medicationIcon : _RecordColors.neutralIcon,
                    subtitle: subtitleParts.isEmpty ? null : subtitleParts.join(' · '),
                    onEdit: () => _openForm(m),
                    onDelete: () => _confirmAndSoftDelete(
                      context: context,
                      resource: 'medications',
                      id: m['id'] as String,
                      itemLabel: m['genericName'] as String? ?? 'este medicamento',
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
  const _SurgeriesTab();
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
        _error = _errorMessage(e, 'No se pudieron cargar las cirugías.');
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
              Text(isEdit ? 'Editar cirugía' : 'Agregar cirugía', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 12),
              Autocomplete<CatalogValue>(
                initialValue: TextEditingValue(text: existing?['procedureName'] as String? ?? ''),
                displayStringForOption: (c) => c.labelEs,
                optionsBuilder: (v) => v.text.isEmpty
                    ? const Iterable<CatalogValue>.empty()
                    : surgeryCatalog.where((c) => c.labelEs.toLowerCase().contains(v.text.toLowerCase())),
                fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
                  nameController = controller;
                  return TextField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: const InputDecoration(labelText: 'Cirugía / procedimiento', helperText: 'Ej. Apendicectomía'),
                  );
                },
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(performedAt != null
                    ? 'Fecha: ${_formatDate(performedAt!)}'
                    : 'Fecha (aproximada si no la recordás)'),
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
                            const SnackBar(content: Text('Ingresá la cirugía.')),
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
                child: const Text('Guardar'),
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
            ? ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('Sin cirugías registradas.'))])
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
                    badgeLabel: 'Cirugía',
                    badgeBackground: _RecordColors.neutralBg,
                    badgeColor: _RecordColors.neutralIcon,
                    subtitle: date != null ? _formatIsoDate(date) : null,
                    onEdit: () => _openForm(s),
                    onDelete: () => _confirmAndSoftDelete(
                      context: context,
                      resource: 'surgeries',
                      id: s['id'] as String,
                      itemLabel: s['procedureName'] as String? ?? 'esta cirugía',
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
  const _VitalsTab();
  @override
  State<_VitalsTab> createState() => _VitalsTabState();
}

class _VitalsTabState extends State<_VitalsTab> {
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
      final response = await ApiClient.instance.dio.get('/clinical/vitals-history', queryParameters: {'personId': _personId});
      if (!mounted) return;
      setState(() {
        _items = (response.data as List)..sort((a, b) => (b['measuredAt'] as String).compareTo(a['measuredAt'] as String));
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _errorMessage(e, 'No se pudo cargar el historial de peso/altura.');
        _loading = false;
      });
    }
  }

  Future<void> _openForm() async {
    final provenanceCatalog = await CatalogService.get('PROVENANCE_TYPE');
    final bloodTypeCatalog = await CatalogService.get('BLOOD_TYPE');
    final weightController = TextEditingController();
    final heightController = TextEditingController();
    final sysController = TextEditingController();
    final diaController = TextEditingController();
    String? bloodTypeId;
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
              Text('Nueva medición', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                'Peso, altura y presión pueden cambiar — cada registro queda con su propia fecha, no reemplaza al anterior.',
                style: Theme.of(ctx).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: weightController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Peso (kg)'),
                onChanged: (_) => setSheetState(() {}),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: heightController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Altura (cm)'),
                onChanged: (_) => setSheetState(() {}),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: sysController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Presión — sistólica'),
                      onChanged: (_) => setSheetState(() {}),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: diaController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Presión — diastólica'),
                      onChanged: (_) => setSheetState(() {}),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: bloodTypeId,
                decoration: const InputDecoration(labelText: 'Grupo sanguíneo'),
                items: bloodTypeCatalog
                    .map((b) => DropdownMenuItem(value: b.id, child: Text(b.labelEs)))
                    .toList(),
                onChanged: (v) => setSheetState(() => bloodTypeId = v),
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('Fecha de la medición: ${_formatDate(measuredAt)}'),
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
                        diaController.text.trim().isEmpty &&
                        bloodTypeId == null)
                    ? null
                    : () async {
                        final selfDeclared = provenanceCatalog.firstWhere((p) => p.code == 'SELF_DECLARED');
                        await ApiClient.instance.dio.post('/clinical/vitals-history', data: {
                          'personId': _personId,
                          if (weightController.text.trim().isNotEmpty) 'weightKg': weightController.text.trim(),
                          if (heightController.text.trim().isNotEmpty) 'heightCm': heightController.text.trim(),
                          if (sysController.text.trim().isNotEmpty) 'bloodPressureSys': sysController.text.trim(),
                          if (diaController.text.trim().isNotEmpty) 'bloodPressureDia': diaController.text.trim(),
                          if (bloodTypeId != null) 'bloodTypeId': bloodTypeId,
                          'measuredAt': measuredAt.toIso8601String(),
                          'provenanceId': selfDeclared.id,
                        });
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        await _load();
                      },
                child: const Text('Guardar'),
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

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _LoadErrorView(message: _error!, onRetry: _load);
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: _items.isEmpty
            ? ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('Sin peso/altura/grupo sanguíneo registrados.'))])
            : ListView.builder(
                itemCount: _items.length,
                itemBuilder: (context, i) {
                  final v = _items[i] as Map<String, dynamic>;
                  final weight = v['weightKg'];
                  final computed = _heightAndBmi(i);
                  final bloodType = v['bloodTypeId'];
                  final sys = v['bloodPressureSys'];
                  final dia = v['bloodPressureDia'];
                  final parts = <String>[
                    if (computed['height'] != null)
                      'Altura: ${computed['height']} cm${computed['heightIsCarried'] == true ? ' (última cargada)' : ''}',
                    if (computed['bmi'] != null) 'IMC: ${computed['bmi']}',
                    if (sys != null && dia != null) 'Presión: $sys/$dia',
                    if (bloodType != null) 'Grupo sanguíneo cargado',
                  ];
                  final measuredAt = v['measuredAt'] as String?;
                  return _RecordCard(
                    icon: Icons.monitor_weight_outlined,
                    iconBackground: _RecordColors.vitalsBg,
                    iconColor: _RecordColors.vitalsIcon,
                    title: weight != null ? 'Peso: $weight kg' : 'Medición',
                    badgeLabel: measuredAt != null ? _formatIsoDate(measuredAt) : null,
                    badgeBackground: _RecordColors.vitalsBg,
                    badgeColor: _RecordColors.vitalsIcon,
                    subtitle: parts.isEmpty ? null : parts.join(' · '),
                  );
                },
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
  const _LabResultsTab();
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
        _error = _errorMessage(e, 'No se pudo cargar el historial de estudios.');
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
        return '${i.labelEs}: $value${unit != null ? ' $unit' : ''}';
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
                  Text('Nuevo estudio', style: Theme.of(ctx).textTheme.titleLarge),
                  const SizedBox(height: 4),
                  Text(
                    'Análisis de sangre, orina u otro estudio — cada uno queda con su propia fecha.',
                    style: Theme.of(ctx).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 12),
                  if (_studyTypeCatalog.isNotEmpty)
                    DropdownButtonFormField<String>(
                      initialValue: studyTypeId,
                      decoration: const InputDecoration(labelText: 'Tipo de estudio'),
                      items: _studyTypeCatalog.map((s) => DropdownMenuItem(value: s.id, child: Text(s.labelEs))).toList(),
                      onChanged: (v) => setSheetState(() => studyTypeId = v),
                    ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: labNameController,
                    decoration: const InputDecoration(labelText: 'Estudio (ej. análisis de sangre)'),
                  ),
                  const SizedBox(height: 12),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('Fecha del estudio: ${_formatDate(performedAt)}'),
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
                            decoration: const InputDecoration(labelText: 'Glucemia'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: hba1cController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: const InputDecoration(labelText: 'HbA1c'),
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
                            decoration: const InputDecoration(labelText: 'Colesterol total'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: creatinineController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: const InputDecoration(labelText: 'Creatinina'),
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
                            decoration: const InputDecoration(labelText: 'Hemoglobina'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: plateletsController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: const InputDecoration(labelText: 'Plaquetas'),
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
                            decoration: const InputDecoration(labelText: 'INR'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: apttController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: const InputDecoration(labelText: 'APTT'),
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (dynamicIndicators.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text('Otros indicadores', style: Theme.of(ctx).textTheme.titleSmall),
                    for (final ind in dynamicIndicators)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: TextField(
                          controller: indicatorControllers[ind.id],
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: InputDecoration(
                            labelText: ind.metadata['unit'] != null ? '${ind.labelEs} (${ind.metadata['unit']})' : ind.labelEs,
                          ),
                        ),
                      ),
                  ],
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    maxLines: 2,
                    decoration: const InputDecoration(labelText: 'Otros valores / notas'),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () async {
                      // Bug real reportado en vivo: faltaba canonicalStatusId
                      // (obligatorio en la base, todas las demás pestañas lo
                      // mandan) y no había ningún try/catch — el guardado
                      // fallaba siempre y quedaba en silencio total, sin
                      // avisarle nada al usuario.
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
                            SnackBar(content: Text(_errorMessage(e, 'No se pudo guardar el estudio — probá de nuevo.'))),
                          );
                        }
                      }
                    },
                    child: const Text('Guardar'),
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
      if (r['glucoseFasting'] != null) 'Glucemia: ${r['glucoseFasting']}',
      if (r['hba1c'] != null) 'HbA1c: ${r['hba1c']}',
      if (r['totalCholesterol'] != null) 'Colesterol: ${r['totalCholesterol']}',
      if (r['creatinine'] != null) 'Creatinina: ${r['creatinine']}',
      if (r['hemoglobin'] != null) 'Hemoglobina: ${r['hemoglobin']}',
      if (r['platelets'] != null) 'Plaquetas: ${r['platelets']}',
      if (r['ptInr'] != null) 'INR: ${r['ptInr']}',
      if (r['aptt'] != null) 'APTT: ${r['aptt']}',
      if (r['customValues'] is List)
        for (final v in (r['customValues'] as List))
          if (v is Map) _customValueLabel(v),
    ];
    return ListTile(
      title: Text(labName?.isNotEmpty == true ? labName! : 'Estudio'),
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
        : [CatalogValue(id: '', code: 'OTHER', labelEs: 'Estudios')];
    for (final type in types) {
      final groupItems = _studyTypeCatalog.isEmpty
          ? _items
          : _items.where((e) => (e as Map<String, dynamic>)['studyTypeId'] == type.id).toList();
      if (groupItems.isEmpty) continue;
      widgets.add(Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
        child: Text(type.labelEs, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
      ));
      widgets.add(_resultTile(groupItems.first as Map<String, dynamic>));
      final older = groupItems.skip(1).toList();
      if (older.isNotEmpty) {
        widgets.add(ExpansionTile(
          title: Text('Ver estudios anteriores (${older.length})'),
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
            ? ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('Sin estudios registrados.'))])
            : ListView(children: _buildGroups()),
      ),
      floatingActionButton: FloatingActionButton(onPressed: _openForm, child: const Icon(Icons.add)),
    );
  }
}

class _ImplantsTab extends StatefulWidget {
  const _ImplantsTab();
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
        _error = _errorMessage(e, 'No se pudieron cargar los implantes/dispositivos.');
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
              Text(isEdit ? 'Editar implante o dispositivo' : 'Agregar implante o dispositivo', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                'Ej. marcapasos, prótesis, bomba de insulina.',
                style: Theme.of(ctx).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              Autocomplete<CatalogValue>(
                initialValue: TextEditingValue(text: existing?['deviceName'] as String? ?? ''),
                displayStringForOption: (c) => c.labelEs,
                optionsBuilder: (v) => v.text.isEmpty
                    ? const Iterable<CatalogValue>.empty()
                    : _typeCatalog.where((c) => c.labelEs.toLowerCase().contains(v.text.toLowerCase())),
                fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
                  nameController = controller;
                  return TextField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: const InputDecoration(labelText: 'Implante / dispositivo'),
                  );
                },
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(implantedAt != null
                    ? 'Fecha: ${_formatDate(implantedAt!)}'
                    : 'Fecha (opcional, aproximada si no la recordás)'),
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
                decoration: const InputDecoration(labelText: 'Notas (opcional)'),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () async {
                        if (nameController.text.trim().isEmpty) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            const SnackBar(content: Text('Ingresá el implante/dispositivo.')),
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
                child: const Text('Guardar'),
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
            ? ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('Sin implantes ni dispositivos registrados.'))])
            : ListView.builder(
                itemCount: _items.length,
                itemBuilder: (context, i) {
                  final d = _items[i] as Map<String, dynamic>;
                  final date = d['implantedAt'] as String?;
                  final typeLabel = CatalogService.labelFor(_typeCatalog, d['deviceTypeId'] as String?);
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
                      itemLabel: d['deviceName'] as String? ?? 'este implante',
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
