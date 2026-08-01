import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/catalog_service.dart';

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

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Ficha médica'),
          actions: [
            IconButton(
              icon: const Icon(Icons.health_and_safety_outlined),
              tooltip: 'Cargar con el asistente de salud',
              onPressed: () => context.push('/health-assistant'),
            ),
          ],
          bottom: const TabBar(tabs: [
            Tab(text: 'Alergias'),
            Tab(text: 'Condiciones'),
            Tab(text: 'Medicamentos'),
          ]),
        ),
        body: const TabBarView(children: [
          _AllergiesTab(),
          _ConditionsTab(),
          _MedicationsTab(),
        ]),
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
  bool _loading = true;

  String get _personId => context.read<AuthState>().personId!;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final response = await ApiClient.instance.dio.get('/clinical/allergies', queryParameters: {'personId': _personId});
    setState(() {
      _items = response.data as List;
      _loading = false;
    });
  }

  Future<void> _openForm() async {
    final typeCatalog = await CatalogService.get('ALLERGEN_TYPE');
    final severityCatalog = await CatalogService.get('REACTION_SEVERITY');
    final statusCatalog = await CatalogService.get('CANONICAL_STATUS');
    final provenanceCatalog = await CatalogService.get('PROVENANCE_TYPE');
    final nameController = TextEditingController();
    final notesController = TextEditingController();
    String? typeId;
    String? severityId;

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
              Text('Agregar alergia', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 12),
              TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Alérgeno')),
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
                onPressed: (typeId == null || severityId == null || nameController.text.trim().isEmpty)
                    ? null
                    : () async {
                        final provisional = statusCatalog.firstWhere((s) => s.code == 'PROVISIONAL');
                        final selfDeclared = provenanceCatalog.firstWhere((p) => p.code == 'SELF_DECLARED');
                        await ApiClient.instance.dio.post('/clinical/allergies', data: {
                          'personId': _personId,
                          'allergenName': nameController.text.trim(),
                          'allergenTypeId': typeId,
                          'severityId': severityId,
                          'canonicalStatusId': provisional.id,
                          'provenanceId': selfDeclared.id,
                          if (notesController.text.trim().isNotEmpty) 'notes': notesController.text.trim(),
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

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
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
                  return ListTile(
                    title: Text(a['allergenName'] as String? ?? ''),
                    subtitle: a['notes'] != null ? Text(a['notes'] as String) : null,
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
  bool _loading = true;

  String get _personId => context.read<AuthState>().personId!;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final response = await ApiClient.instance.dio.get('/clinical/conditions', queryParameters: {'personId': _personId});
    setState(() {
      _items = response.data as List;
      _loading = false;
    });
  }

  Future<void> _openForm() async {
    final statusCatalog = await CatalogService.get('CONDITION_STATUS');
    final canonicalCatalog = await CatalogService.get('CANONICAL_STATUS');
    final provenanceCatalog = await CatalogService.get('PROVENANCE_TYPE');
    final nameController = TextEditingController();
    String? statusId;

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
              Text('Agregar condición', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 12),
              TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Condición', helperText: 'Ej. Diabetes tipo 2')),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: statusId,
                decoration: const InputDecoration(labelText: 'Estado'),
                items: statusCatalog.map((c) => DropdownMenuItem(value: c.id, child: Text(c.labelEs))).toList(),
                onChanged: (v) => setSheetState(() => statusId = v),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: (statusId == null || nameController.text.trim().isEmpty)
                    ? null
                    : () async {
                        final provisional = canonicalCatalog.firstWhere((s) => s.code == 'PROVISIONAL');
                        final selfDeclared = provenanceCatalog.firstWhere((p) => p.code == 'SELF_DECLARED');
                        await ApiClient.instance.dio.post('/clinical/conditions', data: {
                          'personId': _personId,
                          'conditionName': nameController.text.trim(),
                          'statusId': statusId,
                          'canonicalStatusId': provisional.id,
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

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: _items.isEmpty
            ? ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('Sin condiciones registradas.'))])
            : ListView.builder(
                itemCount: _items.length,
                itemBuilder: (context, i) {
                  final c = _items[i] as Map<String, dynamic>;
                  return ListTile(title: Text(c['conditionName'] as String? ?? ''));
                },
              ),
      ),
      floatingActionButton: FloatingActionButton(onPressed: _openForm, child: const Icon(Icons.add)),
    );
  }
}

class _MedicationsTab extends StatefulWidget {
  const _MedicationsTab();
  @override
  State<_MedicationsTab> createState() => _MedicationsTabState();
}

class _MedicationsTabState extends State<_MedicationsTab> {
  List<dynamic> _items = [];
  bool _loading = true;

  String get _personId => context.read<AuthState>().personId!;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final response = await ApiClient.instance.dio.get('/clinical/medications', queryParameters: {'personId': _personId});
    setState(() {
      _items = response.data as List;
      _loading = false;
    });
  }

  Future<void> _openForm() async {
    final canonicalCatalog = await CatalogService.get('CANONICAL_STATUS');
    final provenanceCatalog = await CatalogService.get('PROVENANCE_TYPE');
    final doseUnitCatalog = await CatalogService.get('DOSE_UNIT');
    final nameController = TextEditingController();
    final brandController = TextEditingController();
    final manufacturerController = TextEditingController();
    final doseAmountController = TextEditingController();
    String? doseUnitId;

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
              Text('Agregar medicamento', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 12),
              TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Droga (nombre genérico)')),
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
              const SizedBox(height: 16),
              FilledButton(
                onPressed: nameController.text.trim().isEmpty
                    ? null
                    : () async {
                        final provisional = canonicalCatalog.firstWhere((s) => s.code == 'PROVISIONAL');
                        final selfDeclared = provenanceCatalog.firstWhere((p) => p.code == 'SELF_DECLARED');
                        await ApiClient.instance.dio.post('/clinical/medications', data: {
                          'personId': _personId,
                          'genericName': nameController.text.trim(),
                          if (brandController.text.trim().isNotEmpty) 'brandName': brandController.text.trim(),
                          if (manufacturerController.text.trim().isNotEmpty) 'manufacturer': manufacturerController.text.trim(),
                          if (doseAmountController.text.trim().isNotEmpty) 'doseAmount': doseAmountController.text.trim(),
                          if (doseUnitId != null) 'doseUnitId': doseUnitId,
                          'isCurrent': true,
                          'canonicalStatusId': provisional.id,
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

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
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
                  final subtitleParts = <String>[
                    if (doseAmount != null) '$doseAmount',
                    if (manufacturer != null) manufacturer,
                  ];
                  return ListTile(
                    title: Text('${m['genericName']}${brand != null ? ' ($brand)' : ''}'),
                    subtitle: subtitleParts.isEmpty ? null : Text(subtitleParts.join(' · ')),
                  );
                },
              ),
      ),
      floatingActionButton: FloatingActionButton(onPressed: _openForm, child: const Icon(Icons.add)),
    );
  }
}
