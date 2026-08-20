import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/auth_state.dart';
import '../../core/catalog_service.dart';
import '../../core/error_message.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _emailConfirmController = TextEditingController();
  final _passwordController = TextEditingController();
  final _phoneController = TextEditingController();
  final _docNumberController = TextEditingController();
  String? _docTypeId;
  String? _docCountryId;
  /// Pedido explícito del usuario: la app tiene que poder hablarle a
  /// cada viajero en su idioma — esto es lo único que le pregunta al
  /// registrarse (core.persons.preferred_lang), de ahí en más el
  /// asistente de IA (Clásico y Estructurado) contesta y pregunta en
  /// este idioma automáticamente. El resto de la interfaz de la app
  /// sigue en español por ahora (traducirla es un trabajo aparte).
  String _preferredLang = 'es';
  bool _loading = false;
  bool _loadingCatalogs = true;
  String? _error;
  bool _obscurePassword = true;

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
            phone: _phoneController.text.trim(),
            preferredLang: _preferredLang,
          );
    } catch (e) {
      setState(() => _error = dioErrorMessage(
          e, 'No se pudo registrar — el email o el documento ya podrían estar en uso.'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool get _emailsMatch =>
      _emailController.text.trim().toLowerCase() ==
      _emailConfirmController.text.trim().toLowerCase();

  bool get _isFormValid =>
      _firstNameController.text.trim().isNotEmpty &&
      _lastNameController.text.trim().isNotEmpty &&
      _emailController.text.trim().isNotEmpty &&
      _emailConfirmController.text.trim().isNotEmpty &&
      _emailsMatch &&
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
                          Center(child: Image.asset('assets/images/logo-principal.png', height: 100)),
                          const SizedBox(height: 20),
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
                            controller: _emailConfirmController,
                            keyboardType: TextInputType.emailAddress,
                            decoration: InputDecoration(
                              labelText: 'Confirmar email',
                              helperText: 'Repetilo para evitar errores de tipeo',
                              errorText: _emailConfirmController.text.isNotEmpty && !_emailsMatch
                                  ? 'No coincide con el email de arriba'
                                  : null,
                            ),
                            onChanged: (_) => setLocalState(() {}),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _passwordController,
                            obscureText: _obscurePassword,
                            decoration: InputDecoration(
                              labelText: 'Contraseña',
                              helperText: 'Mínimo 8 caracteres',
                              // Antes solo se deshabilitaba el botón sin
                              // explicar por qué — bug real reportado
                              // ("pongo una contraseña que no va y no me
                              // dice nada").
                              errorText: _passwordController.text.isNotEmpty && _passwordController.text.length < 8
                                  ? 'Le faltan ${8 - _passwordController.text.length} caracteres'
                                  : null,
                              suffixIcon: IconButton(
                                icon: Icon(_obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                                onPressed: () => setLocalState(() => _obscurePassword = !_obscurePassword),
                              ),
                            ),
                            onChanged: (_) => setLocalState(() {}),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _phoneController,
                            keyboardType: TextInputType.phone,
                            decoration: const InputDecoration(
                              labelText: 'Celular (opcional)',
                              helperText: 'Con código de país, ej. +54 9 11 1234-5678',
                            ),
                            onChanged: (_) => setLocalState(() {}),
                          ),
                          const SizedBox(height: 20),
                          Text('Documento de identidad', style: Theme.of(context).textTheme.titleSmall),
                          // Corrección pedida por el usuario en vivo: el alta
                          // ya se identifica por email (único), así que "evitar
                          // duplicados" no es el motivo real que percibe el
                          // viajero — el documento se usa para relacionar la
                          // cuenta nueva con la póliza de asistencia al viajero
                          // ya contratada (ver core.partner_member_records /
                          // proposed-partner-matching-function.sql, matchea por
                          // doc_number_idx).
                          const Text(
                            'Lo pedimos para relacionar tu cuenta con la póliza de asistencia al viajero contratada.',
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
                          const SizedBox(height: 16),
                          const Text('Idioma / Language / Idioma / Langue'),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            children: const [
                              ('es', 'Español'), ('en', 'English'), ('pt', 'Português'), ('fr', 'Français'),
                            ].map((opt) {
                              return ChoiceChip(
                                label: Text(opt.$2),
                                selected: _preferredLang == opt.$1,
                                onSelected: (_) => setLocalState(() => _preferredLang = opt.$1),
                              );
                            }).toList(),
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
