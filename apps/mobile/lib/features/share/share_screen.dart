import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';

const _languageOptions = {
  'es': 'Español',
  'en': 'Inglés',
  'pt': 'Portugués',
  'fr': 'Francés',
};

/// Genera un link de "compartir historia clínica" (POST /me/shares/
/// doctor-invite) — el mismo token que abre el médico en
/// /public/shares/:token del panel admin-web, sin necesitar cuenta.
/// TTL configurado en operational_limits (TOKEN_DOCTOR_INVITE_TTL_DAYS,
/// hoy 7 días) — nunca hardcodeado acá tampoco. Pedido explícito del
/// usuario: además de mostrar el QR, poder mandar ese mismo link por
/// mail indicando a quién — cada envío por mail genera un link nuevo
/// (mismo endpoint, con recipientEmail), el backend lo manda con
/// MailService (SMTP configurado en admin-web).
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
  final _emailController = TextEditingController();
  String? _lastSentEmail;
  // Pedido explícito del usuario: elegir en qué idioma va a leer la
  // ficha el médico — se traduce con IA una sola vez al generar el
  // link (ver MeSharesController.createDoctorInvite).
  String _language = 'es';

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  bool get _hasValidEmail => _emailController.text.trim().contains('@');

  Future<void> _generate({bool sendEmail = false}) async {
    final email = _emailController.text.trim();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ApiClient.instance.dio.post('/me/shares/doctor-invite', data: {
        if (sendEmail && email.isNotEmpty) 'recipientEmail': email,
        if (_language != 'es') 'language': _language,
      });
      setState(() {
        _accessUrl = response.data['access_url'] as String;
        _expiresAt = DateTime.tryParse(response.data['expires_at'] as String);
        if (sendEmail && email.isNotEmpty) _lastSentEmail = email;
      });
      if (sendEmail && email.isNotEmpty && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Enviado a $email')),
        );
      }
    } catch (_) {
      setState(() {
        _error = sendEmail
            ? 'No se pudo enviar el mail. Probá de nuevo.'
            : 'No se pudo generar el link. Probá de nuevo.';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Pedido explícito del usuario: "el WhatsApp es del usuario que
  /// está usando la app, la idea es pasarle el mensaje de alguna
  /// forma para que lo remita él por WhatsApp" — mismo patrón que
  /// cualquier botón "compartir por WhatsApp" de una página web
  /// (deep link wa.me): abre WhatsApp con el mensaje ya escrito, el
  /// usuario elige el contacto y toca Enviar. Sin integración con
  /// WhatsApp Business API (eso requeriría cuenta Meta aprobada y
  /// tiene costo por mensaje — fuera de alcance).
  Future<void> _openWhatsApp(String url) async {
    final text = Uri.encodeComponent(
      'Te comparto el acceso a mi Historial de Salud de MedTravelApp: $url',
    );
    final waUri = Uri.parse('https://wa.me/?text=$text');
    final launched = await launchUrl(waUri, mode: LaunchMode.externalApplication);
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo abrir WhatsApp.')),
      );
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
                'Generá un QR o link para que el médico o institución que te está atendiendo vea tu Historial de Salud sin necesitar cuenta. El médico también puede dejar una nota de la atención.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  labelText: 'Email del médico (opcional)',
                  hintText: 'Para mandarle el link directamente',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.email_outlined),
                ),
              ),
              const SizedBox(height: 16),
              if (_accessUrl == null)
                DropdownButtonFormField<String>(
                  initialValue: _language,
                  decoration: const InputDecoration(
                    labelText: 'Idioma de la ficha para el médico',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.translate_outlined),
                  ),
                  items: _languageOptions.entries
                      .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                      .toList(),
                  onChanged: (v) => setState(() => _language = v ?? 'es'),
                ),
              const SizedBox(height: 16),
              if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
              if (_accessUrl == null) ...[
                FilledButton.icon(
                  onPressed: _loading ? null : () => _generate(),
                  icon: const Icon(Icons.qr_code),
                  label: Text(_loading ? 'Generando…' : 'Generar QR / link'),
                ),
                if (_hasValidEmail)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: OutlinedButton.icon(
                      onPressed: _loading ? null : () => _generate(sendEmail: true),
                      icon: const Icon(Icons.send),
                      label: Text(_loading ? 'Enviando…' : 'Generar y enviar por mail'),
                    ),
                  ),
              ] else ...[
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
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 12,
                  runSpacing: 8,
                  children: [
                    FilledButton.icon(
                      onPressed: () => Share.share(_accessUrl!),
                      icon: const Icon(Icons.share),
                      label: const Text('Compartir link'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _openWhatsApp(_accessUrl!),
                      icon: const Icon(Icons.chat_outlined),
                      label: const Text('Enviar por WhatsApp'),
                    ),
                    if (_hasValidEmail)
                      OutlinedButton.icon(
                        onPressed: _loading ? null : () => _generate(sendEmail: true),
                        icon: const Icon(Icons.email_outlined),
                        label: Text(_loading ? 'Enviando…' : 'Enviar por mail'),
                      ),
                    OutlinedButton(
                      onPressed: () => setState(() {
                        _accessUrl = null;
                        _expiresAt = null;
                        _lastSentEmail = null;
                      }),
                      child: const Text('Generar otro'),
                    ),
                  ],
                ),
                if (_lastSentEmail != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      'Último envío por mail: $_lastSentEmail',
                      style: const TextStyle(color: Colors.green, fontSize: 12),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
