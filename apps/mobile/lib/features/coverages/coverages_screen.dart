import 'package:flutter/material.dart';

import '../../core/api_client.dart';

/// GET /me/coverages junta health_coverages + travel_assistance_
/// enrollments (la cobertura real, creada automáticamente por el
/// matching de pólizas) + declared_policies (autodeclaradas, pendientes
/// de aprobación por la empresa) — mismo shape que usa admin-web para
/// el traveler-detail.
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

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(appBar: AppBar(title: const Text('Mi cobertura')), body: const Center(child: CircularProgressIndicator()));
    }

    final enrollments = _data!['travelAssistanceEnrollments'] as List;
    final declared = _data!['declaredPolicies'] as List;

    return Scaffold(
      appBar: AppBar(title: const Text('Mi cobertura')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
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
