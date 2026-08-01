import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';

class EmergencyScreen extends StatefulWidget {
  const EmergencyScreen({super.key});

  @override
  State<EmergencyScreen> createState() => _EmergencyScreenState();
}

class _EmergencyScreenState extends State<EmergencyScreen> {
  List<dynamic> _cases = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final response = await ApiClient.instance.dio.get('/me/emergency-cases');
    setState(() {
      _cases = response.data as List;
      _loading = false;
    });
  }

  /// GPS mejor esfuerzo: si el permiso no está dado o falla, el caso se
  /// crea igual sin ubicación — no bloquea una emergencia real por un
  /// permiso de sistema operativo.
  Future<Position?> _tryGetLocation() async {
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        return null;
      }
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> _openCreateDialog() async {
    final descriptionController = TextEditingController();
    final symptomsController = TextEditingController();
    bool conscious = true;

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: StatefulBuilder(
          builder: (ctx, setSheetState) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(children: [
                const Icon(Icons.emergency, color: Colors.red),
                const SizedBox(width: 8),
                Text('Reportar emergencia', style: Theme.of(ctx).textTheme.titleLarge),
              ]),
              const SizedBox(height: 12),
              TextField(
                controller: descriptionController,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(labelText: 'Qué está pasando'),
              ),
              const SizedBox(height: 12),
              TextField(controller: symptomsController, decoration: const InputDecoration(labelText: 'Síntomas (opcional)')),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('El paciente está consciente'),
                value: conscious,
                onChanged: (v) => setSheetState(() => conscious = v),
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                icon: const Icon(Icons.send),
                label: const Text('Enviar — se comparte tu ubicación'),
                style: FilledButton.styleFrom(backgroundColor: Colors.red),
                onPressed: descriptionController.text.trim().length < 5
                    ? null
                    : () => Navigator.of(ctx).pop(true),
              ),
            ],
          ),
        ),
      ),
    );

    if (confirmed != true) return;
    if (!mounted) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const AlertDialog(
        content: Row(children: [
          CircularProgressIndicator(),
          SizedBox(width: 16),
          Expanded(child: Text('Creando caso y ubicándote…')),
        ]),
      ),
    );

    final position = await _tryGetLocation();

    try {
      final response = await ApiClient.instance.dio.post('/me/emergency-cases', data: {
        'initialDescription': descriptionController.text.trim(),
        if (symptomsController.text.trim().isNotEmpty) 'patientSymptoms': symptomsController.text.trim(),
        'patientConscious': conscious,
        if (position != null) 'latitude': position.latitude,
        if (position != null) 'longitude': position.longitude,
        if (position != null) 'locationAccuracy': position.accuracy,
      });

      if (!mounted) return;
      Navigator.of(context).pop(); // cierra el diálogo de "creando…"
      await _load();

      final data = response.data as Map<String, dynamic>;
      if (!mounted) return;
      context.push('/cases/${data['id']}/chat', extra: {
        'channelId': data['channel_id'],
        'caseNumber': data['case_number'],
      });
    } catch (_) {
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo crear el caso. Intentá de nuevo.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(appBar: AppBar(title: const Text('Emergencia')), body: const Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Emergencia')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _cases.isEmpty
            ? ListView(children: const [
                Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('No tenés casos de asistencia activos. Si necesitás ayuda urgente, tocá el botón de abajo.'),
                ),
              ])
            : ListView.builder(
                itemCount: _cases.length,
                itemBuilder: (context, i) {
                  final c = _cases[i] as Map<String, dynamic>;
                  final closed = c['closed_at'] != null;
                  return ListTile(
                    leading: Icon(closed ? Icons.check_circle_outline : Icons.pending_actions, color: closed ? Colors.grey : Colors.orange),
                    title: Text(c['case_number'] as String? ?? ''),
                    subtitle: Text(c['initial_description'] as String? ?? ''),
                    trailing: const Icon(Icons.chat_bubble_outline),
                    onTap: () => context.push('/cases/${c['id']}/chat', extra: {
                      'channelId': c['channel_id'],
                      'caseNumber': c['case_number'],
                    }),
                  );
                },
              ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openCreateDialog,
        backgroundColor: Colors.red,
        icon: const Icon(Icons.emergency),
        label: const Text('Reportar emergencia'),
      ),
    );
  }
}
