import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../l10n/app_strings.dart';

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
  bool _previewLoading = false;
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
          SnackBar(content: Text(context.tr('share.sentTo', params: {'email': email}))),
        );
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = sendEmail
            ? context.tr('share.sendEmailError')
            : context.tr('share.generateLinkError');
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Pedido explícito del usuario: "poner una opción para que en la
  /// app se pueda ver que es lo que vería el médico de mi historial de
  /// salud, sin botones habilitados para el médico — así el usuario
  /// puede saber que es lo que se muestra de su historial para los
  /// médicos". Genera un token de solo-lectura (POST /me/shares/preview
  /// — NUNCA lleva 'submit_note' en su scope, a diferencia de
  /// doctor-invite) y abre la MISMA página pública que abriría un
  /// médico real (/public/shares/:token) — no una recreación aparte
  /// que se pueda desincronizar de lo que un médico ve de verdad.
  ///
  /// Bug real reportado en vivo: "no se ve nada" — confirmado con
  /// logcat, el WebView interno (LaunchMode.inAppWebView) SÍ abría la
  /// página pero se cerraba solo medio segundo después. Causa: el
  /// dominio usa el certificado autofirmado de Caddy — _allowPinned
  /// DemoCertificate (ApiClient) lo acepta para el Dio de la app, pero
  /// el WebView nativo de Android no lo confía. Se cambió a
  /// LaunchMode.externalApplication (navegador real) — pero el mismo
  /// certificado autofirmado hace que Chrome bloquee en silencio los
  /// archivos de la página (JS/CSS) aunque el HTML inicial sí cargue,
  /// dejando una pantalla en blanco sin ningún aviso claro. Probado
  /// con el mismo link exacto por localhost (sin certificado de por
  /// medio): la página funciona perfecto — el bug es puntual del
  /// certificado, no del código de la página.
  ///
  /// Para el celular de prueba conectado por USB (con `adb reverse
  /// tcp:5173 tcp:5173` además del ya existente para el backend), se
  /// prueba primero si el servidor local de admin-web responde — si sí,
  /// se abre esa misma página por localhost (sin HTTPS, sin
  /// certificado, sin el bloqueo) en vez del link público. Mismo
  /// criterio que ApiClient.autoDetectBaseUrl: local si se puede,
  /// público si no (para cualquier otro dispositivo/navegador real).
  Future<void> _previewAsDoctor() async {
    setState(() {
      _previewLoading = true;
      _error = null;
    });
    try {
      // Bug real reportado en vivo: "no la traduce al idioma elegido" —
      // este pedido nunca mandaba el idioma que el viajero elige en el
      // mismo selector de más abajo (_language), a diferencia de
      // _generate() que sí lo manda para el link real de compartir.
      final response = await ApiClient.instance.dio.post('/me/shares/preview', data: {
        if (_language != 'es') 'language': _language,
      });
      final publicUrl = response.data['accessUrl'] as String;
      final url = await _resolvePreviewUrl(publicUrl);
      final launched = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      if (!launched && mounted) {
        setState(() => _error = context.tr('share.previewError'));
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = context.tr('share.previewError'));
    } finally {
      if (mounted) setState(() => _previewLoading = false);
    }
  }

  Future<String> _resolvePreviewUrl(String publicUrl) async {
    final path = Uri.parse(publicUrl).path;
    final localUrl = 'http://localhost:5173$path';
    try {
      final probe = Dio(BaseOptions(
        connectTimeout: const Duration(milliseconds: 500),
        receiveTimeout: const Duration(milliseconds: 500),
      ));
      final response = await probe.get('http://localhost:5173/');
      if (response.statusCode == 200) return localUrl;
    } catch (_) {
      // localhost:5173 no respondió (no es el celular de prueba por
      // USB) — seguimos con el link público de abajo.
    }
    return publicUrl;
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
    final text = Uri.encodeComponent(context.tr('share.whatsappMessage', params: {'url': url}));
    final waUri = Uri.parse('https://wa.me/?text=$text');
    final launched = await launchUrl(waUri, mode: LaunchMode.externalApplication);
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.tr('share.whatsappError'))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final languageOptions = {
      'es': context.tr('share.languageSpanish'),
      'en': context.tr('share.languageEnglish'),
      'pt': context.tr('share.languagePortuguese'),
      'fr': context.tr('share.languageFrench'),
    };
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('share.title'))),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.qr_code_2, size: 48),
              const SizedBox(height: 8),
              Text(
                context.tr('share.intro'),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: _previewLoading ? null : _previewAsDoctor,
                icon: const Icon(Icons.visibility_outlined),
                label: Text(_previewLoading ? context.tr('share.previewing') : context.tr('share.previewButton')),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: context.tr('share.doctorEmailLabel'),
                  hintText: context.tr('share.doctorEmailHint'),
                  border: const OutlineInputBorder(),
                  prefixIcon: const Icon(Icons.email_outlined),
                ),
              ),
              const SizedBox(height: 16),
              if (_accessUrl == null)
                DropdownButtonFormField<String>(
                  initialValue: _language,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: context.tr('share.languageLabel'),
                    border: const OutlineInputBorder(),
                    prefixIcon: const Icon(Icons.translate_outlined),
                  ),
                  items: languageOptions.entries
                      .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value, overflow: TextOverflow.ellipsis)))
                      .toList(),
                  onChanged: (v) => setState(() => _language = v ?? 'es'),
                ),
              const SizedBox(height: 16),
              if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
              if (_accessUrl == null) ...[
                FilledButton.icon(
                  onPressed: _loading ? null : () => _generate(),
                  icon: const Icon(Icons.qr_code),
                  label: Text(_loading ? context.tr('share.generating') : context.tr('share.generateButton')),
                ),
                if (_hasValidEmail)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: OutlinedButton.icon(
                      onPressed: _loading ? null : () => _generate(sendEmail: true),
                      icon: const Icon(Icons.send),
                      label: Text(_loading ? context.tr('share.sending') : context.tr('share.generateAndSendButton')),
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
                      context.tr('share.expiresOn', params: {'date': '${_expiresAt!.toLocal()}'}),
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
                      label: Text(context.tr('share.shareLinkButton')),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _openWhatsApp(_accessUrl!),
                      icon: const Icon(Icons.chat_outlined),
                      label: Text(context.tr('share.sendWhatsAppButton')),
                    ),
                    if (_hasValidEmail)
                      OutlinedButton.icon(
                        onPressed: _loading ? null : () => _generate(sendEmail: true),
                        icon: const Icon(Icons.email_outlined),
                        label: Text(_loading ? context.tr('share.sending') : context.tr('share.sendEmailButton')),
                      ),
                    OutlinedButton(
                      onPressed: () => setState(() {
                        _accessUrl = null;
                        _expiresAt = null;
                        _lastSentEmail = null;
                      }),
                      child: Text(context.tr('share.generateAnotherButton')),
                    ),
                  ],
                ),
                if (_lastSentEmail != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      context.tr('share.lastSentTo', params: {'email': _lastSentEmail!}),
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
