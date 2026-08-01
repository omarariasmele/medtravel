import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';

/// GET /me/coverages junta health_coverages (obra social/prepaga — ver
/// más abajo, independiente de cualquier empresa de asistencia al
/// viajero) + travel_assistance_enrollments (la cobertura real,
/// creada automáticamente por el matching de pólizas) + declared_policies
/// (autodeclaradas, pendientes de aprobación por la empresa) — mismo
/// shape que usa admin-web para el traveler-detail.
class CoveragesScreen extends StatefulWidget {
  const CoveragesScreen({super.key});

  @override
  State<CoveragesScreen> createState() => _CoveragesScreenState();
}

class _CoveragesScreenState extends State<CoveragesScreen> {
  Map<String, dynamic>? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final response = await ApiClient.instance.dio.get('/me/coverages');
    setState(() {
      _data = response.data as Map<String, dynamic>;
      _loading = false;
    });
  }

  Future<void> _openDeclareForm() async {
    final companiesResponse = await ApiClient.instance.dio.get('/me/coverages/companies');
    final companies = companiesResponse.data as List;
    final policyController = TextEditingController();
    String? tenantId;

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
              Text('Declarar mi póliza', style: Theme.of(ctx).textTheme.titleLarge),
              const Text(
                'Usá esto si tenés una póliza de asistencia al viajero que todavía no aparece acá — queda pendiente hasta que la empresa la confirme.',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: tenantId,
                decoration: const InputDecoration(labelText: 'Empresa de asistencia'),
                items: companies
                    .map((c) => DropdownMenuItem(value: c['id'] as String, child: Text(c['name'] as String)))
                    .toList(),
                onChanged: (v) => setSheetState(() => tenantId = v),
              ),
              const SizedBox(height: 12),
              TextField(controller: policyController, decoration: const InputDecoration(labelText: 'N° de póliza')),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: (tenantId == null || policyController.text.trim().isEmpty)
                    ? null
                    : () async {
                        await ApiClient.instance.dio.post('/me/coverages/declare', data: {
                          'tenantId': tenantId,
                          'policyNumber': policyController.text.trim(),
                        });
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        await _load();
                      },
                child: const Text('Declarar'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Obra social/prepaga — independiente de cualquier empresa de
  /// asistencia al viajero (proposed-healthcare-plans.sql): un
  /// prestador (params vía coverage.healthcare_providers, con su tipo
  /// Obra social/Prepaga — no son lo mismo) tiene sus propios planes
  /// (coverage.healthcare_plans). Si el viajero no encuentra su
  /// prestador o su plan en la lista, puede cargarlo como texto libre
  /// — queda "pendiente de confirmación" para un operador (ver
  /// Prestadores y planes de salud en admin-web), pero ya puede
  /// usarlo de inmediato.
  Future<void> _openHealthCoverageForm({Map<String, dynamic>? editing}) async {
    final providerTypesResponse = await ApiClient.instance.dio.get('/params/catalogs/HEALTH_COVERAGE_TYPE');
    final providerTypes = (providerTypesResponse.data as List)
        .where((t) => t['code'] == 'PRIVATE_INSURANCE' || t['code'] == 'SOCIAL_SECURITY')
        .toList();

    String? providerTypeId = providerTypes.isNotEmpty ? providerTypes.first['id'] as String : null;
    List providers = [];
    List plans = [];
    String? providerId = editing?['provider_id'] as String?;
    String? planId = editing?['plan_id'] as String?;
    bool addingNewProvider = false;
    bool addingNewPlan = false;
    final newProviderController = TextEditingController();
    final newPlanController = TextEditingController();
    final memberNumberController = TextEditingController(text: editing?['member_number'] as String? ?? '');
    final notesController = TextEditingController(text: editing?['notes'] as String? ?? '');
    DateTime validFrom = editing?['valid_from'] != null ? DateTime.parse(editing!['valid_from'] as String) : DateTime.now();
    DateTime? validUntil = editing?['valid_until'] != null ? DateTime.parse(editing!['valid_until'] as String) : null;
    bool isPrimary = editing?['is_primary'] as bool? ?? false;
    String? error;

    Future<void> loadProviders(void Function(void Function()) setSheetState) async {
      if (providerTypeId == null) return;
      final res = await ApiClient.instance.dio.get('/coverage/healthcare-providers', queryParameters: {'providerTypeId': providerTypeId});
      setSheetState(() => providers = res.data as List);
    }

    Future<void> loadPlans(void Function(void Function()) setSheetState) async {
      if (providerId == null) return;
      final res = await ApiClient.instance.dio.get('/coverage/healthcare-plans', queryParameters: {'providerId': providerId});
      setSheetState(() => plans = res.data as List);
    }

    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: StatefulBuilder(
          builder: (ctx, setSheetState) {
            if (providers.isEmpty && providerId == null) {
              loadProviders(setSheetState);
            }
            if (providerId != null && plans.isEmpty) {
              loadPlans(setSheetState);
            }
            return SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(editing == null ? 'Agregar obra social / prepaga' : 'Editar', style: Theme.of(ctx).textTheme.titleLarge),
                  const SizedBox(height: 4),
                  if (error != null) Text(error!, style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: providerTypeId,
                    decoration: const InputDecoration(labelText: 'Tipo'),
                    items: providerTypes
                        .map((t) => DropdownMenuItem(value: t['id'] as String, child: Text(t['labelEs'] as String)))
                        .toList(),
                    onChanged: (v) => setSheetState(() {
                      providerTypeId = v;
                      providerId = null;
                      providers = [];
                      plans = [];
                    }),
                  ),
                  const SizedBox(height: 12),
                  if (!addingNewProvider) ...[
                    DropdownButtonFormField<String>(
                      initialValue: providerId,
                      decoration: const InputDecoration(labelText: 'Prestador'),
                      items: [
                        ...providers.map((p) => DropdownMenuItem(value: p['id'] as String, child: Text(p['name'] as String))),
                        const DropdownMenuItem(value: '__new__', child: Text('No está en la lista — cargar nuevo')),
                      ],
                      onChanged: (v) => setSheetState(() {
                        if (v == '__new__') {
                          addingNewProvider = true;
                          providerId = null;
                        } else {
                          providerId = v;
                          planId = null;
                          plans = [];
                        }
                      }),
                    ),
                  ] else ...[
                    TextField(controller: newProviderController, decoration: const InputDecoration(labelText: 'Nombre del prestador')),
                    TextButton(
                      onPressed: () => setSheetState(() => addingNewProvider = false),
                      child: const Text('Elegir de la lista en vez de cargar uno nuevo'),
                    ),
                  ],
                  const SizedBox(height: 12),
                  if (providerId != null && !addingNewProvider) ...[
                    if (!addingNewPlan) ...[
                      DropdownButtonFormField<String>(
                        initialValue: planId,
                        decoration: const InputDecoration(labelText: 'Plan'),
                        items: [
                          ...plans.map((p) => DropdownMenuItem(value: p['id'] as String, child: Text(p['name'] as String))),
                          const DropdownMenuItem(value: '__new__', child: Text('No está en la lista — cargar nuevo')),
                        ],
                        onChanged: (v) => setSheetState(() {
                          if (v == '__new__') {
                            addingNewPlan = true;
                            planId = null;
                          } else {
                            planId = v;
                          }
                        }),
                      ),
                    ] else ...[
                      TextField(controller: newPlanController, decoration: const InputDecoration(labelText: 'Nombre del plan')),
                      TextButton(
                        onPressed: () => setSheetState(() => addingNewPlan = false),
                        child: const Text('Elegir de la lista en vez de cargar uno nuevo'),
                      ),
                    ],
                    const SizedBox(height: 12),
                  ],
                  TextField(controller: memberNumberController, decoration: const InputDecoration(labelText: 'N° de afiliado')),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextButton(
                          onPressed: () async {
                            final picked = await showDatePicker(
                              context: ctx,
                              initialDate: validFrom,
                              firstDate: DateTime(1950),
                              lastDate: DateTime(2100),
                            );
                            if (picked != null) setSheetState(() => validFrom = picked);
                          },
                          child: Text('Desde: ${DateFormat('dd/MM/yyyy').format(validFrom)}'),
                        ),
                      ),
                      Expanded(
                        child: TextButton(
                          onPressed: () async {
                            final picked = await showDatePicker(
                              context: ctx,
                              initialDate: validUntil ?? DateTime.now(),
                              firstDate: DateTime(1950),
                              lastDate: DateTime(2100),
                            );
                            if (picked != null) setSheetState(() => validUntil = picked);
                          },
                          child: Text(validUntil == null ? 'Hasta: vigente' : 'Hasta: ${DateFormat('dd/MM/yyyy').format(validUntil!)}'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    decoration: const InputDecoration(labelText: 'Notas'),
                    maxLines: 2,
                  ),
                  CheckboxListTile(
                    value: isPrimary,
                    onChanged: (v) => setSheetState(() => isPrimary = v ?? false),
                    title: const Text('Es mi cobertura principal'),
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: () async {
                      try {
                        String? finalProviderId = providerId;
                        if (addingNewProvider) {
                          if (newProviderController.text.trim().isEmpty || providerTypeId == null) return;
                          final res = await ApiClient.instance.dio.post('/coverage/healthcare-providers', data: {
                            'name': newProviderController.text.trim(),
                            'providerTypeId': providerTypeId,
                          });
                          finalProviderId = res.data['id'] as String;
                        }
                        if (finalProviderId == null) return;

                        String? finalPlanId = planId;
                        if (addingNewPlan || (finalPlanId == null && plans.isEmpty)) {
                          if (newPlanController.text.trim().isEmpty) return;
                          final res = await ApiClient.instance.dio.post('/coverage/healthcare-plans', data: {
                            'providerId': finalProviderId,
                            'name': newPlanController.text.trim(),
                          });
                          finalPlanId = res.data['id'] as String;
                        }
                        if (finalPlanId == null) return;

                        final payload = {
                          'providerId': finalProviderId,
                          'planId': finalPlanId,
                          'memberNumber': memberNumberController.text.trim().isEmpty ? null : memberNumberController.text.trim(),
                          'validFrom': DateFormat('yyyy-MM-dd').format(validFrom),
                          'validUntil': validUntil == null ? null : DateFormat('yyyy-MM-dd').format(validUntil!),
                          'isPrimary': isPrimary,
                          'notes': notesController.text.trim().isEmpty ? null : notesController.text.trim(),
                        };

                        if (editing != null) {
                          await ApiClient.instance.dio.patch('/me/coverages/health/${editing['id']}', data: payload);
                        } else {
                          await ApiClient.instance.dio.post('/me/coverages/health', data: payload);
                        }
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        await _load();
                      } catch (_) {
                        setSheetState(() => error = 'No se pudo guardar — revisá los datos.');
                      }
                    },
                    child: Text(editing == null ? 'Guardar' : 'Guardar cambios'),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(appBar: AppBar(title: const Text('Mi cobertura')), body: const Center(child: CircularProgressIndicator()));
    }

    final enrollments = _data!['travelAssistanceEnrollments'] as List;
    final declared = _data!['declaredPolicies'] as List;
    final healthCoverages = _data!['healthCoverages'] as List;

    return Scaffold(
      appBar: AppBar(title: const Text('Mi cobertura')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Obra social / Prepaga', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (healthCoverages.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('Todavía no cargaste tu obra social o prepaga — independiente de tu asistencia al viajero.'),
                ),
              )
            else
              ...healthCoverages.map((h) {
                final hc = h as Map<String, dynamic>;
                final pending = hc['pending_review'] as bool? ?? false;
                return Card(
                  child: ListTile(
                    leading: const Icon(Icons.medical_services_outlined),
                    title: Row(
                      children: [
                        Flexible(child: Text(hc['provider_label'] as String? ?? '—')),
                        if (pending) ...[
                          const SizedBox(width: 6),
                          const Chip(label: Text('En revisión', style: TextStyle(fontSize: 11)), visualDensity: VisualDensity.compact),
                        ],
                        if (hc['is_primary'] == true) ...[
                          const SizedBox(width: 6),
                          const Chip(label: Text('Principal', style: TextStyle(fontSize: 11)), visualDensity: VisualDensity.compact),
                        ],
                      ],
                    ),
                    subtitle: Text(
                      '${hc['plan_name'] ?? ''}${hc['member_number'] != null ? ' · N° ${hc['member_number']}' : ''}\n'
                      'Desde ${hc['valid_from'] ?? '—'}'
                      '${hc['valid_until'] != null ? ' hasta ${hc['valid_until']}' : ' — vigente'}',
                    ),
                    isThreeLine: true,
                    trailing: IconButton(
                      icon: const Icon(Icons.edit_outlined),
                      onPressed: () => _openHealthCoverageForm(editing: hc),
                    ),
                  ),
                );
              }),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => _openHealthCoverageForm(),
              icon: const Icon(Icons.add),
              label: const Text('Agregar obra social / prepaga'),
            ),
            const SizedBox(height: 24),
            Text('Asistencia al viajero', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (enrollments.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    'Todavía no tenés una cobertura confirmada. Si ya cargaste tu documento en Perfil y la empresa ya subió tu póliza, va a aparecer acá automáticamente.',
                  ),
                ),
              )
            else
              ...enrollments.map((e) {
                final enr = e as Map<String, dynamic>;
                final authority = enr['status_authority'] as String?;
                return Card(
                  child: ListTile(
                    leading: const Icon(Icons.verified_user),
                    title: Text(enr['plan_name'] as String? ?? 'Plan de asistencia'),
                    subtitle: Text(
                      '${enr['tenant_name'] ?? '—'} · Póliza ${enr['policy_number']}\n'
                      'Vigencia: ${enr['valid_from']} — ${enr['valid_until']}',
                    ),
                    isThreeLine: true,
                    trailing: authority == 'MEMBER_DECLARED'
                        ? const Chip(label: Text('Sin validar'), backgroundColor: Colors.amber)
                        : const Icon(Icons.check_circle, color: Colors.green),
                  ),
                );
              }),
            const SizedBox(height: 20),
            if (declared.isNotEmpty) ...[
              Text('Pendientes de aprobación', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              ...declared.map((d) {
                final dec = d as Map<String, dynamic>;
                if (dec['approved_at'] != null) return const SizedBox.shrink();
                return Card(
                  child: ListTile(
                    leading: const Icon(Icons.hourglass_top),
                    title: Text('Póliza ${dec['policy_number']}'),
                    subtitle: Text('${dec['tenant_name'] ?? '—'} · Esperando confirmación de la empresa'),
                  ),
                );
              }),
              const SizedBox(height: 20),
            ],
            OutlinedButton.icon(
              onPressed: _openDeclareForm,
              icon: const Icon(Icons.add),
              label: const Text('Declarar una póliza que no aparece'),
            ),
          ],
        ),
      ),
    );
  }
}
