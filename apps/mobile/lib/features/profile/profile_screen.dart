import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/catalog_service.dart';
import '../../core/jwt.dart';

class _EmergencyContact {
  _EmergencyContact({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.phone,
    required this.relationshipTypeId,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String phone;
  final String relationshipTypeId;

  factory _EmergencyContact.fromJson(Map<String, dynamic> json) => _EmergencyContact(
        id: json['id'] as String,
        firstName: json['first_name'] as String,
        lastName: json['last_name'] as String,
        phone: json['phone'] as String,
        relationshipTypeId: json['relationship_type_id'] as String,
      );
}

const _maxEmergencyContacts = 3;

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _docNumberController = TextEditingController();
  DateTime? _birthDate;
  String? _genderId;
  String? _docTypeId;
  String? _countryId;
  /// Pedido explícito del usuario: poder cambiar el idioma en el que
  /// habla el asistente de IA (Clásico y Estructurado) sin tener que
  /// crear una cuenta nueva — mismo campo que ya se pregunta al
  /// registrarse (core.persons.preferred_lang).
  String _preferredLang = 'es';
  bool _loading = true;
  bool _saving = false;
  String? _message;
  String? _loadError;
  bool _phoneVerified = false;
  bool _emailVerified = false;
  String _loadedEmail = '';

  Uint8List? _photoBytes;
  bool _uploadingPhoto = false;

  List<CatalogValue> _docTypes = [];
  List<CatalogValue> _countries = [];
  List<CatalogValue> _genders = [];
  List<CatalogValue> _relationshipTypes = [];
  List<_EmergencyContact> _contacts = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final results = await Future.wait([
        ApiClient.instance.dio.get('/me/profile'),
        CatalogService.get('DOCUMENT_TYPE'),
        CatalogService.get('COUNTRY'),
        CatalogService.get('RELATIONSHIP_TYPE'),
        CatalogService.get('GENDER'),
        ApiClient.instance.dio.get('/me/emergency-contacts'),
        ApiClient.instance.dio.get('/me/document'),
      ]).timeout(const Duration(seconds: 15));
      final profile = (results[0] as dynamic).data as Map<String, dynamic>;
      final contactsData = (results[5] as dynamic).data as List;
      final document = (results[6] as dynamic).data as Map<String, dynamic>?;
      setState(() {
        _firstNameController.text = profile['first_name'] as String? ?? '';
        _lastNameController.text = profile['last_name'] as String? ?? '';
        _phoneController.text = profile['phone'] as String? ?? '';
        _phoneVerified = profile['phone_verified'] as bool? ?? false;
        _loadedEmail = profile['email'] as String? ?? '';
        _emailController.text = _loadedEmail;
        _emailVerified = profile['email_verified'] as bool? ?? false;
        _birthDate = profile['birth_date'] != null ? DateTime.tryParse(profile['birth_date'] as String) : null;
        _genderId = profile['gender_id'] as String?;
        _countryId = profile['country_residence_id'] as String?;
        _preferredLang = profile['preferred_lang'] as String? ?? 'es';
        _docTypes = results[1] as List<CatalogValue>;
        _countries = results[2] as List<CatalogValue>;
        _relationshipTypes = results[3] as List<CatalogValue>;
        _genders = results[4] as List<CatalogValue>;
        _contacts = contactsData.map((e) => _EmergencyContact.fromJson(e as Map<String, dynamic>)).toList();
        if (document != null) {
          _docTypeId = document['docTypeId'] as String?;
          _docNumberController.text = document['docNumber'] as String? ?? '';
          _countryId = document['docCountryId'] as String? ?? _countryId;
        }
        _loading = false;
      });
      if (profile['photo_path'] != null) {
        _loadPhoto();
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = 'No se pudo cargar el perfil. Revisá tu conexión e intentá de nuevo.';
      });
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

  Future<void> _pickPhoto(ImageSource source) async {
    final picked = await ImagePicker().pickImage(source: source, maxWidth: 1600, imageQuality: 90);
    if (picked == null) return;

    // Recorte circular para poder centrar/acercar la foto antes de subirla
    // — sin esto, la imagen se subía tal cual salía de la cámara/galería.
    final cropped = await ImageCropper().cropImage(
      sourcePath: picked.path,
      aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
      compressFormat: ImageCompressFormat.jpg,
      compressQuality: 90,
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: 'Ajustar foto',
          cropStyle: CropStyle.circle,
          lockAspectRatio: true,
          hideBottomControls: false,
        ),
        IOSUiSettings(
          title: 'Ajustar foto',
          cropStyle: CropStyle.circle,
          aspectRatioLockEnabled: true,
        ),
      ],
    );
    if (cropped == null) return;

    setState(() => _uploadingPhoto = true);
    try {
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(cropped.path, filename: picked.name),
      });
      await ApiClient.instance.dio.post('/me/profile/photo', data: formData);
      await _loadPhoto();
      setState(() => _message = 'Foto de perfil actualizada.');
    } catch (_) {
      setState(() => _message = 'No se pudo subir la foto.');
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  void _showPhotoSourceSheet() {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Sacar foto'),
              onTap: () {
                Navigator.pop(ctx);
                _pickPhoto(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Elegir de la galería'),
              onTap: () {
                Navigator.pop(ctx);
                _pickPhoto(ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }

  /// Pedido explícito del usuario: "cuando se carga el mail y se va a
  /// confirmar desde la app, deberia antes mostrar a que mail se va a
  /// enviar" — si cambió, confirma el destino ANTES de guardar (evita
  /// mandar el código de verificación a una dirección tipeada mal sin
  /// que el viajero se dé cuenta).
  Future<bool> _confirmEmailChange(String newEmail) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmar email'),
        content: Text(
          '¿Tu email es "$newEmail"? Te vamos a mandar un código a esa dirección para verificarlo.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Revisar de nuevo')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sí, confirmar')),
        ],
      ),
    );
    return confirmed ?? false;
  }

  Future<void> _saveProfile() async {
    final newEmail = _emailController.text.trim();
    final emailChanged = newEmail.isNotEmpty && newEmail.toLowerCase() != _loadedEmail.toLowerCase();
    if (emailChanged) {
      final confirmed = await _confirmEmailChange(newEmail);
      if (!confirmed) return;
    }

    setState(() => _saving = true);
    try {
      await ApiClient.instance.dio.put('/me/profile', data: {
        'firstName': _firstNameController.text.trim(),
        'lastName': _lastNameController.text.trim(),
        if (_birthDate != null) 'birthDate': _birthDate!.toIso8601String().split('T').first,
        if (_genderId != null) 'genderId': _genderId,
        if (_phoneController.text.trim().isNotEmpty) 'phone': _phoneController.text.trim(),
        if (newEmail.isNotEmpty) 'email': newEmail,
        'preferredLang': _preferredLang,
      });
      setState(() {
        _message = emailChanged
            ? 'Perfil actualizado. Te mandamos un código nuevo a $newEmail para verificarlo.'
            : 'Perfil actualizado.';
      });
      await _load();
      if (emailChanged && mounted) {
        await context.read<AuthState>().refreshEmailVerified();
      }
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

  Future<void> _addContactDialog() async {
    final firstNameCtrl = TextEditingController();
    final lastNameCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    String? relationshipTypeId;
    String? error;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Agregar contacto de emergencia'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(error!, style: const TextStyle(color: Colors.red)),
                  ),
                TextField(controller: firstNameCtrl, decoration: const InputDecoration(labelText: 'Nombre')),
                const SizedBox(height: 8),
                TextField(controller: lastNameCtrl, decoration: const InputDecoration(labelText: 'Apellido')),
                const SizedBox(height: 8),
                TextField(
                  controller: phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Teléfono'),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: relationshipTypeId,
                  decoration: const InputDecoration(labelText: 'Parentesco'),
                  items: _relationshipTypes
                      .map((r) => DropdownMenuItem(value: r.id, child: Text(r.labelEs)))
                      .toList(),
                  onChanged: (v) => setDialogState(() => relationshipTypeId = v),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                if (firstNameCtrl.text.trim().isEmpty ||
                    lastNameCtrl.text.trim().isEmpty ||
                    phoneCtrl.text.trim().isEmpty ||
                    relationshipTypeId == null) {
                  setDialogState(() => error = 'Completá todos los campos.');
                  return;
                }
                try {
                  await ApiClient.instance.dio.post('/me/emergency-contacts', data: {
                    'firstName': firstNameCtrl.text.trim(),
                    'lastName': lastNameCtrl.text.trim(),
                    'phone': phoneCtrl.text.trim(),
                    'relationshipTypeId': relationshipTypeId,
                  });
                  if (ctx.mounted) Navigator.pop(ctx);
                  await _load();
                } catch (_) {
                  setDialogState(() => error = 'No se pudo guardar el contacto.');
                }
              },
              child: const Text('Guardar'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _removeContact(String id) async {
    try {
      await ApiClient.instance.dio.patch('/me/emergency-contacts/$id', data: {'active': false});
      await _load();
    } catch (_) {
      setState(() => _message = 'No se pudo eliminar el contacto.');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(appBar: AppBar(title: const Text('Mi perfil')), body: const Center(child: CircularProgressIndicator()));
    }
    if (_loadError != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Mi perfil')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_loadError!, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton(onPressed: _load, child: const Text('Reintentar')),
              ],
            ),
          ),
        ),
      );
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
          Center(
            child: Stack(
              children: [
                CircleAvatar(
                  radius: 48,
                  backgroundImage: _photoBytes != null ? MemoryImage(_photoBytes!) : null,
                  child: _photoBytes == null ? const Icon(Icons.person, size: 48) : null,
                ),
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: InkWell(
                    onTap: _uploadingPhoto ? null : _showPhotoSourceSheet,
                    child: CircleAvatar(
                      radius: 16,
                      backgroundColor: Theme.of(context).colorScheme.primary,
                      child: _uploadingPhoto
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.camera_alt, size: 16, color: Colors.white),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text('Datos personales', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TextField(controller: _firstNameController, decoration: const InputDecoration(labelText: 'Nombre')),
          const SizedBox(height: 12),
          TextField(controller: _lastNameController, decoration: const InputDecoration(labelText: 'Apellido')),
          const SizedBox(height: 12),
          TextField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(
              labelText: 'Email',
              helperText: _emailController.text.isEmpty
                  ? null
                  : (_emailVerified ? 'Verificado' : 'No verificado — revisá tu casilla o guardá de nuevo si está mal escrito'),
              helperMaxLines: 2,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(
              labelText: 'Teléfono',
              helperText: _phoneController.text.isEmpty
                  ? null
                  : (_phoneVerified ? 'Verificado' : 'No verificado'),
            ),
          ),
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
          DropdownButtonFormField<String>(
            initialValue: _genderId,
            decoration: const InputDecoration(labelText: 'Sexo'),
            items: _genders.map((g) => DropdownMenuItem(value: g.id, child: Text(g.labelEs))).toList(),
            onChanged: (v) => setState(() => _genderId = v),
          ),
          const SizedBox(height: 16),
          const Text('Idioma del asistente / Assistant language'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: const [
              ('es', 'Español'), ('en', 'English'), ('pt', 'Português'), ('fr', 'Français'),
            ].map((opt) {
              return ChoiceChip(
                label: Text(opt.$2),
                selected: _preferredLang == opt.$1,
                onSelected: (_) => setState(() => _preferredLang = opt.$1),
              );
            }).toList(),
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
          const Divider(height: 32),
          Text('Contactos de emergencia', style: Theme.of(context).textTheme.titleMedium),
          const Text(
            'Hasta 3 personas que el médico puede ver si compartís tu ficha por QR/link.',
            style: TextStyle(fontSize: 12, color: Colors.grey),
          ),
          const SizedBox(height: 8),
          ..._contacts.map((c) => Card(
                child: ListTile(
                  title: Text('${c.firstName} ${c.lastName}'),
                  subtitle: Text('${CatalogService.labelFor(_relationshipTypes, c.relationshipTypeId)} · ${c.phone}'),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => _removeContact(c.id),
                  ),
                ),
              )),
          if (_contacts.length < _maxEmergencyContacts)
            OutlinedButton.icon(
              onPressed: _addContactDialog,
              icon: const Icon(Icons.add),
              label: const Text('Agregar contacto'),
            ),
        ],
      ),
    );
  }
}
