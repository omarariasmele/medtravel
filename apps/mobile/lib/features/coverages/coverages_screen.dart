import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../l10n/app_strings.dart';

/// Mismo criterio que CatalogValue.label() (catalog_service.dart), para
/// el JSON crudo de /params/catalogs/:code que esta pantalla consume
/// directo como Map en vez de a través de CatalogService.
String _catalogMapLabel(Map<String, dynamic> item, String lang) {
  final key = switch (lang) {
    'en' => 'labelEn',
    'pt' => 'labelPt',
    'fr' => 'labelFr',
    _ => 'labelEs',
  };
  final value = item[key] as String?;
  return (value != null && value.trim().isNotEmpty) ? value : item['labelEs'] as String;
}

/// Bug real reportado en vivo: "la vigencia de la póliza es fecha
/// desde/hasta solamente, no con hora" — estos valores vienen del
/// backend como timestamp ISO completo (ej.
/// "2026-08-01T03:00:00.000Z") y se mostraban tal cual, crudos, en vez
/// de solo la fecha.
String _formatDateOnly(dynamic raw) {
  if (raw == null) return '—';
  final parsed = DateTime.tryParse(raw as String);
  if (parsed == null) return raw;
  return DateFormat('dd/MM/yyyy').format(parsed.toLocal());
}

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
              Text(context.tr('coverage.declareFormTitle'), style: Theme.of(ctx).textTheme.titleLarge),
              Text(
                context.tr('coverage.declareFormHint'),
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: tenantId,
                isExpanded: true,
                decoration: InputDecoration(labelText: context.tr('coverage.assistanceCompanyLabel')),
                items: companies
                    .map((c) => DropdownMenuItem(value: c['id'] as String, child: Text(c['name'] as String, overflow: TextOverflow.ellipsis)))
                    .toList(),
                onChanged: (v) => setSheetState(() => tenantId = v),
              ),
              const SizedBox(height: 12),
              TextField(controller: policyController, decoration: InputDecoration(labelText: context.tr('coverage.policyNumberLabel'))),
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
                child: Text(context.tr('coverage.declareButton')),
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
                  Text(editing == null ? context.tr('coverage.addFormTitle') : context.tr('coverage.editFormTitle'), style: Theme.of(ctx).textTheme.titleLarge),
                  const SizedBox(height: 4),
                  if (error != null) Text(error!, style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: providerTypeId,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: context.tr('coverage.typeLabel')),
                    items: providerTypes
                        .map((t) => DropdownMenuItem(value: t['id'] as String, child: Text(_catalogMapLabel(t as Map<String, dynamic>, context.lang), overflow: TextOverflow.ellipsis)))
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
                      isExpanded: true,
                      decoration: InputDecoration(labelText: context.tr('coverage.providerLabel')),
                      items: [
                        ...providers.map((p) => DropdownMenuItem(value: p['id'] as String, child: Text(p['name'] as String, overflow: TextOverflow.ellipsis))),
                        DropdownMenuItem(value: '__new__', child: Text(context.tr('coverage.notInListLoadNew'), overflow: TextOverflow.ellipsis)),
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
                    TextField(controller: newProviderController, decoration: InputDecoration(labelText: context.tr('coverage.providerNameLabel'))),
                    TextButton(
                      onPressed: () => setSheetState(() => addingNewProvider = false),
                      child: Text(context.tr('coverage.chooseFromListInstead')),
                    ),
                  ],
                  const SizedBox(height: 12),
                  if (providerId != null && !addingNewProvider) ...[
                    if (!addingNewPlan) ...[
                      DropdownButtonFormField<String>(
                        initialValue: planId,
                        isExpanded: true,
                        decoration: InputDecoration(labelText: context.tr('coverage.planLabel')),
                        items: [
                          ...plans.map((p) => DropdownMenuItem(value: p['id'] as String, child: Text(p['name'] as String, overflow: TextOverflow.ellipsis))),
                          DropdownMenuItem(value: '__new__', child: Text(context.tr('coverage.notInListLoadNew'), overflow: TextOverflow.ellipsis)),
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
                      TextField(controller: newPlanController, decoration: InputDecoration(labelText: context.tr('coverage.planNameLabel'))),
                      TextButton(
                        onPressed: () => setSheetState(() => addingNewPlan = false),
                        child: Text(context.tr('coverage.chooseFromListInstead')),
                      ),
                    ],
                    const SizedBox(height: 12),
                  ],
                  TextField(controller: memberNumberController, decoration: InputDecoration(labelText: context.tr('coverage.memberNumberLabel'))),
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
                          child: Text(context.tr('coverage.validFrom', params: {'date': DateFormat('dd/MM/yyyy').format(validFrom)})),
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
                          child: Text(validUntil == null ? context.tr('coverage.validUntilActive') : context.tr('coverage.validUntil', params: {'date': DateFormat('dd/MM/yyyy').format(validUntil!)})),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    decoration: InputDecoration(labelText: context.tr('coverage.notesLabel')),
                    maxLines: 2,
                  ),
                  CheckboxListTile(
                    value: isPrimary,
                    onChanged: (v) => setSheetState(() => isPrimary = v ?? false),
                    title: Text(context.tr('coverage.isPrimaryLabel')),
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: () async {
                      final saveErrorFallback = context.tr('coverage.saveFormError');
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
                        setSheetState(() => error = saveErrorFallback);
                      }
                    },
                    child: Text(editing == null ? context.tr('coverage.saveButton') : context.tr('coverage.saveChangesButton')),
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
      return Scaffold(appBar: AppBar(title: Text(context.tr('coverage.title'))), body: const Center(child: CircularProgressIndicator()));
    }

    final enrollments = _data!['travelAssistanceEnrollments'] as List;
    final declared = _data!['declaredPolicies'] as List;
    final healthCoverages = _data!['healthCoverages'] as List;

    return Scaffold(
      appBar: AppBar(title: Text(context.tr('coverage.title'))),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(context.tr('coverage.healthCoverageSectionTitle'), style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (healthCoverages.isEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(context.tr('coverage.noHealthCoverage')),
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
                          Chip(label: Text(context.tr('coverage.pendingReview'), style: const TextStyle(fontSize: 11)), visualDensity: VisualDensity.compact),
                        ],
                        if (hc['is_primary'] == true) ...[
                          const SizedBox(width: 6),
                          Chip(label: Text(context.tr('coverage.primary'), style: const TextStyle(fontSize: 11)), visualDensity: VisualDensity.compact),
                        ],
                      ],
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('${hc['plan_name'] ?? ''}${hc['member_number'] != null ? context.tr('coverage.memberNumberSuffix', params: {'value': '${hc['member_number']}'}) : ''}'),
                        Text(
                          '${context.tr('coverage.validFromInline', params: {'date': _formatDateOnly(hc['valid_from'])})}'
                          '${hc['valid_until'] != null ? context.tr('coverage.validUntilInline', params: {'date': _formatDateOnly(hc['valid_until'])}) : context.tr('coverage.validUntilActiveInline')}',
                          style: const TextStyle(fontSize: 12),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
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
              label: Text(context.tr('coverage.addHealthCoverage')),
            ),
            const SizedBox(height: 24),
            Text(context.tr('coverage.travelAssistanceSectionTitle'), style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (enrollments.isEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(context.tr('coverage.noEnrollment')),
                ),
              )
            else
              ...enrollments.map((e) {
                final enr = e as Map<String, dynamic>;
                final authority = enr['status_authority'] as String?;
                return Card(
                  child: ListTile(
                    leading: const Icon(Icons.verified_user),
                    title: Text(enr['plan_name'] as String? ?? context.tr('coverage.defaultPlanName')),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('${enr['tenant_name'] ?? '—'} · ${context.tr('coverage.policyWithNumber', params: {'number': '${enr['policy_number']}'})}'),
                        Text(
                          context.tr('coverage.validityRange', params: {'from': _formatDateOnly(enr['valid_from']), 'until': _formatDateOnly(enr['valid_until'])}),
                          style: const TextStyle(fontSize: 12),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                    isThreeLine: true,
                    trailing: authority == 'MEMBER_DECLARED'
                        ? Chip(label: Text(context.tr('coverage.unvalidated')), backgroundColor: Colors.amber)
                        : const Icon(Icons.check_circle, color: Colors.green),
                  ),
                );
              }),
            const SizedBox(height: 20),
            if (declared.isNotEmpty) ...[
              Text(context.tr('coverage.pendingApprovalSectionTitle'), style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              ...declared.map((d) {
                final dec = d as Map<String, dynamic>;
                if (dec['approved_at'] != null) return const SizedBox.shrink();
                return Card(
                  child: ListTile(
                    leading: const Icon(Icons.hourglass_top),
                    title: Text(context.tr('coverage.policyWithNumber', params: {'number': '${dec['policy_number']}'})),
                    subtitle: Text('${dec['tenant_name'] ?? '—'} · ${context.tr('coverage.waitingCompanyConfirmation')}'),
                  ),
                );
              }),
              const SizedBox(height: 20),
            ],
            OutlinedButton.icon(
              onPressed: _openDeclareForm,
              icon: const Icon(Icons.add),
              label: Text(context.tr('coverage.declarePolicy')),
            ),
          ],
        ),
      ),
    );
  }
}
