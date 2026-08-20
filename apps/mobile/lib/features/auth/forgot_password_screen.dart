import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';

/// Mismo endpoint y mismo mensaje que forgot-password.page.tsx en
/// admin-web (POST /auth/password-reset/request) — el mail que llega
/// linkea al reset-password.page.tsx de la web, no hay pantalla nativa
/// de "elegir nueva contraseña" en la app (se completa en el navegador
/// del teléfono, mismo flujo que el resto de los recuperos de clave).
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailController = TextEditingController();
  bool _loading = false;
  bool _sent = false;

  Future<void> _submit() async {
    setState(() => _loading = true);
    try {
      await ApiClient.instance.dio.post('/auth/password-reset/request', data: {
        'email': _emailController.text.trim(),
      });
    } finally {
      if (mounted) setState(() {
        _loading = false;
        _sent = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Image.asset('assets/images/logo-principal.png', height: 120),
                  const SizedBox(height: 24),
                  Text(
                    'Recuperar contraseña',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 16),
                  if (_sent) ...[
                    const Card(
                      color: Color(0xFFE8F5E9),
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Text(
                          'Si el email existe en el sistema, vas a recibir un link para restablecer tu contraseña.',
                        ),
                      ),
                    ),
                  ] else ...[
                    Text(
                      'Ingresá tu email y te enviamos un link para restablecer tu contraseña.',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(labelText: 'Email'),
                      onChanged: (_) => setState(() {}),
                      onSubmitted: (_) => _submit(),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: (_loading || _emailController.text.trim().isEmpty) ? null : _submit,
                      child: _loading
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Enviar link'),
                    ),
                  ],
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => context.pop(),
                    child: const Text('Volver a iniciar sesión'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
