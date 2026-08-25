import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/auth_state.dart';
import '../../core/catalog_service.dart';
import '../../core/error_message.dart';
import '../../l10n/app_strings.dart';

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

  /// El texto fijo de ESTA pantalla no puede depender de
  /// AuthState.preferredLang (todavía no hay cuenta) ni del idioma del
  /// dispositivo (pedido explícito del usuario: si elige "Inglés" acá
  /// arriba, el resto del formulario tiene que pasarse a inglés en el
  /// momento) — se resuelve siempre contra el chip que el usuario tocó.
  String _t(String key, {Map<String, String>? params}) =>
      AppStrings.forLang(_preferredLang, key, params: params);

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
      setState(() => _error = dioErrorMessage(e, _t('register.error')));
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
      appBar: AppBar(title: Text(_t('register.title'))),
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
                          // Bug real reportado en vivo: "el idioma me lo
                          // solicita al final, debería solicitarlo al
                          // principio para que el usuario comprenda la
                          // información que se le solicita completar" —
                          // este selector vivía como el ÚLTIMO campo del
                          // formulario, así que alguien que no lee
                          // español tenía que completar TODO el
                          // formulario (en español) antes de poder
                          // decir en qué idioma prefiere manejarse.
                          // Movido a ser lo primero que se pregunta.
                          Text(_t('register.languagePrompt')),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            children: const [
                              ('es', 'Español'), ('en', 'English'), ('pt', 'Português'), ('fr', 'Français'),
                            ].map((opt) {
                              return ChoiceChip(
                                label: Text(opt.$2),
                                selected: _preferredLang == opt.$1,
                                // setState (no setLocalState): el AppBar
                                // vive AFUERA de este StatefulBuilder, así
                                // que necesita el rebuild completo de la
                                // pantalla para pasarse de idioma también.
                                onSelected: (_) => setState(() => _preferredLang = opt.$1),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 20),
                          TextField(
                            controller: _firstNameController,
                            decoration: InputDecoration(labelText: _t('register.firstName')),
                            onChanged: (_) => setLocalState(() {}),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _lastNameController,
                            decoration: InputDecoration(labelText: _t('register.lastName')),
                            onChanged: (_) => setLocalState(() {}),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _emailController,
                            keyboardType: TextInputType.emailAddress,
                            decoration: InputDecoration(labelText: _t('register.email')),
                            onChanged: (_) => setLocalState(() {}),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _emailConfirmController,
                            keyboardType: TextInputType.emailAddress,
                            decoration: InputDecoration(
                              labelText: _t('register.confirmEmail'),
                              helperText: _t('register.confirmEmailHelper'),
                              errorText: _emailConfirmController.text.isNotEmpty && !_emailsMatch
                                  ? _t('register.confirmEmailMismatch')
                                  : null,
                            ),
                            onChanged: (_) => setLocalState(() {}),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _passwordController,
                            obscureText: _obscurePassword,
                            decoration: InputDecoration(
                              labelText: _t('register.password'),
                              helperText: _t('register.passwordHelper'),
                              // Antes solo se deshabilitaba el botón sin
                              // explicar por qué — bug real reportado
                              // ("pongo una contraseña que no va y no me
                              // dice nada").
                              errorText: _passwordController.text.isNotEmpty && _passwordController.text.length < 8
                                  ? _t('register.passwordMissingChars', params: {'n': '${8 - _passwordController.text.length}'})
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
                            decoration: InputDecoration(
                              labelText: _t('register.phone'),
                              helperText: _t('register.phoneHelper'),
                            ),
                            onChanged: (_) => setLocalState(() {}),
                          ),
                          const SizedBox(height: 20),
                          Text(_t('register.documentSectionTitle'), style: Theme.of(context).textTheme.titleSmall),
                          // Corrección pedida por el usuario en vivo: el alta
                          // ya se identifica por email (único), así que "evitar
                          // duplicados" no es el motivo real que percibe el
                          // viajero — el documento se usa para relacionar la
                          // cuenta nueva con la póliza de asistencia al viajero
                          // ya contratada (ver core.partner_member_records /
                          // proposed-partner-matching-function.sql, matchea por
                          // doc_number_idx).
                          Text(
                            _t('register.documentExplain'),
                            style: const TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                          const SizedBox(height: 8),
                          DropdownButtonFormField<String>(
                            initialValue: _docTypeId,
                            isExpanded: true,
                            decoration: InputDecoration(labelText: _t('register.documentType')),
                            items: _docTypes
                                .map((d) => DropdownMenuItem(value: d.id, child: Text(d.label(_preferredLang), overflow: TextOverflow.ellipsis)))
                                .toList(),
                            onChanged: (v) => setLocalState(() => _docTypeId = v),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _docNumberController,
                            decoration: InputDecoration(labelText: _t('register.documentNumber')),
                            onChanged: (_) => setLocalState(() {}),
                          ),
                          const SizedBox(height: 12),
                          DropdownButtonFormField<String>(
                            initialValue: _docCountryId,
                            isExpanded: true,
                            decoration: InputDecoration(labelText: _t('register.issuingCountry')),
                            items: _countries
                                .map((c) => DropdownMenuItem(value: c.id, child: Text(c.label(_preferredLang), overflow: TextOverflow.ellipsis)))
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
                                : Text(_t('register.submitButton')),
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
