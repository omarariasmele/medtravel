import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';

/// /me/trips (a diferencia de /operations/trips genérico) ya resuelve
/// el memberId del viajero autenticado server-side (resolveMemberId) y
/// pone status_id = PLANNED automáticamente — el cliente no necesita
/// saber nada de eso, solo mandar nombre/fechas.
class TripsScreen extends StatefulWidget {
  const TripsScreen({super.key});

  @override
  State<TripsScreen> createState() => _TripsScreenState();
}

class _TripsScreenState extends State<TripsScreen> {
  List<dynamic> _trips = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final response = await ApiClient.instance.dio.get('/me/trips');
    setState(() {
      _trips = response.data as List;
      _loading = false;
    });
  }

  Future<void> _openForm() async {
    final nameController = TextEditingController();
    DateTime? start;
    DateTime? end;

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
              Text('Nuevo viaje', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 12),
              TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Nombre del viaje (opcional)')),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(start != null ? 'Desde: ${DateFormat('dd/MM/yyyy').format(start!)}' : 'Fecha de inicio'),
                trailing: const Icon(Icons.calendar_today),
                onTap: () async {
                  final picked = await showDatePicker(context: ctx, initialDate: DateTime.now(), firstDate: DateTime(2020), lastDate: DateTime(2100));
                  if (picked != null) setSheetState(() => start = picked);
                },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(end != null ? 'Hasta: ${DateFormat('dd/MM/yyyy').format(end!)}' : 'Fecha de fin'),
                trailing: const Icon(Icons.calendar_today),
                onTap: () async {
                  final picked = await showDatePicker(context: ctx, initialDate: start ?? DateTime.now(), firstDate: DateTime(2020), lastDate: DateTime(2100));
                  if (picked != null) setSheetState(() => end = picked);
                },
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: (start == null || end == null)
                    ? null
                    : () async {
                        await ApiClient.instance.dio.post('/me/trips', data: {
                          if (nameController.text.trim().isNotEmpty) 'tripName': nameController.text.trim(),
                          'tripStart': start!.toIso8601String().split('T').first,
                          'tripEnd': end!.toIso8601String().split('T').first,
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
    if (_loading) {
      return Scaffold(appBar: AppBar(title: const Text('Mis viajes')), body: const Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Mis viajes')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _trips.isEmpty
            ? ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('Todavía no cargaste ningún viaje.'))])
            : ListView.builder(
                itemCount: _trips.length,
                itemBuilder: (context, i) {
                  final t = _trips[i] as Map<String, dynamic>;
                  return ListTile(
                    leading: const Icon(Icons.flight_takeoff),
                    title: Text(t['trip_name'] as String? ?? 'Viaje'),
                    subtitle: Text('${t['trip_start']} → ${t['trip_end']}'),
                  );
                },
              ),
      ),
      floatingActionButton: FloatingActionButton(onPressed: _openForm, child: const Icon(Icons.add)),
    );
  }
}
