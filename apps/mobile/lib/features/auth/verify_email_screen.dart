import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/error_message.dart';
import '../../l10n/app_strings.dart';

/// Pedido explícito del usuario: "la app hasta que no este validado el
/// mail no deberia permitir su uso" — a diferencia del banner
/// dismissable que había antes en HomeScreen, esta pantalla es el
/// único destino posible mientras AuthState.emailVerified sea false
/// (ver router.dart), sin forma de saltearla salvo yendo a /profile a
/// corregir el email si está mal escrito.
class VerifyEmailScreen extends StatefulWidget {
  const VerifyEmailScreen({super.key});

  @override
  State<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends State<VerifyEmailScreen> {
  final _codeController = TextEditingController();
  bool _verifying = false;
  bool _resending = false;
  String? _error;
  String? _info;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    setState(() {
      _verifying = true;
      _error = null;
    });
    try {
      await ApiClient.instance.dio.post('/auth/verify-email', data: {
        'code': _codeController.text.trim(),
      });
      if (!mounted) return;
      // Esto hace que el redirect de router.dart deje pasar a "/" solo.
      await context.read<AuthState>().refreshEmailVerified();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = dioErrorMessage(e, context.tr('verifyEmail.invalidCodeError')));
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  Future<void> _resend() async {
    setState(() {
      _resending = true;
      _error = null;
      _info = null;
    });
    try {
      await ApiClient.instance.dio.post('/auth/resend-verification-email');
      if (!mounted) return;
      setState(() => _info = context.tr('verifyEmail.resentMessage'));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = dioErrorMessage(e, context.tr('verifyEmail.resendError')));
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('verifyEmail.title')),
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: context.tr('verifyEmail.logoutTooltip'),
            onPressed: () => context.read<AuthState>().logout(),
          ),
        ],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.mark_email_unread_outlined, size: 56),
              const SizedBox(height: 16),
              Text(
                context.tr('verifyEmail.instructions'),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _codeController,
                keyboardType: TextInputType.number,
                maxLength: 6,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 24, letterSpacing: 8),
                decoration: InputDecoration(labelText: context.tr('verifyEmail.codeLabel')),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(_error!, style: const TextStyle(color: Colors.red), textAlign: TextAlign.center),
                ),
              if (_info != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(_info!, style: const TextStyle(color: Colors.green), textAlign: TextAlign.center),
                ),
              FilledButton(
                onPressed: _verifying ? null : _verify,
                child: Text(_verifying ? context.tr('verifyEmail.verifying') : context.tr('verifyEmail.verifyButton')),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: _resending ? null : _resend,
                child: Text(_resending ? context.tr('verifyEmail.resending') : context.tr('verifyEmail.resendCodeButton')),
              ),
              const Divider(height: 32),
              Text(
                context.tr('verifyEmail.wrongEmailQuestion'),
                style: Theme.of(context).textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
              TextButton(
                onPressed: () => context.push('/profile'),
                child: Text(context.tr('verifyEmail.fixInProfile')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
