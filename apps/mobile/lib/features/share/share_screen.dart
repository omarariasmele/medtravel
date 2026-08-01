import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api_client.dart';

/// Genera un link de "compartir historia clínica" (POST /me/shares/
/// doctor-invite) — el mismo token que abre el médico en
/// /public/shares/:token del panel admin-web, sin necesitar cuenta.
/// TTL configurado en operational_limits (TOKEN_DOCTOR_INVITE_TTL_DAYS,
/// hoy 7 días) — nunca hardcodeado acá tampoco.
class ShareScreen extends StatefulWidget {
  const ShareScreen({super.key});

  @override
  State<ShareScreen> createState() => _ShareScreenState();
}

class _ShareScreenState extends State<ShareScreen> {
  String? _accessUrl;
  DateTime? _expiresAt;
  bool _loading = false;
  String? _error;

  Future<void> _generate() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ApiClient.instance.dio.post('/me/shares/doctor-invite', data: {});
      setState(() {
        _accessUrl = response.data['access_url'] as String;
        _expiresAt = DateTime.tryParse(response.data['expires_at'] as String);
      });
    } catch (_) {
      setState(() => _error = 'No se pudo generar el link. Probá de nuevo.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Compartir con el médico')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.qr_code_2, size: 48),
              const SizedBox(height: 8),
              const Text(
                'Generá un QR o link para que el médico o institución que te está atendiendo vea tu ficha médica sin necesitar cuenta. El médico también puede dejar una nota de la atención.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
              if (_accessUrl == null)
                FilledButton.icon(
                  onPressed: _loading ? null : _generate,
                  icon: const Icon(Icons.qr_code),
                  label: _loading ? const Text('Generando…') : const Text('Generar QR / link'),
                )
              else ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                  child: QrImageView(data: _accessUrl!, size: 220),
                ),
                const SizedBox(height: 16),
                SelectableText(_accessUrl!, textAlign: TextAlign.center),
                if (_expiresAt != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      'Vence el ${_expiresAt!.toLocal()}',
                      style: const TextStyle(color: Colors.grey, fontSize: 12),
                    ),
                  ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    FilledButton.icon(
                      onPressed: () => Share.share(_accessUrl!),
                      icon: const Icon(Icons.share),
                      label: const Text('Compartir link'),
                    ),
                    const SizedBox(width: 12),
                    OutlinedButton(
                      onPressed: () => setState(() {
                        _accessUrl = null;
                        _expiresAt = null;
                      }),
                      child: const Text('Generar otro'),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
