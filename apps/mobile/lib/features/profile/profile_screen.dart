import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/catalog_service.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _docNumberController = TextEditingController();
  DateTime? _birthDate;
  String? _docTypeId;
  String? _countryId;
  String? _existingDocTypeCode;
  bool _loading = true;
  bool _saving = false;
  String? _message;

  List<CatalogValue> _docTypes = [];
  List<CatalogValue> _countries = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final results = await Future.wait([
      ApiClient.instance.dio.get('/me/profile'),
      CatalogService.get('DOCUMENT_TYPE'),
      CatalogService.get('COUNTRY'),
    ]);
    final profile = (results[0] as dynamic).data as Map<String, dynamic>;
    setState(() {
      _firstNameController.text = profile['first_name'] as String? ?? '';
      _lastNameController.text = profile['last_name'] as String? ?? '';
      _birthDate = profile['birth_date'] != null ? DateTime.tryParse(profile['birth_date'] as String) : null;
      _countryId = profile['country_residence_id'] as String?;
      _docTypes = results[1] as List<CatalogValue>;
      _countries = results[2] as List<CatalogValue>;
      _loading = false;
    });
  }

  Future<void> _saveProfile() async {
    setState(() => _saving = true);
    try {
      await ApiClient.instance.dio.put('/me/profile', data: {
        'firstName': _firstNameController.text.trim(),
        'lastName': _lastNameController.text.trim(),
        if (_birthDate != null) 'birthDate': _birthDate!.toIso8601String().split('T').first,
      });
      setState(() => _message = 'Perfil actualizado.');
    } catch (_) {
      setState(() => _message = 'No se pudo guardar el perfil.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _addDocument() async {
    if (_docTypeId == null || _docNumberController.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      final response = await ApiClient.instance.dio.post('/me/document', data: {
        'docTypeId': _docTypeId,
        'docNumber': _docNumberController.text.trim(),
        if (_countryId != null) 'countryId': _countryId,
      });
      final matched = response.data['matchedPolicies'] as int? ?? 0;
      setState(() {
        _existingDocTypeCode = _docTypes.firstWhere((d) => d.id == _docTypeId).labelEs;
        _message = matched > 0
            ? 'Documento guardado — se encontró $matched póliza(s) esperándote.'
            : 'Documento guardado.';
      });
    } catch (_) {
      setState(() => _message = 'No se pudo guardar el documento (¿ya lo habías cargado?).');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(appBar: AppBar(title: const Text('Mi perfil')), body: const Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Mi perfil')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_message != null) Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_message!, style: TextStyle(color: Theme.of(context).colorScheme.primary)),
          ),
          Text('Datos personales', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TextField(controller: _firstNameController, decoration: const InputDecoration(labelText: 'Nombre')),
          const SizedBox(height: 12),
          TextField(controller: _lastNameController, decoration: const InputDecoration(labelText: 'Apellido')),
          const SizedBox(height: 12),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(_birthDate != null ? 'Nacimiento: ${_birthDate!.toIso8601String().split('T').first}' : 'Fecha de nacimiento'),
            trailing: const Icon(Icons.calendar_today),
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: _birthDate ?? DateTime(1990, 1, 1),
                firstDate: DateTime(1900),
                lastDate: DateTime.now(),
              );
              if (picked != null) setState(() => _birthDate = picked);
            },
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _saving ? null : _saveProfile,
            child: const Text('Guardar perfil'),
          ),
          const Divider(height: 32),
          Text('Documento de identidad', style: Theme.of(context).textTheme.titleMedium),
          const Text(
            'Cargarlo permite que el sistema te asocie automáticamente a tu póliza de asistencia si la empresa ya la cargó.',
            style: TextStyle(fontSize: 12, color: Colors.grey),
          ),
          const SizedBox(height: 8),
          if (_existingDocTypeCode != null)
            Text('Documento cargado: $_existingDocTypeCode'),
          DropdownButtonFormField<String>(
            initialValue: _docTypeId,
            decoration: const InputDecoration(labelText: 'Tipo de documento'),
            items: _docTypes.map((d) => DropdownMenuItem(value: d.id, child: Text(d.labelEs))).toList(),
            onChanged: (v) => setState(() => _docTypeId = v),
          ),
          const SizedBox(height: 12),
          TextField(controller: _docNumberController, decoration: const InputDecoration(labelText: 'N° de documento')),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _countryId,
            decoration: const InputDecoration(labelText: 'País emisor (opcional)'),
            items: _countries.map((c) => DropdownMenuItem(value: c.id, child: Text(c.labelEs))).toList(),
            onChanged: (v) => setState(() => _countryId = v),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: _saving ? null : _addDocument,
            child: const Text('Guardar documento'),
          ),
        ],
      ),
    );
  }
}
