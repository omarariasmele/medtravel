import 'package:flutter/material.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/catalog_service.dart';
import '../assistant/health_assistant_screen.dart';

/// País/ciudad resueltos automáticamente (GPS geocodificado en el
/// dispositivo, o el destino del viaje activo hoy) antes de mostrar el
/// formulario — el viajero los ve prellenados y los puede corregir,
/// nunca se los inventa el sistema sin que él lo vea.
class _ResolvedLocation {
  _ResolvedLocation({this.countryId, this.city, this.latitude, this.longitude, this.accuracy});
  final String? countryId;
  final String? city;
  final double? latitude;
  final double? longitude;
  final double? accuracy;
}

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

  /// GPS mejor esfuerzo: si el permiso no está dado, el servicio de
  /// ubicación está apagado, o falla, devuelve null — nunca bloquea el
  /// reporte de una emergencia real por un permiso de sistema operativo,
  /// solo hace que después se pida país/ciudad a mano.
  Future<Position?> _tryGetPosition() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
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

  /// País/ciudad a partir de lat/lng, resuelto 100% en el dispositivo
  /// (geocoder nativo de Android/iOS vía el paquete `geocoding`, sin
  /// ningún servicio externo pago) — matchea por código ISO del país
  /// contra el catálogo COUNTRY (mismos códigos, ej. "AR").
  Future<_ResolvedLocation?> _geocodePosition(Position position, List<CatalogValue> countries) async {
    try {
      final placemarks = await placemarkFromCoordinates(position.latitude, position.longitude);
      if (placemarks.isEmpty) return null;
      final place = placemarks.first;
      final iso = place.isoCountryCode?.toUpperCase();
      CatalogValue? country;
      for (final c in countries) {
        if (c.code.toUpperCase() == iso) {
          country = c;
          break;
        }
      }
      final city = place.locality?.isNotEmpty == true ? place.locality : place.subAdministrativeArea;
      return _ResolvedLocation(
        countryId: country?.id,
        city: city,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      );
    } catch (_) {
      return null;
    }
  }

  /// Destino del viaje activo hoy (si el viajero cargó uno) — se usa
  /// como respaldo cuando el GPS no está disponible, mejor que dejar el
  /// formulario en blanco.
  Future<_ResolvedLocation?> _findActiveTripDestination() async {
    try {
      final response = await ApiClient.instance.dio.get('/me/trips');
      final trips = response.data as List;
      final today = DateTime.now();
      for (final t in trips) {
        final trip = t as Map<String, dynamic>;
        // Un viaje puede tener varios destinos (ver trips_screen.dart) —
        // se toma el primero cuyo rango de fechas incluya hoy.
        final destinations = (trip['destinations'] as List?) ?? [];
        for (final d in destinations) {
          final dest = d as Map<String, dynamic>;
          final countryId = dest['countryId'] as String?;
          final arrival = dest['arrivalDate'] as String?;
          final departure = dest['departureDate'] as String?;
          if (countryId == null || arrival == null || departure == null) continue;
          final from = DateTime.tryParse(arrival);
          final to = DateTime.tryParse(departure);
          if (from == null || to == null) continue;
          if (!today.isBefore(from) && !today.isAfter(to)) {
            return _ResolvedLocation(countryId: countryId, city: dest['city'] as String?);
          }
        }
      }
    } catch (_) {
      // Sin viajes o sin conexión — se sigue con el resto del flujo.
    }
    return null;
  }

  Future<void> _promptEnableLocation() async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Activá tu ubicación'),
        content: const Text(
          'Para ubicarte automáticamente y agilizar la asistencia, activá la ubicación del celular. '
          'Si no la activás, te vamos a pedir el país y la ciudad a mano antes de enviar.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Ahora no')),
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              Geolocator.openLocationSettings();
            },
            child: const Text('Activar ubicación'),
          ),
        ],
      ),
    );
  }

  /// Pedido explícito del usuario: si la persona no cargó nada todavía en
  /// su Ficha de Salud, el botón de emergencia no debería funcionar —
  /// sin alergias/medicamentos/antecedentes, quien atiende la emergencia
  /// pierde justo la información que más importa en ese momento.
  /// `health_record_last_updated_at` (en core.persons) solo se completa
  /// cuando se confirma algún dato clínico real (ver los triggers
  /// trg_touch_health_record_* del backend) — null significa "todavía
  /// nada cargado", el mismo criterio que ya usa el saludo de la IA.
  Future<bool> _hasHealthRecordData() async {
    try {
      final response = await ApiClient.instance.dio.get('/me/profile');
      final data = response.data as Map<String, dynamic>;
      return data['health_record_last_updated_at'] != null;
    } catch (_) {
      // Sin conexión no se puede saber — no bloquea una emergencia real
      // por un chequeo que no se pudo hacer.
      return true;
    }
  }

  Future<void> _promptLoadHealthRecordFirst() async {
    if (!mounted) return;
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cargá tu Ficha de Salud primero'),
        content: const Text(
          'Todavía no tenés ningún dato cargado en tu Ficha de Salud (alergias, medicamentos, antecedentes). '
          'Es justo la información que necesita quien te atienda en una emergencia — cargala antes de reportar una.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Ahora no')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Cargar ahora')),
        ],
      ),
    );
    if (go == true && mounted) await openHealthAssistant(context);
  }

  Future<void> _openCreateDialog() async {
    if (!await _hasHealthRecordData()) {
      await _promptLoadHealthRecordFirst();
      return;
    }
    final descriptionController = TextEditingController();
    final symptomsController = TextEditingController();
    final cityController = TextEditingController();
    bool conscious = true;
    String? countryId;
    double? latitude;
    double? longitude;
    double? accuracy;

    final countries = await CatalogService.get('COUNTRY');

    final position = await _tryGetPosition();
    _ResolvedLocation? resolved = position != null ? await _geocodePosition(position, countries) : null;
    resolved ??= await _findActiveTripDestination();

    if (position == null && mounted) {
      await _promptEnableLocation();
    }

    if (resolved != null) {
      countryId = resolved.countryId;
      cityController.text = resolved.city ?? '';
      latitude = resolved.latitude;
      longitude = resolved.longitude;
      accuracy = resolved.accuracy;
    }

    if (!mounted) return;

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
                onChanged: (_) => setSheetState(() {}),
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
              Text('Ubicación', style: Theme.of(ctx).textTheme.titleSmall),
              if (latitude != null)
                const Padding(
                  padding: EdgeInsets.only(top: 4, bottom: 4),
                  child: Text('Detectada por GPS — revisala y corregila si hace falta.', style: TextStyle(fontSize: 12, color: Colors.grey)),
                ),
              const SizedBox(height: 4),
              DropdownButtonFormField<String>(
                initialValue: countryId,
                decoration: const InputDecoration(labelText: 'País'),
                items: countries.map((c) => DropdownMenuItem(value: c.id, child: Text(c.labelEs))).toList(),
                onChanged: (v) => setSheetState(() => countryId = v),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: cityController,
                decoration: const InputDecoration(labelText: 'Ciudad'),
                onChanged: (_) => setSheetState(() {}),
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                icon: const Icon(Icons.send),
                label: const Text('Enviar — se comparte tu ubicación'),
                style: FilledButton.styleFrom(backgroundColor: Colors.red),
                onPressed: (descriptionController.text.trim().length < 5 ||
                        countryId == null ||
                        cityController.text.trim().isEmpty)
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
          Expanded(child: Text('Creando caso…')),
        ]),
      ),
    );

    try {
      final response = await ApiClient.instance.dio.post('/me/emergency-cases', data: {
        'initialDescription': descriptionController.text.trim(),
        if (symptomsController.text.trim().isNotEmpty) 'patientSymptoms': symptomsController.text.trim(),
        'patientConscious': conscious,
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
        if (accuracy != null) 'locationAccuracy': accuracy,
        if (countryId != null) 'countryId': countryId,
        if (cityController.text.trim().isNotEmpty) 'city': cityController.text.trim(),
      });

      if (!mounted) return;
      Navigator.of(context).pop(); // cierra el diálogo de "creando…"
      await _load();

      final data = response.data as Map<String, dynamic>;
      if (!mounted) return;
      context.push('/cases/${data['id']}', extra: {
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
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/cases/${c['id']}', extra: {
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
