import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? _profile;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final response = await ApiClient.instance.dio.get('/me/profile');
      setState(() {
        _profile = response.data as Map<String, dynamic>;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = _profile != null
        ? '${_profile!['first_name']} ${_profile!['last_name']}'
        : null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('MedTravelApp'),
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
                      leading: const CircleAvatar(child: Icon(Icons.person)),
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
                    title: 'Compartir mi ficha médica',
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
                    icon: Icons.medical_information_outlined,
                    title: 'Completar ficha médica',
                    subtitle: 'Alergias, condiciones, medicamentos',
                    onTap: () => context.push('/health'),
                  ),
                  _QuickAction(
                    icon: Icons.health_and_safety_outlined,
                    title: 'Cargar con el asistente de salud',
                    subtitle: 'Contale tus alergias/medicamentos y los carga por vos',
                    onTap: () => context.push('/health-assistant'),
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
