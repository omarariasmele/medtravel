import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/auth_state.dart';
import '../../core/catalog_service.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _docNumberController = TextEditingController();
  String? _docTypeId;
  String? _docCountryId;
  bool _loading = false;
  bool _loadingCatalogs = true;
  String? _error;

  List<CatalogValue> _docTypes = [];
  List<CatalogValue> _countries = [];

  @override
  void initState() {
    super.initState();
    _loadCatalogs();
  }

  Future<void> _loadCatalogs() async {
    final results = await Future.wait([
      CatalogService.get('DOCUMENT_TYPE'),
      CatalogService.get('COUNTRY'),
    ]);
    setState(() {
      _docTypes = results[0];
      _countries = results[1];
      _loadingCatalogs = false;
    });
  }

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context.read<AuthState>().register(
            firstName: _firstNameController.text.trim(),
            lastName: _lastNameController.text.trim(),
            email: _emailController.text.trim(),
            password: _passwordController.text,
            docTypeId: _docTypeId!,
            docNumber: _docNumberController.text.trim(),
            docCountryId: _docCountryId!,
          );
    } catch (_) {
      setState(() => _error =
          'No se pudo registrar — el email o el documento ya podrían estar en uso.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool get _isFormValid =>
      _firstNameController.text.trim().isNotEmpty &&
      _lastNameController.text.trim().isNotEmpty &&
      _emailController.text.trim().isNotEmpty &&
      _passwordController.text.length >= 8 &&
      _docTypeId != null &&
      _docNumberController.text.trim().isNotEmpty &&
      _docCountryId != null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Crear cuenta')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: _loadingCatalogs
                  ? const Center(child: CircularProgressIndicator())
                  : StatefulBuilder(
                      builder: (context, setLocalState) => Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (_error != null) ...[
                            Text(_error!, style: const TextStyle(color: Colors.red)),
                            const SizedBox(height: 12),
                          ],
                          TextField(
                            controller: _firstNameController,
                            decoration: const InputDecoration(labelText: 'Nombre'),
                            onChanged: (_) => setLocalState(() {}),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _lastNameController,
                            decoration: const InputDecoration(labelText: 'Apellido'),
                            onChanged: (_) => setLocalState(() {}),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _emailController,
                            keyboardType: TextInputType.emailAddress,
                            decoration: const InputDecoration(labelText: 'Email'),
                            onChanged: (_) => setLocalState(() {}),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _passwordController,
                            obscureText: true,
                            decoration: const InputDecoration(
                              labelText: 'Contraseña',
                              helperText: 'Mínimo 8 caracteres',
                            ),
                            onChanged: (_) => setLocalState(() {}),
                          ),
                          const SizedBox(height: 20),
                          Text('Documento de identidad', style: Theme.of(context).textTheme.titleSmall),
                          const Text(
                            'Lo pedimos para evitar cuentas duplicadas de la misma persona.',
                            style: TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                          const SizedBox(height: 8),
                          DropdownButtonFormField<String>(
                            initialValue: _docTypeId,
                            decoration: const InputDecoration(labelText: 'Tipo de documento'),
                            items: _docTypes
                                .map((d) => DropdownMenuItem(value: d.id, child: Text(d.labelEs)))
                                .toList(),
                            onChanged: (v) => setLocalState(() => _docTypeId = v),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _docNumberController,
                            decoration: const InputDecoration(labelText: 'N° de documento'),
                            onChanged: (_) => setLocalState(() {}),
                          ),
                          const SizedBox(height: 12),
                          DropdownButtonFormField<String>(
                            initialValue: _docCountryId,
                            decoration: const InputDecoration(labelText: 'País emisor'),
                            items: _countries
                                .map((c) => DropdownMenuItem(value: c.id, child: Text(c.labelEs)))
                                .toList(),
                            onChanged: (v) => setLocalState(() => _docCountryId = v),
                          ),
                          const SizedBox(height: 20),
                          FilledButton(
                            onPressed: (_loading || !_isFormValid) ? null : _submit,
                            child: _loading
                                ? const SizedBox(
                                    height: 20,
                                    width: 20,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : const Text('Crear cuenta'),
                          ),
                        ],
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
