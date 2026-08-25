import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../core/api_client.dart';
import '../../core/catalog_service.dart';
import '../../l10n/app_strings.dart';

/// Seguimiento del caso desde la app: qué se reportó, dónde, y el
/// detalle de la atención que va dejando el call center/médico
/// (operations.case_medical_events — mismo dato que ve el operador en
/// admin-web, "Historial del caso"). Pedido explícito del usuario:
/// después de reportar una emergencia, la app debe quedar mostrando
/// esto, no saltar directo al chat.
class CaseDetailScreen extends StatefulWidget {
  const CaseDetailScreen({super.key, required this.caseId, this.channelId, this.caseNumber});

  final String caseId;
  final String? channelId;
  final String? caseNumber;

  @override
  State<CaseDetailScreen> createState() => _CaseDetailScreenState();
}

class _CaseDetailScreenState extends State<CaseDetailScreen> {
  bool _loading = true;
  Map<String, dynamic>? _case;
  Map<String, dynamic>? _location;
  List<dynamic> _events = [];
  List<CatalogValue> _statusCatalog = [];
  List<CatalogValue> _eventTypeCatalog = [];
  io.Socket? _socket;

  @override
  void initState() {
    super.initState();
    _load();
    _connectLiveUpdates();
  }

  /// Pedido explícito del usuario: el caso en atención (y su
  /// historial) tienen que actualizarse solos, sin salir y volver a
  /// entrar a la pantalla — mismo socket/protocolo que ya usa el chat
  /// (events.gateway.ts), escuchando 'case_update' en vez de
  /// 'chat_message'.
  Future<void> _connectLiveUpdates() async {
    final token = await ApiClient.instance.getAccessToken();
    if (!mounted) return;
    _socket = io.io(
      '$apiBaseUrl/cases',
      io.OptionBuilder()
          .setPath('/socket.io')
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .build(),
    );
    _socket!
      ..onConnect((_) {
        _socket!.emit('join_case', {'caseId': widget.caseId});
      })
      ..on('case_update', (_) {
        if (mounted) _load(silent: true);
      })
      ..connect();
  }

  @override
  void dispose() {
    _socket?.emit('leave_case', {'caseId': widget.caseId});
    _socket?.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiClient.instance.dio.get('/me/emergency-cases'),
        ApiClient.instance.dio.get('/operations/emergency-cases/${widget.caseId}/location'),
        ApiClient.instance.dio.get('/operations/case-medical-events', queryParameters: {'caseId': widget.caseId}),
        CatalogService.get('CASE_STATUS'),
        CatalogService.get('MEDICAL_EVENT_TYPE'),
      ]);
      final cases = (results[0] as dynamic).data as List;
      final match = cases.cast<Map<String, dynamic>>().where((c) => c['id'] == widget.caseId);
      setState(() {
        _case = match.isNotEmpty ? match.first : null;
        _location = (results[1] as dynamic).data as Map<String, dynamic>;
        _events = (results[2] as dynamic).data as List;
        _statusCatalog = results[3] as List<CatalogValue>;
        _eventTypeCatalog = results[4] as List<CatalogValue>;
        if (!silent) _loading = false;
      });
    } catch (_) {
      if (mounted && !silent) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final caseNumber = _case?['case_number'] as String? ?? widget.caseNumber ?? '';
    return Scaffold(
      appBar: AppBar(title: Text(caseNumber.isNotEmpty ? caseNumber : context.tr('caseDetail.defaultTitle'))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _case == null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(context.tr('caseDetail.loadError'))))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _buildStatusChip(),
                      const SizedBox(height: 16),
                      _sectionLabel(context.tr('caseDetail.dateTimeLabel')),
                      Text(_formatDateTime(_case!['created_at'] as String?)),
                      const SizedBox(height: 12),
                      _sectionLabel(context.tr('caseDetail.whatsHappeningLabel')),
                      Text(_case!['initial_description'] as String? ?? '—'),
                      const SizedBox(height: 12),
                      _sectionLabel(context.tr('caseDetail.symptomsLabel')),
                      Text((_case!['patient_symptoms'] as String?)?.isNotEmpty == true
                          ? _case!['patient_symptoms'] as String
                          : '—'),
                      const SizedBox(height: 12),
                      _sectionLabel(context.tr('caseDetail.locationLabel')),
                      Text(_locationText()),
                      if (_case!['resolution_notes'] != null) ...[
                        const SizedBox(height: 12),
                        _sectionLabel(context.tr('caseDetail.resolutionLabel')),
                        Text(_case!['resolution_notes'] as String),
                      ],
                      const Divider(height: 32),
                      Text(context.tr('caseDetail.caseAttentionTitle'), style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 4),
                      Text(
                        context.tr('caseDetail.caseAttentionSubtitle'),
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                      const SizedBox(height: 12),
                      if (_events.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          child: Text(context.tr('caseDetail.noEventsYet')),
                        )
                      else
                        ..._sortedEvents().map(_buildEventCard),
                    ],
                  ),
                ),
      floatingActionButton: widget.channelId != null || _case?['channel_id'] != null
          ? FloatingActionButton.extended(
              onPressed: () => context.push('/cases/${widget.caseId}/chat', extra: {
                'channelId': widget.channelId ?? _case?['channel_id'],
                'caseNumber': caseNumber,
              }),
              icon: const Icon(Icons.chat_bubble_outline),
              label: Text(context.tr('caseDetail.chatButton')),
            )
          : null,
    );
  }

  List<Map<String, dynamic>> _sortedEvents() {
    final list = _events.cast<Map<String, dynamic>>().toList();
    list.sort((a, b) => (a['eventAt'] as String).compareTo(b['eventAt'] as String));
    return list;
  }

  Widget _buildEventCard(Map<String, dynamic> e) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Chip(
                  label: Text(CatalogService.labelFor(_eventTypeCatalog, e['eventTypeId'] as String?, lang: context.lang)),
                  visualDensity: VisualDensity.compact,
                ),
                const Spacer(),
                Text(_formatDateTime(e['eventAt'] as String?), style: const TextStyle(fontSize: 12, color: Colors.grey)),
              ],
            ),
            const SizedBox(height: 6),
            Text(e['description'] as String? ?? ''),
          ],
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) {
    return Text(text, style: const TextStyle(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.w600));
  }

  Widget _buildStatusChip() {
    final statusId = _case!['status_id'] as String?;
    final label = CatalogService.labelFor(_statusCatalog, statusId, lang: context.lang);
    final closed = _case!['closed_at'] != null;
    return Chip(
      avatar: Icon(closed ? Icons.check_circle_outline : Icons.pending_actions, size: 18),
      label: Text(label),
      backgroundColor: closed ? Colors.grey.shade300 : Colors.orange.shade100,
    );
  }

  String _locationText() {
    final city = _location?['city'] as String?;
    final country = _location?['countryLabel'] as String?;
    final parts = [city, country].where((p) => p != null && p.isNotEmpty).toList();
    if (parts.isEmpty) return '—';
    return parts.join(', ');
  }

  String _formatDateTime(String? iso) {
    if (iso == null) return '—';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return '—';
    return DateFormat('dd/MM/yyyy HH:mm').format(dt.toLocal());
  }
}
