import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/catalog_service.dart';
import '../../core/error_message.dart';
import '../../core/remote_tts_player.dart';
import '../../l10n/app_strings.dart';

/// /me/trips (a diferencia de /operations/trips genérico) ya resuelve
/// el memberId del viajero autenticado server-side (resolveMemberId) y
/// pone status_id = PLANNED automáticamente — el cliente no necesita
/// saber nada de eso, solo mandar nombre/fechas.
class TripsScreen extends StatefulWidget {
  const TripsScreen({super.key});

  @override
  State<TripsScreen> createState() => _TripsScreenState();
}

/// Fila editable de destino en el formulario — un viaje puede tener
/// varios (pedido explícito del usuario: "el viaje es a varios
/// países... como alerta la IA sobre requerimientos y prevención").
class _DestinationEntry {
  _DestinationEntry({this.countryId, String city = ''})
      : cityController = TextEditingController(text: city);

  String? countryId;
  final TextEditingController cityController;
}

enum _TripFilter { open, closed, all }

class _TripsScreenState extends State<TripsScreen> {
  List<dynamic> _trips = [];
  bool _loading = true;
  String? _error;
  final RemoteTtsPlayer _tts = RemoteTtsPlayer();

  /// Pedido explícito del usuario: "se debe poder filtrar por viajes
  /// abiertos y cerrados o todos, de entrada la consulta tiene que venir
  /// con viajes abiertos" — arranca en "abiertos", el viajero puede
  /// cambiarlo para ver los ya finalizados o el listado completo.
  _TripFilter _filter = _TripFilter.open;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _tts.dispose();
    super.dispose();
  }

  /// Un viaje cuenta como "abierto" si todavía no terminó (termina hoy o
  /// después). Si no se puede interpretar la fecha, se lo deja como
  /// abierto (mejor mostrar de más que esconder un viaje real por un
  /// dato raro).
  bool _isOpen(Map<String, dynamic> t) {
    final endRaw = t['trip_end'] as String?;
    if (endRaw == null) return true;
    final end = DateTime.tryParse(endRaw);
    if (end == null) return true;
    final today = DateTime.now();
    final endDateOnly = DateTime(end.year, end.month, end.day);
    final todayDateOnly = DateTime(today.year, today.month, today.day);
    return !endDateOnly.isBefore(todayDateOnly);
  }

  List<Map<String, dynamic>> get _filteredTrips {
    final all = _trips.cast<Map<String, dynamic>>();
    switch (_filter) {
      case _TripFilter.open:
        return all.where(_isOpen).toList();
      case _TripFilter.closed:
        return all.where((t) => !_isOpen(t)).toList();
      case _TripFilter.all:
        return all;
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ApiClient.instance.dio.get('/me/trips');
      if (!mounted) return;
      setState(() {
        _trips = response.data as List;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = context.tr('trips.loadError');
        _loading = false;
      });
    }
  }

  /// Pedido explícito del usuario: "eso puede pasar que se equivoque
  /// al ingresarlo" — el mismo formulario de alta sirve para corregir
  /// un viaje ya cargado (nombre, fechas, o completar/corregir los
  /// destinos) pasándole `existing` (la fila tal cual la devuelve
  /// GET /me/trips) — precarga los campos y guarda con PATCH en vez
  /// de POST.
  Future<void> _openForm([Map<String, dynamic>? existing]) async {
    final isEdit = existing != null;
    final countries = await CatalogService.get('COUNTRY');
    final nameController = TextEditingController(text: existing?['trip_name'] as String? ?? '');
    DateTime? start = existing != null ? DateTime.parse(existing['trip_start'] as String) : null;
    DateTime? end = existing != null ? DateTime.parse(existing['trip_end'] as String) : null;
    final existingDestinations = (existing?['destinations'] as List?) ?? [];
    final destinations = existingDestinations.isEmpty
        ? [_DestinationEntry()]
        : existingDestinations
            .map((d) => _DestinationEntry(countryId: d['countryId'] as String?, city: d['city'] as String? ?? ''))
            .toList();

    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: StatefulBuilder(
          builder: (ctx, setSheetState) => SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(isEdit ? context.tr('trips.formEditTitle') : context.tr('trips.formNewTitle'), style: Theme.of(ctx).textTheme.titleLarge),
                const SizedBox(height: 12),
                TextField(controller: nameController, decoration: InputDecoration(labelText: context.tr('trips.tripNameLabel'))),
                const SizedBox(height: 12),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(start != null ? context.tr('trips.startDateFrom', params: {'date': DateFormat('dd/MM/yyyy').format(start!)}) : context.tr('trips.startDateLabel')),
                  trailing: const Icon(Icons.calendar_today),
                  onTap: () async {
                    final picked = await showDatePicker(context: ctx, initialDate: start ?? DateTime.now(), firstDate: DateTime(2020), lastDate: DateTime(2100));
                    if (picked == null) return;
                    setSheetState(() => start = picked);
                    // Pedido explícito del usuario: "como lo hacen las
                    // plataformas web, sin tener que marcar fecha de
                    // inicio, dar OK, y volver a entrar para marcar
                    // fecha de fin" — apenas se confirma el inicio, se
                    // encadena directo al selector de fin en vez de
                    // volver al formulario y esperar un segundo toque.
                    // Si ya había una fecha de fin cargada y sigue
                    // siendo posterior al nuevo inicio, se respeta tal
                    // cual (no hace falta tocarla de nuevo).
                    if (!ctx.mounted) return;
                    final endPicked = await showDatePicker(
                      context: ctx,
                      initialDate: (end != null && end!.isAfter(picked)) ? end! : picked,
                      firstDate: picked,
                      lastDate: DateTime(2100),
                    );
                    if (endPicked != null) setSheetState(() => end = endPicked);
                  },
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(end != null ? context.tr('trips.endDateUntil', params: {'date': DateFormat('dd/MM/yyyy').format(end!)}) : context.tr('trips.endDateLabel')),
                  trailing: const Icon(Icons.calendar_today),
                  onTap: () async {
                    final picked = await showDatePicker(context: ctx, initialDate: end ?? start ?? DateTime.now(), firstDate: start ?? DateTime(2020), lastDate: DateTime(2100));
                    if (picked != null) setSheetState(() => end = picked);
                  },
                ),
                const SizedBox(height: 16),
                Text(context.tr('trips.destinationsOptional'), style: Theme.of(ctx).textTheme.titleSmall),
                Text(
                  context.tr('trips.destinationsHint'),
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                ),
                for (var i = 0; i < destinations.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              DropdownButtonFormField<String>(
                                initialValue: destinations[i].countryId,
                                isExpanded: true,
                                decoration: InputDecoration(labelText: context.tr('trips.countryLabel')),
                                items: countries.map((c) => DropdownMenuItem(value: c.id, child: Text(c.label(context.lang), overflow: TextOverflow.ellipsis))).toList(),
                                onChanged: (v) => setSheetState(() => destinations[i].countryId = v),
                              ),
                              const SizedBox(height: 8),
                              TextField(
                                controller: destinations[i].cityController,
                                decoration: InputDecoration(labelText: context.tr('trips.cityLabel')),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.remove_circle_outline),
                          tooltip: context.tr('trips.removeDestination'),
                          onPressed: destinations.length == 1
                              ? null
                              : () => setSheetState(() => destinations.removeAt(i)),
                        ),
                      ],
                    ),
                  ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () => setSheetState(() => destinations.add(_DestinationEntry())),
                    icon: const Icon(Icons.add),
                    label: Text(context.tr('trips.addAnotherDestination')),
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  // Bug real reportado en vivo: el botón quedaba deshabilitado
                  // (gris) sin fechas elegidas, y tocar un botón deshabilitado
                  // no hace NADA — ni error, ni aviso — así que se sentía
                  // como que "no guarda nada". Ahora siempre está activo y,
                  // si falta algo, avisa con un mensaje claro en vez de
                  // quedarse mudo.
                  onPressed: () async {
                    if (start == null || end == null) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        SnackBar(content: Text(context.tr('trips.pickDatesError'))),
                      );
                      return;
                    }
                    final destinationPayload = destinations
                        .where((d) => d.countryId != null)
                        .map((d) => {'countryId': d.countryId, 'city': d.cityController.text.trim()})
                        .toList();
                    final data = {
                      if (nameController.text.trim().isNotEmpty) 'tripName': nameController.text.trim(),
                      'tripStart': start!.toIso8601String().split('T').first,
                      'tripEnd': end!.toIso8601String().split('T').first,
                      'destinations': destinationPayload,
                    };
                    final saveTripErrorFallback = context.tr('trips.saveTripError');
                    try {
                      if (isEdit) {
                        await ApiClient.instance.dio.patch('/me/trips/${existing['id']}', data: data);
                      } else {
                        await ApiClient.instance.dio.post('/me/trips', data: data);
                      }
                      if (ctx.mounted) Navigator.of(ctx).pop();
                      await _load();
                    } catch (e) {
                      // Bug real reportado en vivo: al fallar el guardado
                      // (ej. error de validación) el diálogo "no hacía
                      // nada" — no había ningún catch, así que la
                      // excepción quedaba sin mostrarse en ningún lado.
                      if (ctx.mounted) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          SnackBar(content: Text(dioErrorMessage(e, saveTripErrorFallback))),
                        );
                      }
                    }
                  },
                  child: Text(context.tr('trips.saveButton')),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Pedido explícito del usuario: al cargar un viaje, poder consultar
  /// vacunas/riesgos de salud/alertas de seguridad de CADA destino del
  /// viaje con un botón (GET /me/trips/:id/destination-info — tabla
  /// curada, y si falta un país, la IA lo busca en la web y lo guarda
  /// para la próxima). El contenido nunca reemplaza fuentes oficiales,
  /// por eso el disclaimer fijo al pie del diálogo.
  ///
  /// Bug real reportado en vivo: con dos destinos, un país sin ningún
  /// campo cargado (fila vacía) desaparecía en silencio del diálogo —
  /// ahora cada país siempre muestra su encabezado, con un aviso
  /// explícito si no hay info todavía.
  ///
  /// Pedido explícito del usuario: que la IA lea la info en voz alta
  /// de entrada (no hace falta tocar nada), con un botón de parlante
  /// para silenciarla si no la quiere escuchar.
  Future<void> _showDestinationInfo(String tripId, String place) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => const AlertDialog(
        content: SizedBox(height: 100, child: Center(child: CircularProgressIndicator())),
      ),
    );

    List<dynamic>? countries;
    Object? error;
    try {
      final response = await ApiClient.instance.dio.get('/me/trips/$tripId/destination-info');
      countries = response.data as List<dynamic>;
    } catch (e) {
      error = e;
    }
    if (!mounted) return;
    Navigator.of(context).pop(); // cierra el diálogo de carga

    if (error != null) {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(context.tr('trips.destinationInfoTooltip')),
          content: Text(dioErrorMessage(error!, context.tr('trips.destinationInfoError'))),
          actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(context.tr('trips.close')))],
        ),
      );
      return;
    }

    final resolvedCountries = countries!;
    // Bug real reportado en vivo: "tarda demasiado en empezar a hablar" —
    // un trozo por PAÍS (las 4 secciones juntas) seguía siendo un texto
    // largo para el primer pedido de síntesis. Ahora el trozo es por
    // SECCIÓN — el primero que suena (ej. "Argentina. Vacunas: ...") es
    // bien corto, y el resto de las secciones se van sintetizando en
    // paralelo mientras suena la anterior (ver RemoteTtsPlayer.speakChunks)
    // — la impaciencia real de la gente para estos temas pesa más que
    // agrupar prolijo por país.
    final speakableParts = <String>[];
    for (final c in resolvedCountries) {
      final country = c as Map<String, dynamic>;
      final label = country['countryLabel'] as String? ?? '';
      final sections = [
        (context.tr('trips.vaccinations'), country['vaccinations'] as String?),
        (context.tr('trips.healthRisks'), country['healthRisks'] as String?),
        (context.tr('trips.securityAlerts'), country['securityAlerts'] as String?),
        (context.tr('trips.tips'), country['generalTips'] as String?),
      ].where((s) => (s.$2 ?? '').trim().isNotEmpty).toList();
      if (sections.isEmpty) {
        speakableParts.add(context.tr('trips.noInfoYetFor', params: {'place': label}));
        continue;
      }
      for (var i = 0; i < sections.length; i++) {
        final (sectionLabel, sectionText) = sections[i];
        // Solo el primer trozo de cada país repite el nombre del país,
        // para que no suene "Argentina. Vacunas... Argentina. Riesgos...".
        speakableParts.add(i == 0 ? '$label. $sectionLabel: $sectionText' : '$sectionLabel: $sectionText');
      }
    }
    // Pedido explícito del usuario: arranca SIEMPRE con el micrófono/voz
    // apagado (solo lectura) — si el viajero la prende a propósito, ahí
    // sí se lee en voz alta; antes esto empezaba a hablar solo apenas se
    // abría el diálogo, sin que nadie lo pidiera. Misma voz que el
    // asistente de salud (RemoteTtsPlayer, configurable desde admin-web),
    // nunca la voz genérica del dispositivo.
    bool voiceEnabled = false;
    // Bug real reportado en vivo: "tarda demasiado" — con varios destinos
    // el primer audio podía demorar varios segundos en llegar (ver
    // RemoteTtsPlayer.speakChunks) y el ícono no daba ninguna señal de
    // que ya estaba trabajando, parecía trabado. Este spinner cubre
    // justo esa espera inicial.
    bool voiceLoading = false;

    if (!mounted) return;
    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Row(
            children: [
              Expanded(child: Text('${context.tr('trips.destinationInfoTooltip')}\n$place', style: Theme.of(ctx).textTheme.titleMedium)),
              if (voiceLoading)
                const Padding(
                  padding: EdgeInsets.all(12),
                  child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
                )
              else
                IconButton(
                  icon: Icon(voiceEnabled ? Icons.volume_up : Icons.volume_off),
                  tooltip: voiceEnabled ? context.tr('trips.mute') : context.tr('trips.enableVoice'),
                  onPressed: () {
                    if (voiceEnabled) {
                      _tts.stop();
                      setDialogState(() => voiceEnabled = false);
                    } else if (speakableParts.isNotEmpty) {
                      setDialogState(() => voiceLoading = true);
                      unawaited(_tts.speakChunks(
                        speakableParts,
                        onFirstAudioStart: () {
                          if (ctx.mounted) setDialogState(() => voiceLoading = false);
                        },
                      ));
                      setDialogState(() => voiceEnabled = true);
                    }
                  },
                ),
            ],
          ),
          content: SizedBox(
            width: double.maxFinite,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final c in resolvedCountries) ...[
                    Text(c['countryLabel'] as String? ?? '', style: Theme.of(ctx).textTheme.titleSmall),
                    const SizedBox(height: 8),
                    () {
                      final sections = [
                        (context.tr('trips.vaccinations'), c['vaccinations'] as String?),
                        (context.tr('trips.healthRisks'), c['healthRisks'] as String?),
                        (context.tr('trips.securityAlerts'), c['securityAlerts'] as String?),
                        (context.tr('trips.tips'), c['generalTips'] as String?),
                      ].where((s) => (s.$2 ?? '').trim().isNotEmpty).toList();
                      if (sections.isEmpty) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(context.tr('trips.noInfoYet')),
                        );
                      }
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          for (final s in sections)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(s.$1, style: const TextStyle(fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 4),
                                  Text(s.$2!),
                                ],
                              ),
                            ),
                        ],
                      );
                    }(),
                    if (resolvedCountries.indexOf(c) < resolvedCountries.length - 1) const Divider(height: 24),
                  ],
                  const Divider(height: 24),
                  Text(
                    context.tr('trips.disclaimer'),
                    style: Theme.of(ctx).textTheme.bodySmall?.copyWith(color: Colors.grey),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                _tts.stop();
                Navigator.of(ctx).pop();
              },
              child: Text(context.tr('trips.close')),
            ),
          ],
        ),
      ),
    );
    _tts.stop();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(appBar: AppBar(title: Text(context.tr('trips.title'))), body: const Center(child: CircularProgressIndicator()));
    }
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: Text(context.tr('trips.title'))),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 40, color: Colors.grey),
                const SizedBox(height: 12),
                Text(_error!, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                OutlinedButton(onPressed: _load, child: Text(context.tr('common.retry'))),
              ],
            ),
          ),
        ),
      );
    }
    final filteredTrips = _filteredTrips;
    final emptyMessage = switch (_filter) {
      _TripFilter.open => context.tr('trips.emptyPlanned'),
      _TripFilter.closed => context.tr('trips.emptyDone'),
      _TripFilter.all => context.tr('trips.emptyAll'),
    };
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('trips.title'))),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: SegmentedButton<_TripFilter>(
              // Bug real reportado en vivo: "Planificados" se cortaba en dos
              // líneas porque el tamaño de letra por defecto no entra en un
              // tercio del ancho — se reduce solo acá (no cambia el resto de
              // la app) para que las 3 etiquetas entren en una sola línea.
              // Bajar solo la fuente no alcanzó ("Planificados" seguía
              // partiéndose en dos líneas) — el padding interno de cada
              // segmento (16px a cada lado por default) le sacaba más
              // ancho todavía a la etiqueta más larga. Con padding chico
              // y densidad compacta entran los tres textos en una línea.
              style: SegmentedButton.styleFrom(
                textStyle: const TextStyle(fontSize: 12),
                padding: const EdgeInsets.symmetric(horizontal: 4),
                visualDensity: VisualDensity.compact,
              ),
              // El tilde de seleccionado le robaba ancho a la etiqueta y
              // seguía cortando "Planificados" en dos líneas. Se saca el
              // ícono y queda solo el color de fondo como indicador de
              // selección (pedido explícito en vivo).
              showSelectedIcon: false,
              segments: [
                ButtonSegment(value: _TripFilter.open, label: Text(context.tr('trips.filterPlanned'))),
                ButtonSegment(value: _TripFilter.closed, label: Text(context.tr('trips.filterDone'))),
                ButtonSegment(value: _TripFilter.all, label: Text(context.tr('trips.filterAll'))),
              ],
              selected: {_filter},
              onSelectionChanged: (s) => setState(() => _filter = s.first),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              child: filteredTrips.isEmpty
                  ? ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(emptyMessage))])
                  : ListView.builder(
                itemCount: filteredTrips.length,
                itemBuilder: (context, i) {
                  final t = filteredTrips[i];
                  final destinations = (t['destinations'] as List?) ?? [];
                  final place = destinations
                      .map((d) {
                        final city = d['city'] as String?;
                        final country = d['countryLabel'] as String?;
                        return [city, country].where((p) => p != null && p.isNotEmpty).join(', ');
                      })
                      .where((p) => p.isNotEmpty)
                      .join(' · ');
                  final tripName = t['trip_name'] as String?;
                  final autoDetected = tripName == 'Viaje detectado por evento';
                  final title = place.isNotEmpty ? place : (tripName ?? context.tr('trips.defaultName'));
                  // Bug real reportado en vivo: se mostraba la fecha cruda
                  // del backend (ej. "2026-08-13T03:00:00.000Z") en vez de
                  // un formato legible — mismo criterio dd/MM/yyyy que ya
                  // se usa arriba en el diálogo de alta/edición de viaje.
                  final tripStartFmt = DateTime.tryParse(t['trip_start'] as String? ?? '');
                  final tripEndFmt = DateTime.tryParse(t['trip_end'] as String? ?? '');
                  final dateRange = tripStartFmt != null && tripEndFmt != null
                      ? '${DateFormat('dd/MM/yyyy').format(tripStartFmt)} → ${DateFormat('dd/MM/yyyy').format(tripEndFmt)}'
                      : '${t['trip_start']} → ${t['trip_end']}';
                  final subtitleParts = <String>[
                    dateRange,
                    if (place.isNotEmpty && autoDetected) context.tr('trips.autoDetectedLocation'),
                    if (place.isNotEmpty && !autoDetected && tripName != null && tripName.isNotEmpty) tripName,
                  ];
                  return ListTile(
                    leading: const Icon(Icons.flight_takeoff),
                    title: Text(title),
                    subtitle: Text(subtitleParts.join(' · ')),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (destinations.isNotEmpty)
                          IconButton(
                            icon: const Icon(Icons.health_and_safety_outlined),
                            tooltip: context.tr('trips.destinationInfoTooltip'),
                            onPressed: () => _showDestinationInfo(t['id'] as String, title),
                          ),
                        IconButton(
                          icon: const Icon(Icons.edit_outlined),
                          tooltip: context.tr('trips.editTripTooltip'),
                          onPressed: () => _openForm(t),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(onPressed: _openForm, child: const Icon(Icons.add)),
    );
  }
}
