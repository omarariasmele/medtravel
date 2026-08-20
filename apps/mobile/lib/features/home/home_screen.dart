import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/jwt.dart';
import '../assistant/health_assistant_screen.dart' show openHealthAssistant;

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

  @override
  void initState() {
    super.initState();
    _load();
    _maybeShowOnboarding();
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
          title: const Text('¡Bienvenido/a a MedTravelApp!'),
          content: Text(message),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Entendido'),
            ),
          ],
        ),
      );
      await _storage.write(key: key, value: 'true');
    } catch (_) {
      // Silencioso — no bloquear el uso de la app si esto falla.
    }
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
    }
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

  @override
  Widget build(BuildContext context) {
    final name = _profile != null
        ? '${_profile!['first_name']} ${_profile!['last_name']}'
        : null;

    return Scaffold(
      appBar: AppBar(
        title: Image.asset('assets/images/logo-horizontal-blanco.png', height: 32),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Cerrar sesión',
            onPressed: () => context.read<AuthState>().logout(),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Card(
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundImage: _photoBytes != null ? MemoryImage(_photoBytes!) : null,
                        child: _photoBytes == null ? const Icon(Icons.person) : null,
                      ),
                      title: Text(name ?? 'Viajero'),
                      subtitle: const Text('Ver / editar mi perfil'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.push('/profile'),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text('Accesos rápidos', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  _QuickAction(
                    icon: Icons.qr_code_2,
                    title: 'Compartir mi Historial de Salud',
                    subtitle: 'QR o link para el médico que te atienda',
                    onTap: () => context.push('/share'),
                  ),
                  _QuickAction(
                    icon: Icons.smart_toy_outlined,
                    title: 'Asistente para usar la app',
                    subtitle: 'Ayuda para completar tus datos de salud',
                    onTap: () => context.push('/assistant'),
                  ),
                  _QuickAction(
                    icon: Icons.health_and_safety_outlined,
                    title: 'Actualizar información de la Ficha de Salud',
                    subtitle: 'Contale tus alergias/medicamentos y los carga por vos',
                    onTap: () => openHealthAssistant(context),
                  ),
                ],
              ),
            ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon, color: Theme.of(context).colorScheme.primary),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
