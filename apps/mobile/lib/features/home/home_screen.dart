import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/brand_logo.dart';
import '../../core/jwt.dart';
import '../../core/tenant_config_service.dart';
import '../../l10n/app_strings.dart';
import '../assistant/health_assistant_screen.dart' show healthDataVersion, openHealthAssistant;

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? _profile;
  bool _loading = true;
  Uint8List? _photoBytes;
  final _storage = const FlutterSecureStorage();
  /// Pedido explícito del usuario: "la app tiene que controlar además
  /// que la persona... haya cargado su fecha de nacimiento, su número
  /// de celular y por lo menos un contacto de emergencia" — sin esto,
  /// ni el asistente de salud ni una emergencia real tienen cómo
  /// contactar a nadie. null mientras no se pudo consultar todavía.
  bool? _hasEmergencyContact;

  @override
  void initState() {
    super.initState();
    _load();
    _maybeShowOnboarding();
    // Ver el comentario de healthDataVersion en health_assistant_screen.dart
    // — mismo bug de "no se enteró de los datos nuevos", pero para cuando
    // el asistente se abrió desde OTRA pantalla que no es esta (ej. la
    // pestaña "Salud"), no solo desde acá (eso ya lo cubre _navigateAndRefresh).
    healthDataVersion.addListener(_load);
  }

  @override
  void dispose() {
    healthDataVersion.removeListener(_load);
    super.dispose();
  }

  /// Mensaje de bienvenida general, una sola vez (marca vista en el
  /// dispositivo con flutter_secure_storage — mismo mecanismo que ya
  /// usa ApiClient para los tokens). El guion vive en la base de
  /// conocimiento (ai.knowledge_base_entries, scope ONBOARDING),
  /// editable desde admin-web — no hardcodeado acá. Si falla (sin red,
  /// etc.) no se marca como visto, para reintentar la próxima vez que
  /// se abra la app en vez de perderse el mensaje para siempre.
  Future<void> _maybeShowOnboarding() async {
    const key = 'onboarding_seen';
    final seen = await _storage.read(key: key);
    if (seen == 'true') return;
    try {
      final response = await ApiClient.instance.dio.get('/me/assistant/onboarding-message');
      final message = response.data['message'] as String?;
      if (message == null || message.trim().isEmpty || !mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: Text(context.tr('home.welcomeTitle')),
          content: Text(message),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: Text(context.tr('home.understood')),
            ),
          ],
        ),
      );
      await _storage.write(key: key, value: 'true');
    } catch (_) {
      // Silencioso — no bloquear el uso de la app si esto falla.
    }
  }

  /// Bug real reportado en vivo: "al regresar después de grabar la
  /// información mostró que todavía no cargaste información — eso es
  /// un error porque la acabamos de cargar". El dato en la base estaba
  /// bien (verificado directo); lo que pasaba es que esta pantalla
  /// solo se cargaba una vez, en initState — al volver de cargar la
  /// Ficha de Salud (o editar el perfil) seguía mostrando el _profile
  /// viejo, de ANTES de la carga. Se refresca apenas se vuelve de
  /// cualquier pantalla que pudo haber cambiado perfil/ficha de salud.
  Future<void> _navigateAndRefresh(Future<void> Function() navigate) async {
    await navigate();
    if (mounted) await _load();
  }

  Future<void> _load() async {
    try {
      final response = await ApiClient.instance.dio.get('/me/profile');
      setState(() {
        _profile = response.data as Map<String, dynamic>;
        _loading = false;
      });
      if (_profile!['photo_path'] != null) {
        _loadPhoto();
      }
    } catch (_) {
      setState(() => _loading = false);
      return;
    }
    // Aparte del perfil principal — si esto falla (sin red, etc.) no
    // hace que el resto de la pantalla principal deje de mostrarse,
    // simplemente no se muestra el aviso de contacto de emergencia.
    try {
      final response = await ApiClient.instance.dio.get('/me/emergency-contacts');
      if (mounted) setState(() => _hasEmergencyContact = (response.data as List).isNotEmpty);
    } catch (_) {
      // Silencioso — ver comentario arriba.
    }
    // Bug real reportado en vivo: un admin cambia los flags/marca de una
    // empresa desde el panel y el viajero, ya logueado, no lo ve hasta
    // cerrar sesión — TenantConfigService solo se refrescaba en
    // login/registro/bootstrap. Se refresca también acá (Inicio ya se
    // recarga solo, pull-to-refresh y al volver de cualquier pantalla)
    // para que un cambio de configuración llegue sin pedirle al viajero
    // que cierre sesión.
    if (mounted) await context.read<TenantConfigService>().refresh();
  }

  Future<void> _loadPhoto() async {
    try {
      final token = await ApiClient.instance.getAccessToken();
      if (token == null) return;
      final personId = decodeJwtPayload(token)['personId'] as String?;
      if (personId == null) return;
      final response = await ApiClient.instance.dio.get<List<int>>(
        '/clinical/patient-photo/$personId',
        options: Options(responseType: ResponseType.bytes),
      );
      if (mounted) setState(() => _photoBytes = Uint8List.fromList(response.data!));
    } catch (_) {
      // Sin foto o sin acceso — se muestra el placeholder, no es un error visible.
    }
  }

  /// Pedido explícito del usuario: "si no tiene información de salud
  /// cargada... la app no sirve para una asistencia médica" — mismo
  /// criterio ya usado para bloquear el reporte de emergencia
  /// (emergency_screen.dart): health_record_last_updated_at solo se
  /// completa cuando se confirma algún dato clínico real, null
  /// significa que todavía no se cargó nada.
  bool get _needsHealthData =>
      _profile != null && _profile!['health_record_last_updated_at'] == null;

  /// Ver el comentario de _hasEmergencyContact — qué falta puntualmente,
  /// para armar un mensaje concreto en vez de un genérico "completá tu
  /// perfil". null mientras todavía no se pudo determinar (perfil o
  /// contactos sin cargar).
  List<String> get _missingProfileEssentials {
    if (_profile == null) return const [];
    final missing = <String>[];
    if (_profile!['birth_date'] == null) missing.add(context.tr('home.missingBirthDate'));
    if ((_profile!['phone'] as String?)?.trim().isEmpty ?? true) missing.add(context.tr('home.missingPhone'));
    if (_hasEmergencyContact == false) missing.add(context.tr('home.missingEmergencyContact'));
    return missing;
  }

  @override
  Widget build(BuildContext context) {
    final name = _profile != null
        ? '${_profile!['first_name']} ${_profile!['last_name']}'
        : null;
    final tenantConfig = context.watch<TenantConfigService>();
    final assistantEnabled = tenantConfig.isFeatureEnabled('ai.assistant_enabled');

    return Scaffold(
      appBar: AppBar(
        title: const BrandLogo(height: 32),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: context.tr('home.logout'),
            onPressed: () => context.read<AuthState>().logout(),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Stack(
              children: [
                RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                    children: [
                  if (_missingProfileEssentials.isNotEmpty)
                    _IncompleteProfileBanner(
                      missing: _missingProfileEssentials,
                      onTap: () => _navigateAndRefresh(() => context.push('/profile')),
                    ),
                  if (_needsHealthData)
                    _NoHealthDataBanner(onTap: () => _navigateAndRefresh(() => openHealthAssistant(context))),
                  Card(
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundImage: _photoBytes != null ? MemoryImage(_photoBytes!) : null,
                        child: _photoBytes == null ? const Icon(Icons.person) : null,
                      ),
                      title: Text(name ?? context.tr('home.traveler')),
                      subtitle: Text(context.tr('home.viewEditProfile')),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => _navigateAndRefresh(() => context.push('/profile')),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(context.tr('home.quickActions'), style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  _QuickAction(
                    icon: Icons.qr_code_2,
                    title: context.tr('home.shareTitle'),
                    subtitle: context.tr('home.shareSubtitle'),
                    onTap: () => context.push('/share'),
                  ),
                  _QuickAction(
                    icon: Icons.smart_toy_outlined,
                    title: context.tr('home.assistantHelpTitle'),
                    subtitle: context.tr('home.assistantHelpSubtitle'),
                    locked: !assistantEnabled,
                    onTap: () {
                      if (!assistantEnabled) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(context.tr('home.featureLockedByTenant'))),
                        );
                        return;
                      }
                      context.push('/assistant');
                    },
                  ),
                  _QuickAction(
                    icon: Icons.health_and_safety_outlined,
                    title: context.tr('home.updateHealthTitle'),
                    subtitle: context.tr('home.updateHealthSubtitle'),
                    onTap: () => _navigateAndRefresh(() => openHealthAssistant(context)),
                  ),
                    ],
                  ),
                ),
                // Pedido explícito del usuario: leyenda fija abajo a la
                // derecha de Inicio — Positioned (no parte del
                // ListView) para que quede siempre visible en esa
                // esquina sin importar el scroll.
                Positioned(
                  right: 12,
                  bottom: 8,
                  child: IgnorePointer(
                    child: Text(
                      context.tr('home.poweredBy'),
                      style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

/// Pedido explícito del usuario: alertar en la pantalla principal si
/// todavía no hay nada cargado en la Ficha de Salud — sin eso, la app
/// no sirve para una asistencia médica real (un médico que escanee el
/// QR en una emergencia no va a encontrar nada). Se muestra siempre
/// que falte, no una sola vez como el onboarding — es información que
/// importa recordar hasta que se resuelva.
class _NoHealthDataBanner extends StatelessWidget {
  const _NoHealthDataBanner({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Card(
      color: colors.errorContainer,
      margin: const EdgeInsets.only(bottom: 16),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.warning_amber_rounded, color: colors.onErrorContainer),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.tr('home.noHealthDataTitle'),
                      style: TextStyle(fontWeight: FontWeight.bold, color: colors.onErrorContainer),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      context.tr('home.noHealthDataBody'),
                      style: TextStyle(color: colors.onErrorContainer),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: colors.onErrorContainer),
            ],
          ),
        ),
      ),
    );
  }
}

/// Pedido explícito del usuario: "la app tiene que controlar que la
/// persona haya cargado su fecha de nacimiento, su número de celular y
/// por lo menos un contacto de emergencia" — sin eso, ni el asistente
/// de salud (la fecha de nacimiento se usa para calcular edad) ni una
/// emergencia real (a quién llamar) funcionan bien.
class _IncompleteProfileBanner extends StatelessWidget {
  const _IncompleteProfileBanner({required this.missing, required this.onTap});

  final List<String> missing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final and = context.tr('home.and');
    final list = missing.length == 1
        ? missing.first
        : '${missing.sublist(0, missing.length - 1).join(', ')} $and ${missing.last}';
    return Card(
      color: colors.tertiaryContainer,
      margin: const EdgeInsets.only(bottom: 16),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.person_outline, color: colors.onTertiaryContainer),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.tr('home.incompleteProfileTitle'),
                      style: TextStyle(fontWeight: FontWeight.bold, color: colors.onTertiaryContainer),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      context.tr('home.incompleteProfileBody', params: {'missing': list}),
                      style: TextStyle(color: colors.onTertiaryContainer),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: colors.onTertiaryContainer),
            ],
          ),
        ),
      ),
    );
  }
}

/// `locked` (Fase 1): la empresa activa del viajero no habilitó esta
/// función — pedido explícito del usuario: se muestra igual (no se
/// oculta), pero con candado y sin navegar al tocarla.
class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.locked = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon, color: locked ? colors.outline : colors.primary),
        title: Text(title, style: locked ? TextStyle(color: colors.outline) : null),
        subtitle: Text(subtitle),
        trailing: Icon(locked ? Icons.lock_outline : Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
