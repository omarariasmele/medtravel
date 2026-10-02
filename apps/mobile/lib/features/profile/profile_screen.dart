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
import '../../l10n/app_strings.dart';

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
  // Bug real reportado en vivo (raíz de "saco/elijo una foto y no pasa
  // nada", pero afecta a cualquier setState() después de un await en
  // esta pantalla): context.tr() usa context.watch<AuthState>() por
  // dentro, que Provider solo permite llamar DURANTE build() — llamado
  // después de un await (en un catch, o para armar un mensaje de
  // resultado) tira una excepción SIN CAPTURAR ("Tried to listen to a
  // value exposed with provider, from outside of the widget tree"),
  // confirmada con logcat en vivo en _pickPhoto: la función se cortaba
  // ahí mismo, antes de siquiera abrir la pantalla de recorte — nunca
  // fallaba con un error visible, simplemente no seguía. Mismo patrón
  // ya resuelto antes en health_assistant_screen.dart (ver _trSafe ahí)
  // con context.read() en vez de context.watch() — read() no se
  // suscribe a cambios, así que es seguro llamarlo fuera de build().
  String _trSafe(String key, {Map<String, String>? params}) {
    final lang = mounted ? context.read<AuthState>().preferredLang : 'es';
    return AppStrings.forLang(lang, key, params: params);
  }

  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _docNumberController = TextEditingController();
  DateTime? _birthDate;
  String? _genderId;
  /// Pedido explícito del usuario: "Grupo Sanguíneo... siempre es el
  /// mismo... debe permitir su modificación por si hay un error" — a
  /// diferencia de peso/altura (mediciones repetibles, ver
  /// health_records_screen.dart), el grupo sanguíneo es un dato fijo de
  /// la persona, editable acá igual que el sexo (core.persons.blood_type_id).
  String? _bloodTypeId;
  String? _docTypeId;
  String? _countryId;
  /// Pedido explícito del usuario: poder cambiar el idioma en el que
  /// habla el asistente de IA (Clásico y Estructurado) sin tener que
  /// crear una cuenta nueva — mismo campo que ya se pregunta al
  /// registrarse (core.persons.preferred_lang).
  String _preferredLang = 'es';
  static const Map<String, String> _languageLabels = {
    'es': 'Español', 'en': 'English', 'pt': 'Português', 'fr': 'Français',
  };
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
  List<CatalogValue> _bloodTypes = [];
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
        CatalogService.get('BLOOD_TYPE'),
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
        _bloodTypeId = profile['blood_type_id'] as String?;
        _countryId = profile['country_residence_id'] as String?;
        // Bug real reportado en vivo: "sigue sin mostrar cuál se
        // seleccionó" — preferred_lang es CHAR(5) en la base, que
        // Postgres devuelve relleno con espacios ("es   "), así que
        // sin el trim() esto nunca coincidía ni con _languageLabels ni
        // con el ChoiceChip seleccionado — ningún chip se marcaba
        // nunca, sin importar qué tan grande se hiciera el texto.
        _preferredLang = (profile['preferred_lang'] as String?)?.trim() ?? 'es';
        _docTypes = results[1] as List<CatalogValue>;
        _countries = results[2] as List<CatalogValue>;
        _relationshipTypes = results[3] as List<CatalogValue>;
        _genders = results[4] as List<CatalogValue>;
        _bloodTypes = results[7] as List<CatalogValue>;
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
        _loadError = _trSafe('profile.loadError');
      });
    }
  }

  // Bug real reportado en vivo: "saco la foto, procesa, pero no la carga
  // en la app" — confirmado con logs del backend Y del disco que la
  // subida en sí SIEMPRE llegó bien (archivo guardado, columna
  // photo_path actualizada, GET de vuelta devolviendo los bytes
  // correctos) — el problema es este refetch de después, que fallaba
  // en silencio (catch vacío, a propósito para el caso normal de "el
  // viajero todavía no tiene foto cargada", pero eso mismo tapaba
  // cualquier falla real justo después de subir una nueva). `silent`
  // separa los dos casos: en la carga inicial de la pantalla (puede
  // legítimamente no haber foto todavía) se sigue sin avisar nada; recién
  // subida una foto SÍ tiene que estar, así que ahí una falla se muestra.
  Future<void> _loadPhoto({bool silent = true}) async {
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
      if (!silent && mounted) setState(() => _message = _trSafe('profile.photoUploadError'));
    }
  }

  // Bug real reportado en vivo: "saco la foto (o la elijo de la galería)
  // pero no pasa nada" — ni pickImage() ni cropImage() estaban dentro de
  // un try/catch acá; si el plugin tira una excepción (típicamente
  // PlatformException por permiso de cámara/galería denegado, o una
  // falla nativa del recorte) quedaba SIN CAPTURAR — Flutter la
  // registraba en la consola nomás, invisible para el viajero, que veía
  // exactamente "no pasa nada" en pantalla. Ahora cualquier falla real
  // (no una cancelación voluntaria — eso sigue en silencio, es
  // comportamiento esperado) muestra un mensaje.
  Future<void> _pickPhoto(ImageSource source) async {
    XFile? picked;
    try {
      picked = await ImagePicker().pickImage(source: source, maxWidth: 1600, imageQuality: 90);
    } catch (_) {
      if (mounted) setState(() => _message = _trSafe('profile.photoPermissionError'));
      return;
    }
    if (picked == null) return;

    // Recorte circular para poder centrar/acercar la foto antes de subirla
    // — sin esto, la imagen se subía tal cual salía de la cámara/galería.
    if (!mounted) return;
    final adjustPhotoLabel = _trSafe('profile.adjustPhoto');
    CroppedFile? cropped;
    try {
      cropped = await ImageCropper().cropImage(
        sourcePath: picked.path,
        aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
        compressFormat: ImageCompressFormat.jpg,
        compressQuality: 90,
        uiSettings: [
          AndroidUiSettings(
            toolbarTitle: adjustPhotoLabel,
            cropStyle: CropStyle.circle,
            lockAspectRatio: true,
            hideBottomControls: false,
          ),
          IOSUiSettings(
            title: adjustPhotoLabel,
            cropStyle: CropStyle.circle,
            aspectRatioLockEnabled: true,
          ),
        ],
      );
    } catch (_) {
      if (mounted) setState(() => _message = _trSafe('profile.photoUploadError'));
      return;
    }
    if (cropped == null) return;
    if (!mounted) return;

    setState(() => _uploadingPhoto = true);
    try {
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(cropped.path, filename: picked.name),
      });
      await ApiClient.instance.dio.post('/me/profile/photo', data: formData);
      await _loadPhoto();
      if (mounted) setState(() => _message = _trSafe('profile.photoUpdated'));
    } catch (_) {
      if (mounted) setState(() => _message = _trSafe('profile.photoUploadError'));
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
              title: Text(context.tr('profile.takePhoto')),
              onTap: () {
                Navigator.pop(ctx);
                _pickPhoto(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(context.tr('profile.chooseFromGallery')),
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
        title: Text(context.tr('profile.confirmEmailTitle')),
        content: Text(context.tr('profile.confirmEmailBody', params: {'email': newEmail})),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(context.tr('profile.reviewAgain'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(context.tr('profile.yesConfirm'))),
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
            ? _trSafe('profile.updatedWithEmailCode', params: {'email': newEmail})
            : _trSafe('profile.updated');
      });
      await _load();
      // Bug real reportado en vivo: cambiar el idioma acá y guardar
      // dejaba el resto de la app (AppBar, botones, todo lo que pasa
      // por context.tr()) pegado en el idioma VIEJO — antes este
      // refresh de AuthState.preferredLang (la fuente real que usa
      // AppStrings) solo se disparaba si además cambiaba el email. El
      // asistente de voz sí mostraba el idioma nuevo correcto porque lo
      // lee fresco de la base en cada conversación — la app en sí
      // necesitaba este mismo refresh para no quedar desincronizada.
      if (mounted) {
        await context.read<AuthState>().refreshEmailVerified();
      }
    } catch (_) {
      if (mounted) setState(() => _message = _trSafe('profile.saveError'));
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
      if (mounted) {
        setState(() {
          _message = matched > 0
              ? _trSafe('profile.documentSavedWithMatches', params: {'count': '$matched'})
              : _trSafe('profile.documentSaved');
        });
      }
    } catch (_) {
      if (mounted) setState(() => _message = _trSafe('profile.documentSaveError'));
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
    // Bug real reportado en vivo: "no me deja cargar el contacto" con
    // nombre/apellido/teléfono ya completos — el campo "Relación" (4to
    // campo obligatorio, un dropdown al final del diálogo) queda casi
    // invisible cuando el teclado tapa la parte de abajo, y el aviso
    // genérico "Completá todos los campos" no decía CUÁL faltaba. Ahora
    // cada campo marca su propio error en rojo (imposible de no ver,
    // no depende de hacer scroll) en vez de un solo cartel arriba.
    bool showErrors = false;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(context.tr('profile.addEmergencyContactTitle')),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(error!, style: const TextStyle(color: Colors.red)),
                  ),
                TextField(
                  controller: firstNameCtrl,
                  decoration: InputDecoration(
                    labelText: context.tr('profile.firstName'),
                    errorText: showErrors && firstNameCtrl.text.trim().isEmpty ? _trSafe('profile.requiredField') : null,
                  ),
                  onChanged: (_) => setDialogState(() {}),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: lastNameCtrl,
                  decoration: InputDecoration(
                    labelText: context.tr('profile.lastName'),
                    errorText: showErrors && lastNameCtrl.text.trim().isEmpty ? _trSafe('profile.requiredField') : null,
                  ),
                  onChanged: (_) => setDialogState(() {}),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: InputDecoration(
                    labelText: context.tr('profile.phone'),
                    errorText: showErrors && phoneCtrl.text.trim().isEmpty ? _trSafe('profile.requiredField') : null,
                  ),
                  onChanged: (_) => setDialogState(() {}),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: relationshipTypeId,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: context.tr('profile.relationship'),
                    errorText: showErrors && relationshipTypeId == null ? _trSafe('profile.requiredField') : null,
                  ),
                  items: _relationshipTypes
                      .map((r) => DropdownMenuItem(value: r.id, child: Text(r.label(context.lang), overflow: TextOverflow.ellipsis)))
                      .toList(),
                  onChanged: (v) => setDialogState(() => relationshipTypeId = v),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: Text(context.tr('profile.cancel'))),
            FilledButton(
              onPressed: () async {
                if (firstNameCtrl.text.trim().isEmpty ||
                    lastNameCtrl.text.trim().isEmpty ||
                    phoneCtrl.text.trim().isEmpty ||
                    relationshipTypeId == null) {
                  setDialogState(() => showErrors = true);
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
                  setDialogState(() => error = _trSafe('profile.contactSaveError'));
                }
              },
              child: Text(context.tr('profile.save')),
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
      if (mounted) setState(() => _message = _trSafe('profile.contactDeleteError'));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(appBar: AppBar(title: Text(context.tr('profile.title'))), body: const Center(child: CircularProgressIndicator()));
    }
    if (_loadError != null) {
      return Scaffold(
        appBar: AppBar(title: Text(context.tr('profile.title'))),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_loadError!, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton(onPressed: _load, child: Text(context.tr('profile.retry'))),
              ],
            ),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('profile.title'))),
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
          Text(context.tr('profile.personalData'), style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TextField(controller: _firstNameController, decoration: InputDecoration(labelText: context.tr('profile.firstName'))),
          const SizedBox(height: 12),
          TextField(controller: _lastNameController, decoration: InputDecoration(labelText: context.tr('profile.lastName'))),
          const SizedBox(height: 12),
          TextField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(
              labelText: context.tr('profile.email'),
              helperText: _emailController.text.isEmpty
                  ? null
                  : (_emailVerified ? context.tr('profile.verified') : context.tr('profile.notVerifiedEmail')),
              helperMaxLines: 2,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(
              labelText: context.tr('profile.phone'),
              helperText: _phoneController.text.isEmpty
                  ? null
                  : (_phoneVerified ? context.tr('profile.verified') : context.tr('profile.notVerifiedPhone')),
            ),
          ),
          const SizedBox(height: 12),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(_birthDate != null
                ? context.tr('profile.birthDatePrefix', params: {'date': _birthDate!.toIso8601String().split('T').first})
                : context.tr('profile.birthDateLabel')),
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
          // Bug real reportado en vivo: "sexo... sigue sin mostrar cuál
          // se seleccionó" — mismo tratamiento que se le dio al idioma
          // más abajo (texto explícito, no solo confiar en el
          // dropdown), más una key atada al valor cargado: sin esto,
          // DropdownButtonFormField.initialValue es un valor de
          // arranque nomás — si el elemento no se recrea, un cambio de
          // _genderId por código (ej. otra carga de perfil) no se
          // refleja visualmente aunque el estado interno sí cambió.
          DropdownButtonFormField<String>(
            key: ValueKey('gender-$_genderId'),
            initialValue: _genderId,
            isExpanded: true,
            decoration: InputDecoration(labelText: context.tr('profile.gender')),
            items: _genders.map((g) => DropdownMenuItem(value: g.id, child: Text(g.label(context.lang), overflow: TextOverflow.ellipsis))).toList(),
            onChanged: (v) => setState(() => _genderId = v),
          ),
          Builder(builder: (context) {
            final matches = _genders.where((g) => g.id == _genderId);
            final selectedGender = matches.isEmpty ? null : matches.first;
            if (selectedGender == null) return const SizedBox.shrink();
            return Padding(
              padding: const EdgeInsets.only(top: 4, left: 4),
              child: Text(
                context.tr('profile.currentPrefix', params: {'value': selectedGender.label(context.lang)}),
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
            );
          }),
          const SizedBox(height: 12),
          // Pedido explícito del usuario: el grupo sanguíneo dejó de
          // editarse desde Perfil — pasó a cargarse únicamente desde
          // el asistente de salud (Clásico/Estructurado/Formulario,
          // todos ya lo piden como parte de "Datos básicos"). Editarlo
          // acá lo dejaba seteado antes de pasar nunca por esas
          // pantallas, y el asistente lo cuenta como antecedente real
          // — un viajero recién registrado podía terminar marcado como
          // "ya tiene ficha cargada" sin haber cargado nada (bug real
          // reportado en vivo). Queda solo de lectura acá para no
          // perder la visibilidad de qué hay cargado.
          Builder(builder: (context) {
            final matches = _bloodTypes.where((b) => b.id == _bloodTypeId);
            final selectedBloodType = matches.isEmpty ? null : matches.first;
            // Bug real reportado en vivo: overflow cuando no hay grupo
            // sanguíneo cargado — el texto de "sin cargar" es una
            // oración larga, y este Row no tenía ningún Text envuelto
            // en Expanded/Flexible para poder ajustarse (un código
            // corto como "O+" nunca lo mostraba).
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(context.tr('profile.bloodType'), style: const TextStyle(fontSize: 13, color: Colors.grey)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    selectedBloodType?.label(context.lang) ?? context.tr('profile.bloodTypeNotSet'),
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            );
          }),
          const SizedBox(height: 16),
          Text(context.tr('profile.assistantLanguage')),
          const SizedBox(height: 4),
          // Bug real reportado en vivo: "no me indica qué selección de
          // idioma tiene el usuario por defecto" (repetido: seguía sin
          // notarse) — el texto anterior era gris chico (12px) y pasaba
          // desapercibido. Ahora en negrita, tamaño normal, mismo
          // tratamiento que se le dio a "Sexo" arriba.
          Text(
            context.tr('profile.currentPrefix', params: {'value': _languageLabels[_preferredLang] ?? _preferredLang}),
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: _languageLabels.entries.map((opt) {
              final selected = _preferredLang == opt.key;
              return ChoiceChip(
                label: Text(opt.value),
                avatar: selected ? const Icon(Icons.check, size: 18) : null,
                selected: selected,
                onSelected: (_) => setState(() => _preferredLang = opt.key),
              );
            }).toList(),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _saving ? null : _saveProfile,
            child: Text(context.tr('profile.saveProfile')),
          ),
          const Divider(height: 32),
          Text(context.tr('profile.identityDocument'), style: Theme.of(context).textTheme.titleMedium),
          Text(
            context.tr('profile.documentHelper'),
            style: const TextStyle(fontSize: 12, color: Colors.grey),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _docTypeId,
            isExpanded: true,
            decoration: InputDecoration(labelText: context.tr('profile.documentType')),
            items: _docTypes.map((d) => DropdownMenuItem(value: d.id, child: Text(d.label(context.lang), overflow: TextOverflow.ellipsis))).toList(),
            onChanged: (v) => setState(() => _docTypeId = v),
          ),
          const SizedBox(height: 12),
          TextField(controller: _docNumberController, decoration: InputDecoration(labelText: context.tr('profile.documentNumber'))),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _countryId,
            isExpanded: true,
            decoration: InputDecoration(labelText: context.tr('profile.issuingCountry')),
            items: _countries.map((c) => DropdownMenuItem(value: c.id, child: Text(c.label(context.lang), overflow: TextOverflow.ellipsis))).toList(),
            onChanged: (v) => setState(() => _countryId = v),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: _saving ? null : _addDocument,
            child: Text(context.tr('profile.saveDocument')),
          ),
          const Divider(height: 32),
          Text(context.tr('profile.emergencyContacts'), style: Theme.of(context).textTheme.titleMedium),
          Text(
            context.tr('profile.emergencyContactsHelper'),
            style: const TextStyle(fontSize: 12, color: Colors.grey),
          ),
          const SizedBox(height: 8),
          ..._contacts.map((c) => Card(
                child: ListTile(
                  title: Text('${c.firstName} ${c.lastName}'),
                  subtitle: Text('${CatalogService.labelFor(_relationshipTypes, c.relationshipTypeId, lang: context.lang)} · ${c.phone}'),
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
              label: Text(context.tr('profile.addContact')),
            ),
        ],
      ),
    );
  }
}
