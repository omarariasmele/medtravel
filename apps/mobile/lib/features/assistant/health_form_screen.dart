import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/catalog_service.dart';
import '../../core/error_message.dart';
import '../../l10n/app_strings.dart';

class _ParsedDose {
  _ParsedDose(this.amount, this.unitCode);
  final double amount;
  final String unitCode;
}

/// Pedido explícito del usuario: "nada en el sistema debería ser fijo
/// sino todo depender de tablas dinámicas" — a diferencia de una
/// primera versión que tenía los 24 antecedentes hardcodeados acá, esta
/// pantalla ahora los lee en tiempo real de GET
/// /me/health-assistant/interview-questions (ai.interview_questions,
/// la misma tabla que ya gobierna al modelo Estructurado desde
/// admin-web) — agregar/sacar una pregunta o cambiar sus opciones (ej.
/// los tipos de diabetes) aparece solo acá, sin tocar código ni
/// recompilar la app.
///
/// `existingId`/`resource` (id real en la tabla clínica + nombre de esa
/// tabla para el PATCH genérico /clinical/:resource/:id, mismo
/// endpoint que ya usa health_records_screen.dart): pedido explícito
/// del usuario — "si algo se destilda o se anula, el sistema debe
/// corregir la información registrada" — nulo si la fila es nueva.
///
/// `selectedOption` es para CUALQUIER pregunta con opciones fijas (no
/// solo diabetes) — generalizado, ver _conditionTile.
class _ConditionRowState {
  bool checked = false;
  final dateController = TextEditingController();
  final detailController = TextEditingController();
  String? selectedOption;
  String? existingId;

  /// Bug real reportado en vivo: "confirma que guarda 13 datos y no
  /// cambié nada" — el resumen contaba TODAS las filas tildadas,
  /// incluidas las que ya venían así de antes y nunca se tocaron. Se
  /// guarda una foto de cómo llegó la fila al precargarla (ver
  /// snapshot(), llamado al final de _loadExisting) para poder
  /// distinguir "esto es nuevo o se editó" de "esto ya estaba así".
  String? _originalDate;
  String? _originalDetail;
  String? _originalOption;

  void snapshot() {
    _originalDate = dateController.text;
    _originalDetail = detailController.text;
    _originalOption = selectedOption;
  }

  bool get isNewOrChanged {
    if (!checked) return false;
    if (existingId == null) return true;
    return dateController.text != (_originalDate ?? '') ||
        detailController.text != (_originalDetail ?? '') ||
        selectedOption != _originalOption;
  }

  void dispose() {
    dateController.dispose();
    detailController.dispose();
  }
}

class _AllergyRow {
  final nameController = TextEditingController();
  String type = 'OTHER';
  String severity = 'MODERATE';
  String? existingId;
  String _originalName = '';
  String _originalType = '';
  String _originalSeverity = '';
  void snapshot() {
    _originalName = nameController.text;
    _originalType = type;
    _originalSeverity = severity;
  }

  bool get isNewOrChanged =>
      existingId == null ||
      nameController.text != _originalName ||
      type != _originalType ||
      severity != _originalSeverity;

  /// Mismo problema que nameUnchanged en _MedicationRow, pero para
  /// alergias: clinical.prevent_duplicate_allergy rechaza en silencio un
  /// alta con el mismo allergenName ya cargado — pasa si el viajero solo
  /// edita tipo/gravedad de una alergia existente sin tocar el nombre.
  /// Ver _syncAllergyEdits: esas ediciones se corrigen con un PATCH
  /// directo, no por el flujo de propuestas.
  bool get nameUnchanged => existingId != null && nameController.text.trim() == _originalName.trim();

  void dispose() => nameController.dispose();
}

class _NameDateRow {
  final nameController = TextEditingController();
  final dateController = TextEditingController();
  String? existingId;
  String _originalName = '';
  String _originalDate = '';
  void snapshot() {
    _originalName = nameController.text;
    _originalDate = dateController.text;
  }

  bool get isNewOrChanged =>
      existingId == null || nameController.text != _originalName || dateController.text != _originalDate;
  void dispose() {
    nameController.dispose();
    dateController.dispose();
  }
}

class _MedicationRow {
  final nameController = TextEditingController();
  final doseController = TextEditingController();
  final sinceController = TextEditingController();
  String? existingId;
  String _originalName = '';
  String _originalDose = '';
  String _originalSince = '';
  void snapshot() {
    _originalName = nameController.text;
    _originalDose = doseController.text;
    _originalSince = sinceController.text;
  }

  bool get isNewOrChanged =>
      existingId == null ||
      nameController.text != _originalName ||
      doseController.text != _originalDose ||
      sinceController.text != _originalSince;

  /// true si esta fila ya existía Y el nombre del medicamento no cambió
  /// — solo dosis/desde. Importante: clinical.medications tiene un
  /// trigger que rechaza un INSERT con el mismo nombre ya cargado (evita
  /// duplicados accidentales) — bug real reportado en vivo: "actualicé
  /// la dosis... y no se guardó" pasaba porque el Formulario mandaba
  /// esta edición como si fuera un medicamento nuevo, el trigger la
  /// bloqueaba en silencio, y nadie avisaba. Ver _syncMedicationDoseEdits:
  /// estas filas se corrigen con un PATCH directo, no por el flujo de
  /// propuestas (que es solo para altas nuevas).
  bool get nameUnchanged => existingId != null && nameController.text.trim() == _originalName.trim();
  void dispose() {
    nameController.dispose();
    doseController.dispose();
    sinceController.dispose();
  }
}

/// Pedido explícito del usuario: TERCERA forma de cargar la Ficha de
/// Salud — un formulario de una sola pantalla (sin chat, sin turnos):
/// se completa todo y recién al final se valida con IA y se guarda. A
/// diferencia de los otros dos modelos, la IA no conduce nada acá — el
/// viajero ve todos los campos de una, como cualquier formulario.
class HealthFormScreen extends StatefulWidget {
  const HealthFormScreen({super.key});

  @override
  State<HealthFormScreen> createState() => _HealthFormScreenState();
}

class _HealthFormScreenState extends State<HealthFormScreen> {
  // Bug real reportado en vivo (mismo encontrado antes en profile_screen.dart):
  // context.tr() usa context.watch<AuthState>() por dentro, que Provider
  // solo permite llamar DURANTE build() — llamado después de un await
  // (ej. en el catch de un PATCH que falló) tira una excepción SIN
  // CAPTURAR y corta la función ahí mismo, en silencio. context.read()
  // no se suscribe a cambios, así que es seguro fuera de build().
  String _trSafe(String key, {Map<String, String>? params}) {
    final lang = mounted ? context.read<AuthState>().preferredLang : 'es';
    return AppStrings.forLang(lang, key, params: params);
  }

  final _birthDateController = TextEditingController();
  String? _sexCode;
  final _weightController = TextEditingController();
  final _heightController = TextEditingController();
  String? _bloodTypeCode;

  /// Foto de los datos básicos tal como llegaron precargados — mismo
  /// criterio que snapshot()/isNewOrChanged en las filas, para no
  /// contar "peso 88" como un cambio si ya estaba así. Ver _loadExisting.
  String _originalBirthDate = '';
  String? _originalSexCode;
  String _originalWeight = '';
  String _originalHeight = '';
  String? _originalBloodTypeCode;
  bool get _isBasicChanged =>
      _birthDateController.text != _originalBirthDate ||
      _sexCode != _originalSexCode ||
      _weightController.text != _originalWeight ||
      _heightController.text != _originalHeight ||
      _bloodTypeCode != _originalBloodTypeCode;

  /// Preguntas de tipo CONDITION traídas de ai.interview_questions —
  /// ver comentario de _ConditionRowState. Vacía hasta que termina
  /// _loadExisting.
  List<Map<String, dynamic>> _questions = [];
  final Map<String, _ConditionRowState> _conditionRows = {};
  final List<_AllergyRow> _allergies = [];
  final List<_MedicationRow> _medications = [];
  final List<_NameDateRow> _surgeries = [];
  final List<_NameDateRow> _implants = [];
  /// Pedido explícito del usuario: "Fracturas" es la primera pregunta
  /// de _questions genuinamente multi-instancia (varias fracturas
  /// reales, cada una con su propio lugar y fecha) — a diferencia del
  /// resto de _conditionRows (un checkbox = un antecedente), esta usa
  /// el mismo patrón de lista repetible que cirugías/implantes en vez
  /// del campo único de _ConditionRowState. Ver _conditionTile (código
  /// 'BONE_FRACTURE' especial) y clinical.prevent_duplicate_condition_by_question
  /// (proposed-allow-multiple-fractures.sql: sin ese cambio del lado
  /// del backend, la segunda fractura se rechazaba como "duplicada").
  final List<_NameDateRow> _fractures = [];
  bool _fracturesChecked = false;
  Map<String, dynamic>? get _fractureQuestion {
    for (final q in _questions) {
      if (q['code'] == 'BONE_FRACTURE') return q;
    }
    return null;
  }

  /// Pedido explícito del usuario: mostrar arriba cuándo se cargaron
  /// los últimos datos, mismo dato (`health_record_last_updated_at`)
  /// que ya usa el saludo de los modelos Clásico/Estructurado.
  String? _lastUpdatedText;

  bool _submitting = false;
  bool _loadingExisting = true;
  String? _error;

  // Bug real reportado en vivo: "al validar y guardar no lo hace pero
  // no dice qué está mal" — el aviso de error SÍ se estaba armando
  // (confirmado con el log del servidor: un ROLLBACK justo en el
  // momento de la prueba), pero el banner rojo se dibuja arriba de
  // todo en un formulario largo — al tocar "Validar y guardar" (abajo
  // del todo) quedaba fuera de la pantalla, invisible. Pedido explícito
  // del usuario: "tiene que ir arriba para poder visualizarlo, si no
  // se navega hasta arriba del formulario no lo van a ver y van a
  // esperar a ver qué pasa" — en vez de depender de que alguien
  // scrollee, un diálogo modal centrado corta lo que sea que esté
  // mirando y exige que lo lea/cierre antes de seguir. El banner rojo
  // (más abajo en build()) queda además como recordatorio visible
  // mientras completa la corrección, sin tener que volver a abrir nada.
  Future<void> _showFormError(String message) async {
    if (!mounted) return;
    setState(() => _error = message);
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(_trSafe('form.errorDialogTitle')),
        content: Text(message),
        actions: [
          FilledButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(_trSafe('form.errorDialogOk'))),
        ],
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    _loadExisting();
  }

  /// Pedido explícito del usuario: "si ya completé algún dato debería
  /// aparecer" — precarga el formulario con lo que el viajero ya tiene
  /// cargado (datos básicos, alergias, medicamentos, cirugías,
  /// implantes, y las condiciones que se puedan reconocer por palabra
  /// clave) para no hacerle repetir algo que ya contó por otra vía.
  /// Nunca bloquea el formulario si algo falla — cada fetch es
  /// independiente, sin conexión simplemente arranca vacío.
  Future<void> _loadExisting() async {
    final personId = context.read<AuthState>().personId!;
    try {
      final results = await Future.wait([
        ApiClient.instance.dio.get('/me/health-assistant/interview-questions'),
        ApiClient.instance.dio.get('/me/profile'),
        ApiClient.instance.dio.get('/clinical/vitals-history', queryParameters: {'personId': personId}),
        ApiClient.instance.dio.get('/clinical/conditions', queryParameters: {'personId': personId}),
        ApiClient.instance.dio.get('/clinical/allergies', queryParameters: {'personId': personId}),
        ApiClient.instance.dio.get('/clinical/medications', queryParameters: {'personId': personId}),
        ApiClient.instance.dio.get('/clinical/surgeries', queryParameters: {'personId': personId}),
        ApiClient.instance.dio.get('/clinical/implants-devices', queryParameters: {'personId': personId}),
      ]);
      final genderCatalog = await CatalogService.get('GENDER');
      final bloodTypeCatalog = await CatalogService.get('BLOOD_TYPE');
      final allergenTypeCatalog = await CatalogService.get('ALLERGEN_TYPE');
      final severityCatalog = await CatalogService.get('REACTION_SEVERITY');
      if (!mounted) return;

      final allQuestions = (results[0].data as List).cast<Map<String, dynamic>>();
      final profile = results[1].data as Map<String, dynamic>;
      final vitals = results[2].data as List;
      final conditions = results[3].data as List;
      final allergies = results[4].data as List;
      final medications = results[5].data as List;
      final surgeries = results[6].data as List;
      final implants = results[7].data as List;

      String? codeOf(List<CatalogValue> catalog, String? id) {
        if (id == null) return null;
        for (final c in catalog) {
          if (c.id == id) return c.code;
        }
        return null;
      }

      setState(() {
        // Pedido explícito del usuario: diálisis/quimioterapia/etc. son
        // TREATMENT, no CONDITION (ver proposed-treatment-type.sql) —
        // sin este agregado, DIALYSIS directamente desaparecía del
        // Formulario (nunca se mostraba, ni se guardaba). El backend
        // (ai.service.ts::submitHealthForm) ya distingue el tipo real
        // de CADA fila de esta misma lista al armar los proposals.
        _questions = allQuestions.where((q) => q['proposalType'] == 'CONDITION' || q['proposalType'] == 'TREATMENT').toList()
          ..sort((a, b) => (a['displayOrder'] as int).compareTo(b['displayOrder'] as int));
        for (final q in _questions) {
          _conditionRows[q['id'] as String] = _ConditionRowState();
        }

        if (profile['birth_date'] != null) {
          _birthDateController.text = _formatDdMmYyyy(profile['birth_date'] as String);
        }
        _sexCode = codeOf(genderCatalog, profile['gender_id'] as String?);
        // Pedido explícito del usuario: grupo sanguíneo es un dato fijo
        // de la persona (core.persons.blood_type_id), no un signo vital
        // — se lee del perfil, no escaneando el historial de mediciones.
        _bloodTypeCode = codeOf(bloodTypeCatalog, profile['blood_type_id'] as String?);
        final lastUpdatedRaw = profile['health_record_last_updated_at'];
        if (lastUpdatedRaw is String) {
          _lastUpdatedText = _formatDdMmYyyy(lastUpdatedRaw);
        }

        // vitals-history es histórico (una fila por carga) — el valor
        // más reciente NO NULO por campo, mismo criterio que usa la IA
        // (ver getPersonContext en ai.service.ts). Bug real reportado en
        // vivo: el endpoint no garantiza orden cronológico, así que hay
        // que ordenar acá por measuredAt antes de tomar el primero — si
        // no, podía traer un peso viejo en vez del último cargado.
        final sortedVitals = vitals.whereType<Map<String, dynamic>>().toList()
          ..sort((a, b) {
            final rawA = a['measuredAt'];
            final rawB = b['measuredAt'];
            final da = (rawA is String ? DateTime.tryParse(rawA) : null) ?? DateTime(1970);
            final db = (rawB is String ? DateTime.tryParse(rawB) : null) ?? DateTime(1970);
            return db.compareTo(da);
          });
        for (final v in sortedVitals) {
          final row = v;
          if (_weightController.text.isEmpty && row['weightKg'] != null) {
            _weightController.text = row['weightKg'].toString();
          }
          if (_heightController.text.isEmpty && row['heightCm'] != null) {
            _heightController.text = row['heightCm'].toString();
          }
        }

        // Pedido explícito del usuario: "nada debería ser fijo" — nada
        // de diccionario de palabras clave hardcodeado por pregunta acá:
        // matchea genéricamente contra el texto real de cada pregunta
        // (cualquier palabra significativa, ej. "diabetes" de "¿Tiene
        // diabetes?"). Simple a propósito, sin llamar a la IA solo para
        // esto — si no matchea, el viajero la puede tildar a mano igual.
        // Bug real reportado en vivo: con "gota" (ya cargada) el
        // checkbox de "¿Padece de gota?" no se auto-tildaba — antes solo
        // se miraba la PRIMERA palabra significativa de la pregunta con
        // 5 letras o más, y "gota" tiene 4. Ahora se prueban TODAS las
        // palabras significativas (≥4 letras) de la pregunta, no solo la
        // primera, para no perder términos médicos cortos.
        //
        // Bug real reportado en vivo, grave: "enfermedad cardiovascular"
        // mostraba el detalle de EPOC, "enfermedad pulmonar crónica"
        // mostraba insuficiencia renal — confirmado: "enfermedad" y
        // "crónica" son palabras "significativas" (≥4 letras) que
        // aparecen en CASI todas las preguntas Y en casi todos los
        // nombres de condición, así que matcheaban cualquier cosa con
        // cualquier cosa según el orden de iteración, sin relación real.
        // sourceQuestionId (si está cargado — ver proposed-backfill-
        // source-question-id.sql) es un vínculo EXACTO, no una
        // adivinanza por palabras — se usa primero y salta directo a la
        // pregunta correcta; el matcheo por palabras clave queda SOLO
        // de respaldo para antecedentes viejos sin ese vínculo.
        for (final c in conditions) {
          final row = c as Map<String, dynamic>;
          final conditionName = row['conditionName'] as String? ?? '';
          final name = conditionName.toLowerCase();
          final sourceQuestionId = row['sourceQuestionId'] as String?;

          // Vínculo exacto primero: si esta condición ya sabe de qué
          // pregunta salió (sourceQuestionId), no hay que adivinar nada.
          Map<String, dynamic>? matchedQuestion;
          if (sourceQuestionId != null && _conditionRows.containsKey(sourceQuestionId)) {
            for (final q in _questions) {
              if ((q['id'] as String?) == sourceQuestionId) {
                matchedQuestion = q;
                break;
              }
            }
          }

          // Respaldo solo para antecedentes viejos sin sourceQuestionId
          // (cargados antes del backfill, o por Clásico/Estructurado sin
          // pregunta de formulario asociada).
          if (matchedQuestion == null) {
            for (final q in _questions) {
              final questionText = q['questionText'] as String;
              final keywords = _significantWordsOf(questionText);
              if (keywords.any((k) => name.contains(k))) {
                matchedQuestion = q;
                break;
              }
            }
          }

          if (matchedQuestion != null && matchedQuestion['code'] == 'BONE_FRACTURE') {
            // Ver el comentario de _fractures más arriba: varias
            // fracturas ya cargadas antes son varias filas de
            // clinical.conditions con el MISMO sourceQuestionId — cada
            // una es su propia entrada en la lista, nunca se pisan.
            _fracturesChecked = true;
            final entry = _NameDateRow();
            entry.existingId = row['id'] as String?;
            entry.nameController.text = conditionName;
            if (row['diagnosedAt'] != null) entry.dateController.text = _formatDdMmYyyy(row['diagnosedAt'] as String);
            entry.snapshot();
            _fractures.add(entry);
            continue;
          }

          if (matchedQuestion != null) {
            final q = matchedQuestion;
            final questionText = q['questionText'] as String;
            final target = _conditionRows[q['id'] as String]!;
            target.checked = true;
            target.existingId = row['id'] as String?;
            final options = (q['options'] as List?)?.cast<String>();
            if (options != null && options.isNotEmpty) {
              // Bug real reportado en vivo: "no me carga el tipo de
              // diabetes que tiene cargado" — el nombre guardado (ej.
              // "Diabetes Tipo 2") nunca se comparaba contra las
              // opciones fijas de la pregunta, así que el desplegable
              // "Tipo" quedaba siempre vacío aunque el dato ya
              // existiera. Ahora se busca la opción que coincide.
              for (final opt in options) {
                final optLower = opt.toLowerCase();
                if (name.contains(optLower) || optLower.contains(name)) {
                  target.selectedOption = opt;
                  break;
                }
              }
              if (target.selectedOption == null) {
                final otraOption = options.firstWhere(
                  (o) => o.toLowerCase() == 'otra' || o.toLowerCase() == 'otro',
                  orElse: () => '',
                );
                if (otraOption.isNotEmpty) {
                  target.selectedOption = otraOption;
                  target.detailController.text = conditionName;
                }
              }
            } else if (!_isJustAnEcho(conditionName, questionText)) {
              // Bug real reportado en vivo: "¿Padece de gota?" (sin
              // ningún detalle real cargado) aparecía en el campo
              // Detalle repitiendo literalmente la pregunta — pasaba
              // porque conditionName a veces guarda el texto de la
              // pregunta tal cual, sin agregar nada nuevo. Si el
              // nombre guardado no aporta ninguna palabra que la
              // pregunta ya no tenga, se deja el campo en blanco.
              target.detailController.text = conditionName;
            }
            if (row['diagnosedAt'] != null) target.dateController.text = _formatDdMmYyyy(row['diagnosedAt'] as String);
            target.snapshot();
          }
        }

        for (final a in allergies) {
          final row = a as Map<String, dynamic>;
          final entry = _AllergyRow();
          entry.existingId = row['id'] as String?;
          entry.nameController.text = row['allergenName'] as String? ?? '';
          entry.type = codeOf(allergenTypeCatalog, row['allergenTypeId'] as String?) ?? 'OTHER';
          entry.severity = codeOf(severityCatalog, row['severityId'] as String?) ?? 'MODERATE';
          entry.snapshot();
          _allergies.add(entry);
        }

        for (final m in medications) {
          final row = m as Map<String, dynamic>;
          final entry = _MedicationRow();
          entry.existingId = row['id'] as String?;
          entry.nameController.text = row['genericName'] as String? ?? '';
          if (row['doseAmount'] != null) entry.doseController.text = '${row['doseAmount']}';
          entry.snapshot();
          _medications.add(entry);
        }

        for (final s in surgeries) {
          final row = s as Map<String, dynamic>;
          final entry = _NameDateRow();
          entry.existingId = row['id'] as String?;
          entry.nameController.text = row['procedureName'] as String? ?? '';
          if (row['performedAt'] != null) entry.dateController.text = _formatDdMmYyyy(row['performedAt'] as String);
          entry.snapshot();
          _surgeries.add(entry);
        }

        for (final im in implants) {
          final row = im as Map<String, dynamic>;
          final entry = _NameDateRow();
          entry.existingId = row['id'] as String?;
          entry.nameController.text = row['deviceName'] as String? ?? '';
          if (row['implantedAt'] != null) entry.dateController.text = _formatDdMmYyyy(row['implantedAt'] as String);
          entry.snapshot();
          _implants.add(entry);
        }

        _originalBirthDate = _birthDateController.text;
        _originalSexCode = _sexCode;
        _originalWeight = _weightController.text;
        _originalHeight = _heightController.text;
        _originalBloodTypeCode = _bloodTypeCode;

        _loadingExisting = false;
      });
    } catch (e, st) {
      // Sin conexión o algo falló — el formulario arranca vacío, no se
      // bloquea la carga por esto. Bug real reportado en vivo: esto
      // fallaba en silencio total (nada en el log) y era imposible saber
      // POR QUÉ el formulario venía vacío — ahora al menos queda rastro
      // en logcat para poder diagnosticarlo la próxima vez.
      debugPrint('[HealthForm] _loadExisting falló: $e\n$st');
      if (mounted) setState(() => _loadingExisting = false);
    }
  }

  /// Palabras "significativas" (no muletillas de pregunta tipo
  /// "tiene"/"sufre"/"alguna") de un texto de pregunta — usadas para
  /// reconocer si un antecedente ya cargado por otra vía corresponde a
  /// esta pregunta. Ver comentario en _loadExisting.
  static const _kStopwords = {
    'tiene', 'tuvo', 'sufre', 'sufrio', 'sufrió', 'padece', 'presenta', 'usa', 'toma',
    'alguna', 'algun', 'algún', 'alguno', 'que', 'del', 'de', 'la', 'el', 'en', 'un', 'una',
    'ha', 'fue', 'le', 'diagnosticaron', 'requiere', 'necesita', 'con', 'ó', 'como', 'este', 'esta',
  };
  List<String> _significantWordsOf(String questionText) {
    final normalized = questionText.toLowerCase().replaceAll(RegExp(r'[¿?¡!,.:]'), '');
    return normalized
        .split(RegExp(r'\s+'))
        .where((w) => w.length >= 4 && !_kStopwords.contains(w))
        .toList();
  }

  /// true si "conditionName" no aporta ninguna palabra significativa que
  /// la pregunta ya no tenga — o sea, es solo un eco de la pregunta
  /// (ej. conditionName "¿Padece de gota?" para la pregunta "¿Padece de
  /// gota?"), no un detalle real que valga la pena mostrar precargado.
  bool _isJustAnEcho(String conditionName, String questionText) {
    final conditionWords = _significantWordsOf(conditionName).toSet();
    if (conditionWords.isEmpty) return true;
    final questionWords = _significantWordsOf(questionText).toSet();
    return conditionWords.difference(questionWords).isEmpty;
  }

  String _formatDdMmYyyy(String isoDate) {
    final date = DateTime.tryParse(isoDate);
    if (date == null) return isoDate;
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  /// Pedido explícito del usuario: "si algo se destilda o se anula, el
  /// sistema debe corregir la información registrada" — misma baja
  /// lógica (PATCH deletedAt) que ya usa health_records_screen.dart en
  /// sus 5 tabs, reutilizada acá para cuando el viajero destilda/borra
  /// una fila que había venido precargada de un dato YA existente.
  /// Devuelve false si el usuario cancela la confirmación (la fila
  /// vuelve a su estado anterior) o si falla el pedido.
  Future<bool> _confirmAndSoftDeleteExisting({
    required String resource,
    required String id,
    required String itemLabel,
  }) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(context.tr('form.removeExistingTitle')),
        content: Text(context.tr('form.removeExistingBody', params: {'item': itemLabel})),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(context.tr('assistant.cancel'))),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(context.tr('form.remove'))),
        ],
      ),
    );
    if (confirmed != true) return false;
    if (!mounted) return false;
    final removeErrorFallback = _trSafe('form.removeError');
    try {
      await ApiClient.instance.dio.patch('/clinical/$resource/$id', data: {
        'deletedAt': DateTime.now().toUtc().toIso8601String(),
      });
      return true;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(dioErrorMessage(e, removeErrorFallback))),
        );
      }
      return false;
    }
  }

  @override
  void dispose() {
    _birthDateController.dispose();
    _weightController.dispose();
    _heightController.dispose();
    for (final r in _conditionRows.values) { r.dispose(); }
    for (final r in _allergies) { r.dispose(); }
    for (final r in _medications) { r.dispose(); }
    for (final r in _surgeries) { r.dispose(); }
    for (final r in _implants) { r.dispose(); }
    for (final r in _fractures) { r.dispose(); }
    super.dispose();
  }

  /// Para una pregunta CON opciones fijas (ej. tipos de diabetes,
  /// cualquier otra que se agregue con opciones desde admin-web), el
  /// "detalle" que se manda al backend es la opción elegida — o lo que
  /// haya escrito si eligió "Otra"/"Otro". Para una pregunta sin
  /// opciones, el detalle es simplemente el texto libre de siempre.
  String? _detailFor(Map<String, dynamic> question) {
    final row = _conditionRows[question['id'] as String]!;
    final options = (question['options'] as List?)?.cast<String>();
    if (options == null || options.isEmpty) return row.detailController.text.trim();
    if (row.selectedOption == null) return null;
    final normalized = row.selectedOption!.trim().toLowerCase();
    if (normalized == 'otra' || normalized == 'otro') {
      final desc = row.detailController.text.trim();
      return desc.isNotEmpty ? desc : null;
    }
    return row.selectedOption;
  }

  /// Pedido explícito del usuario: "confirma que guarda 13 datos y no
  /// cambié nada, no debería salir este mensaje — solo debería indicar
  /// lo que se actualiza o se carga, no lo que ya tenía cargado". Cada
  /// lista se filtra por isNewOrChanged (ver snapshot() en las clases
  /// de fila) — lo que vino precargado y nunca se tocó NO se reenvía.
  Map<String, dynamic> _buildPayload() {
    return {
      'basic': _isBasicChanged ? {
        if (_birthDateController.text.trim().isNotEmpty) 'birthDateRaw': _birthDateController.text.trim(),
        if (_sexCode != null) 'sexCode': _sexCode,
        if (_weightController.text.trim().isNotEmpty) 'weightKg': double.tryParse(_weightController.text.trim()),
        if (_heightController.text.trim().isNotEmpty) 'heightCm': double.tryParse(_heightController.text.trim()),
        if (_bloodTypeCode != null) 'bloodTypeCode': _bloodTypeCode,
      } : <String, dynamic>{},
      'conditions': [
        for (final q in _questions)
          if (q['code'] != 'BONE_FRACTURE' &&
              // Cualquier edición de una fila YA existente (tipo, detalle
              // y/o fecha) se resuelve con PATCH directo (ver
              // _syncConditionEdits) — este flujo de propuestas es solo
              // para antecedentes NUEVOS (existingId == null).
              _conditionRows[q['id'] as String]!.isNewOrChanged && _conditionRows[q['id'] as String]!.existingId == null)
            {
              'questionId': q['id'] as String,
              'label': q['questionText'] as String,
              if (_conditionRows[q['id'] as String]!.dateController.text.trim().isNotEmpty)
                'dateRaw': _conditionRows[q['id'] as String]!.dateController.text.trim(),
              if (_detailFor(q)?.isNotEmpty ?? false) 'detail': _detailFor(q)!,
            },
        // Ver el comentario de _fractures: una entrada por fractura
        // NUEVA, todas con el MISMO questionId (BONE_FRACTURE ya
        // permite varias respuestas activas del mismo lado del backend,
        // ver proposed-allow-multiple-fractures.sql).
        if (_fracturesChecked && _fractureQuestion != null)
          for (final f in _fractures)
            if (f.nameController.text.trim().isNotEmpty && f.isNewOrChanged)
              {
                'questionId': _fractureQuestion!['id'] as String,
                'label': _fractureQuestion!['questionText'] as String,
                if (f.dateController.text.trim().isNotEmpty) 'dateRaw': f.dateController.text.trim(),
                'detail': f.nameController.text.trim(),
              },
      ],
      'allergies': [
        for (final a in _allergies)
          // nameUnchanged: tipo/gravedad editados de una alergia existente
          // sin tocar el nombre — se resuelve con PATCH directo (ver
          // _syncAllergyEdits), no por acá (mismo motivo que nameUnchanged
          // en medicamentos).
          if (a.nameController.text.trim().isNotEmpty && a.isNewOrChanged && !a.nameUnchanged)
            {'name': a.nameController.text.trim(), 'allergenType': a.type, 'severity': a.severity},
      ],
      'medications': [
        for (final m in _medications)
          // Bug real reportado en vivo: "actualicé la dosis... y no se
          // guardó" — un medicamento ya existente con el MISMO nombre
          // mandado por acá se topaba con el trigger anti-duplicados
          // (bloquea un alta nueva con nombre repetido) y quedaba
          // descartado en silencio. Ver nameUnchanged/_syncMedicationDoseEdits:
          // esas ediciones (mismo nombre, solo cambia la dosis) se
          // resuelven con un PATCH directo, no por acá.
          if (m.nameController.text.trim().isNotEmpty && m.isNewOrChanged && !m.nameUnchanged)
            {
              'name': m.nameController.text.trim(),
              if (m.doseController.text.trim().isNotEmpty) 'dose': m.doseController.text.trim(),
              if (m.sinceController.text.trim().isNotEmpty) 'sinceRaw': m.sinceController.text.trim(),
            },
      ],
      'surgeries': [
        for (final s in _surgeries)
          if (s.nameController.text.trim().isNotEmpty && s.isNewOrChanged)
            {
              'name': s.nameController.text.trim(),
              if (s.dateController.text.trim().isNotEmpty) 'dateRaw': s.dateController.text.trim(),
            },
      ],
      'implants': [
        for (final im in _implants)
          if (im.nameController.text.trim().isNotEmpty && im.isNewOrChanged)
            {
              'name': im.nameController.text.trim(),
              if (im.dateController.text.trim().isNotEmpty) 'dateRaw': im.dateController.text.trim(),
            },
      ],
    };
  }

  /// Bug real reportado en vivo: "Redoxón/Reliveran no quedan alineados
  /// como los demás" — mismo criterio que AIService.parseDoseText en el
  /// backend: si el texto matchea "número + unidad conocida" (ej. "100
  /// mg"), se separa en las columnas estructuradas dose_amount/dose_unit
  /// que usa el resto del sistema, en vez de quedar como texto libre en
  /// notes (que se ve distinto — ver MedicationsTab en admin-web).
  _ParsedDose? _parseDoseText(String raw) {
    final match = RegExp(r'^(\d+(?:[.,]\d+)?)\s*(mg|mcg|ml|ui|gotas?|comprimidos?|parche)\b', caseSensitive: false)
        .firstMatch(raw.trim());
    if (match == null) return null;
    final amount = double.tryParse(match.group(1)!.replaceAll(',', '.'));
    if (amount == null) return null;
    const unitByWord = {
      'mg': 'MG', 'mcg': 'MCG', 'ml': 'ML', 'ui': 'UI',
      'gota': 'GOTAS', 'gotas': 'GOTAS',
      'comprimido': 'COMPRIMIDOS', 'comprimidos': 'COMPRIMIDOS',
      'parche': 'PARCHE',
    };
    final unitCode = unitByWord[match.group(2)!.toLowerCase()];
    return unitCode == null ? null : _ParsedDose(amount, unitCode);
  }

  /// Bug real reportado en vivo: "actualicé la dosis de un medicamento
  /// y no se guardó" — el flujo de propuestas es solo para altas
  /// nuevas, y el trigger anti-duplicados de clinical.medications
  /// descarta en silencio un alta con el mismo nombre ya cargado. Para
  /// un medicamento existente cuyo nombre NO cambió, la dosis se
  /// corrige con un PATCH directo (mismo mecanismo que ya usa
  /// _confirmAndSoftDeleteExisting), sin pasar por ese flujo. Devuelve
  /// cuántas filas se actualizaron así.
  Future<int> _syncMedicationDoseEdits() async {
    var count = 0;
    List<CatalogValue>? doseUnitCatalog;
    for (final m in _medications) {
      if (!m.nameUnchanged) continue;
      if (m.doseController.text == m._originalDose) continue;
      final doseText = m.doseController.text.trim();
      final parsed = doseText.isNotEmpty ? _parseDoseText(doseText) : null;
      try {
        if (parsed != null) {
          doseUnitCatalog ??= await CatalogService.get('DOSE_UNIT');
          final unitId = doseUnitCatalog
              .firstWhere((c) => c.code == parsed.unitCode, orElse: () => doseUnitCatalog!.first)
              .id;
          await ApiClient.instance.dio.patch('/clinical/medications/${m.existingId}', data: {
            'doseAmount': parsed.amount,
            'doseUnitId': unitId,
            'notes': null,
          });
        } else {
          await ApiClient.instance.dio.patch('/clinical/medications/${m.existingId}', data: {
            'notes': doseText.isNotEmpty ? 'Dosis: $doseText' : null,
          });
        }
        count++;
      } catch (_) {
        // best-effort — si falla una fila puntual, se sigue con el
        // resto en vez de trabar todo el guardado del formulario.
      }
    }
    return count;
  }

  /// Mismo mecanismo que _syncMedicationDoseEdits, para alergias: tipo/
  /// gravedad editados de una alergia existente sin tocar el nombre se
  /// corrigen con un PATCH directo (ver nameUnchanged en _AllergyRow),
  /// evitando el trigger anti-duplicados de clinical.allergies.
  Future<int> _syncAllergyEdits() async {
    final rowsToSync = _allergies.where((a) => a.nameUnchanged && (a.type != a._originalType || a.severity != a._originalSeverity));
    if (rowsToSync.isEmpty) return 0;
    var count = 0;
    final allergenTypeCatalog = await CatalogService.get('ALLERGEN_TYPE');
    final severityCatalog = await CatalogService.get('REACTION_SEVERITY');
    for (final a in rowsToSync) {
      final typeId = allergenTypeCatalog.firstWhere((c) => c.code == a.type, orElse: () => allergenTypeCatalog.first).id;
      final severityId = severityCatalog.firstWhere((c) => c.code == a.severity, orElse: () => severityCatalog.first).id;
      try {
        await ApiClient.instance.dio.patch('/clinical/allergies/${a.existingId}', data: {
          'allergenTypeId': typeId,
          'severityId': severityId,
        });
        count++;
      } catch (_) {
        // best-effort — si falla una fila puntual, se sigue con el
        // resto en vez de trabar todo el guardado del formulario.
      }
    }
    return count;
  }

  /// Pedido explícito del usuario: "esto que indicás es complicado de
  /// que el usuario lo entienda... debería ser con la simple
  /// modificación del tipo en el formulario" — cambiar el tipo de una
  /// condición ya cargada (ej. Diabetes Tipo 1 -> Tipo 2) tiene que
  /// bastar con tocar el desplegable y guardar. Mandar eso como
  /// antecedente NUEVO chocaría con
  /// trg_prevent_duplicate_condition_by_question (una sola respuesta
  /// activa por pregunta, a propósito) — así que CUALQUIER edición de
  /// una fila ya existente (tipo/detalle y/o fecha) se corrige con un
  /// PATCH directo al endpoint dedicado, que además re-resuelve el
  /// catálogo (para que las alertas médicas etc. reflejen el tipo
  /// nuevo). Ver AIService.updateConditionAnswer.
  // Pedido explícito del usuario: "no tiene que solo aislar los casos
  // con falla de fecha sino que tiene que informar el problema al
  // usuario para que lo corrija" — antes, si el PATCH fallaba (ej.
  // fecha futura o anterior al nacimiento, rechazada por el backend —
  // ver AIService.updateConditionAnswer), el error se descartaba en un
  // catch vacío: el viajero corregía la fecha en pantalla, tocaba
  // guardar, veía "Formulario guardado" y la ficha se quedaba con el
  // dato VIEJO sin ningún aviso de que su corrección nunca entró. Cada
  // fila que falla queda registrada acá (label + motivo real del
  // servidor) para mostrarla en el mensaje final — el resto de las
  // filas se sigue guardando igual (mismo criterio "mejor esto que
  // trabar todo el formulario"), pero ya no en silencio.
  Future<({int count, List<String> failures})> _syncConditionEdits() async {
    var count = 0;
    final failures = <String>[];
    for (final q in _questions) {
      final row = _conditionRows[q['id'] as String]!;
      if (!row.checked || row.existingId == null || !row.isNewOrChanged) continue;
      final conditionName = _detailFor(q)?.trim();
      if (conditionName == null || conditionName.isEmpty) continue;
      final dateText = row.dateController.text.trim();
      try {
        await ApiClient.instance.dio.patch('/me/health-assistant/conditions/${row.existingId}', data: {
          'conditionName': conditionName,
          if (dateText.isNotEmpty) 'dateRaw': dateText,
        });
        count++;
      } catch (e) {
        failures.add('$conditionName: ${dioErrorMessage(e, _trSafe('form.saveError'))}');
      }
    }
    return (count: count, failures: failures);
  }

  Future<void> _submit() async {
    setState(() => _submitting = true);
    final doseEditsCount = await _syncMedicationDoseEdits();
    final allergyEditsCount = await _syncAllergyEdits();
    final conditionEdits = await _syncConditionEdits();
    final directEditsCount = doseEditsCount + allergyEditsCount + conditionEdits.count;
    if (!mounted) return;

    // Pedido explícito del usuario: "no tiene que solo aislar los casos
    // con falla de fecha sino que tiene que informar el problema al
    // usuario para que lo corrija" — si alguna corrección de antecedente
    // ya existente falló (típicamente una fecha inválida rechazada por
    // el servidor), se junta acá para mostrarla SIEMPRE, sin importar
    // qué camino tome el resto del guardado más abajo.
    final failureNotice = conditionEdits.failures.isNotEmpty
        ? '${_trSafe('form.someEditsFailed')} ${conditionEdits.failures.join(' ')}'
        : null;

    final payload = _buildPayload();
    final hasAnyData = (payload['conditions'] as List).isNotEmpty ||
        (payload['allergies'] as List).isNotEmpty ||
        (payload['medications'] as List).isNotEmpty ||
        (payload['surgeries'] as List).isNotEmpty ||
        (payload['implants'] as List).isNotEmpty ||
        (payload['basic'] as Map).isNotEmpty;
    if (!hasAnyData) {
      setState(() => _submitting = false);
      if (directEditsCount > 0) {
        // La única corrección era de un dato ya cargado con el mismo
        // nombre/identidad (dosis, tipo/gravedad de alergia, fecha de
        // condición) — ya se guardó con el PATCH directo de arriba, no
        // hace falta pasar por el diálogo de revisión de propuestas
        // nuevas.
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(directEditsCount == 1
              ? _trSafe('form.updatedExistingDataOne')
              : _trSafe('form.updatedExistingDataMany', params: {'count': '$directEditsCount'}))),
        );
        if (failureNotice != null) {
          _showFormError(failureNotice);
          return;
        }
        if (mounted) Navigator.of(context).pop(true);
        return;
      }
      if (failureNotice != null) {
        _showFormError(failureNotice);
        return;
      }
      // Pedido explícito del usuario: si ya había datos cargados y no se
      // tocó nada, el mensaje tiene que decir ESO — no confundirlo con
      // "no completaste nada", que es un caso distinto.
      final hasAnythingFilled = _conditionRows.values.any((r) => r.checked) ||
          _allergies.any((a) => a.nameController.text.trim().isNotEmpty) ||
          _medications.any((m) => m.nameController.text.trim().isNotEmpty) ||
          _surgeries.any((s) => s.nameController.text.trim().isNotEmpty) ||
          _implants.any((im) => im.nameController.text.trim().isNotEmpty) ||
          _fractures.any((f) => f.nameController.text.trim().isNotEmpty) ||
          _birthDateController.text.trim().isNotEmpty ||
          _weightController.text.trim().isNotEmpty ||
          _heightController.text.trim().isNotEmpty;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(
          hasAnythingFilled ? _trSafe('form.noChangesToSave') : _trSafe('form.fillAtLeastOne'),
        )),
      );
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final response = await ApiClient.instance.dio.post('/me/health-assistant/form-intake', data: payload);
      final data = response.data as Map<String, dynamic>;
      final conversationId = data['conversationId'] as String;
      final proposals = data['proposals'] as List;
      final corrections = (data['corrections'] as List?) ?? [];
      if (!mounted) return;
      setState(() => _submitting = false);
      final confirmed = await _showReviewDialog(proposals.length, corrections);
      if (confirmed != true || !mounted) return;
      setState(() => _submitting = true);
      final confirmResponse =
          await ApiClient.instance.dio.post('/me/health-assistant/conversations/$conversationId/confirm-all');
      if (!mounted) return;
      // Bug real reportado en vivo: "la primera vez que se pone una
      // fecha mal... guarda la enfermedad pero no la fecha y no dice
      // nada" — confirm-all ahora devuelve dateWarnings cuando un
      // antecedente NUEVO tenía una fecha futura/anterior al
      // nacimiento (se guardó sin fecha); se junta con failureNotice
      // para nunca dejar pasar un guardado incompleto en silencio.
      final dateWarnings =
          ((confirmResponse.data as Map<String, dynamic>?)?['dateWarnings'] as List?)?.cast<String>() ??
              const <String>[];
      final combinedNotice = [
        ?failureNotice,
        ...dateWarnings,
      ].join(' ');
      if (combinedNotice.isNotEmpty) {
        setState(() => _submitting = false);
        _showFormError(combinedNotice);
        return;
      }
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _showFormError(dioErrorMessage(e, _trSafe('form.saveError')));
    }
  }

  Future<bool?> _showReviewDialog(int proposalCount, List corrections) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(context.tr('form.reviewTitle')),
        content: SizedBox(
          width: double.maxFinite,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(proposalCount == 1
                    ? context.tr('form.willSaveDataOne')
                    : context.tr('form.willSaveDataMany', params: {'count': '$proposalCount'})),
                if (corrections.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(context.tr('form.aiCorrectedText'), style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  for (final c in corrections)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text('"${c['original']}" → "${c['corrected']}"'),
                    ),
                ],
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(context.tr('assistant.cancel'))),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(context.tr('form.confirmAndSaveButton'))),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingExisting) {
      return Scaffold(
        appBar: AppBar(title: Text(context.tr('form.title'))),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('form.title'))),
      body: AbsorbPointer(
        absorbing: _submitting,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_error != null) Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
            Text(context.tr('form.intro'),
                style: const TextStyle(color: Colors.grey)),
            if (_lastUpdatedText != null) ...[
              const SizedBox(height: 4),
              Text(context.tr('form.lastUpdated', params: {'date': _lastUpdatedText!}),
                  style: const TextStyle(color: Colors.grey, fontStyle: FontStyle.italic)),
            ],
            const SizedBox(height: 16),
            _sectionTitle(context.tr('form.basicDataSection')),
            TextField(
              controller: _birthDateController,
              keyboardType: TextInputType.datetime,
              inputFormatters: _dateInputFormatters,
              decoration: InputDecoration(labelText: context.tr('form.birthDateLabel')),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _sexCode,
              isExpanded: true,
              decoration: InputDecoration(labelText: context.tr('form.sexLabel')),
              items: [
                DropdownMenuItem(value: 'MALE', child: Text(context.tr('form.sexMale'), overflow: TextOverflow.ellipsis)),
                DropdownMenuItem(value: 'FEMALE', child: Text(context.tr('form.sexFemale'), overflow: TextOverflow.ellipsis)),
                DropdownMenuItem(value: 'OTHER', child: Text(context.tr('form.sexOther'), overflow: TextOverflow.ellipsis)),
                DropdownMenuItem(value: 'PREFER_NOT_TO_SAY', child: Text(context.tr('form.sexPreferNotToSay'), overflow: TextOverflow.ellipsis)),
              ],
              onChanged: (v) => setState(() => _sexCode = v),
            ),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: TextField(
                controller: _weightController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: context.tr('form.weightLabel')),
              )),
              const SizedBox(width: 12),
              Expanded(child: TextField(
                controller: _heightController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: context.tr('form.heightLabel')),
              )),
            ]),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _bloodTypeCode,
              isExpanded: true,
              decoration: InputDecoration(labelText: context.tr('form.bloodTypeLabel')),
              items: const [
                DropdownMenuItem(value: 'O_NEG', child: Text('O-')),
                DropdownMenuItem(value: 'O_POS', child: Text('O+')),
                DropdownMenuItem(value: 'A_NEG', child: Text('A-')),
                DropdownMenuItem(value: 'A_POS', child: Text('A+')),
                DropdownMenuItem(value: 'B_NEG', child: Text('B-')),
                DropdownMenuItem(value: 'B_POS', child: Text('B+')),
                DropdownMenuItem(value: 'AB_NEG', child: Text('AB-')),
                DropdownMenuItem(value: 'AB_POS', child: Text('AB+')),
              ],
              onChanged: (v) => setState(() => _bloodTypeCode = v),
            ),

            _sectionTitle(context.tr('form.medicalHistorySection')),
            Text(context.tr('form.medicalHistoryHint'), style: const TextStyle(color: Colors.grey, fontSize: 12)),
            for (final q in _questions) _conditionTile(q),

            _sectionTitle(context.tr('form.allergiesSection')),
            for (var i = 0; i < _allergies.length; i++) _allergyRow(i),
            OutlinedButton.icon(
              onPressed: () => setState(() => _allergies.add(_AllergyRow())),
              icon: const Icon(Icons.add),
              label: Text(context.tr('form.addAllergyButton')),
            ),

            _sectionTitle(context.tr('form.medicationsSection')),
            for (var i = 0; i < _medications.length; i++) _medicationRow(i),
            OutlinedButton.icon(
              onPressed: () => setState(() => _medications.add(_MedicationRow())),
              icon: const Icon(Icons.add),
              label: Text(context.tr('form.addMedicationButton')),
            ),

            _sectionTitle(context.tr('form.surgeriesSection')),
            for (var i = 0; i < _surgeries.length; i++) _nameDateRow(_surgeries, i, context.tr('form.surgeryNameLabel'), 'surgeries'),
            OutlinedButton.icon(
              onPressed: () => setState(() => _surgeries.add(_NameDateRow())),
              icon: const Icon(Icons.add),
              label: Text(context.tr('form.addSurgeryButton')),
            ),

            _sectionTitle(context.tr('form.implantsSection')),
            for (var i = 0; i < _implants.length; i++) _nameDateRow(_implants, i, context.tr('form.implantNameLabel'), 'implants-devices'),
            OutlinedButton.icon(
              onPressed: () => setState(() => _implants.add(_NameDateRow())),
              icon: const Icon(Icons.add),
              label: Text(context.tr('form.addImplantButton')),
            ),

            const SizedBox(height: 24),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(context.tr('form.validateAndSaveButton')),
            ),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  /// Pedido explícito del usuario: "Detalle (opcional)" se confundía con
  /// el texto que el viajero ya había escrito porque Material dibuja el
  /// labelText DENTRO del campo, con el mismo tono, hasta que se hace
  /// foco — con floatingLabelBehavior.always queda siempre arriba, chico
  /// y en gris, así nunca se puede confundir con un valor cargado.
  // Pedido explícito del usuario: "se le puede sacar un poco de margen
  // a ambos fecha y detalle opcional" — las fechas ("dd/mm/aaaa", 10
  // caracteres) quedaban cortadas dentro del campo angosto de al lado
  // del desplegable de tipo/detalle — el padding horizontal por
  // default de Material le deja poco lugar de verdad al texto. Un
  // padding más chico les da más espacio real a ambos sin agrandar el
  // campo en sí.
  static const _tightContentPadding = EdgeInsets.symmetric(horizontal: 8, vertical: 12);

  InputDecoration _lightLabelDecoration(String label) => InputDecoration(
        labelText: label,
        isDense: true,
        contentPadding: _tightContentPadding,
        floatingLabelBehavior: FloatingLabelBehavior.always,
        labelStyle: TextStyle(color: Colors.grey.shade500, fontSize: 12),
      );

  InputDecoration _dateFieldDecoration(String label) => InputDecoration(
        labelText: label,
        isDense: true,
        contentPadding: _tightContentPadding,
      );

  /// Bug real reportado en vivo: quedó guardado un antecedente con
  /// "Fecha declarada por el viajero: 15/*12/2021" — un caracter suelto
  /// (el "*") coló en un campo de fecha de texto libre. Los campos de
  /// fecha de ANTECEDENTES (condición/cirugía/implante) se dejan tal
  /// cual, sin restringir el teclado — a propósito aceptan texto tipo
  /// "desde los 10 años" (ver parseFormDateWithAge en el backend), así
  /// que restringirlos a solo dígitos rompería esa función. La fecha
  /// de NACIMIENTO no tiene ese caso de uso (nadie "nació hace X años"
  /// como respuesta relativa a sí misma), así que ahí sí se restringe
  /// el teclado a solo dígitos y "/". La validación real (fecha
  /// implausible, futura o anterior al nacimiento) ahora se hace del
  /// lado del servidor para TODOS los campos de fecha, sin importar el
  /// formato de texto — ver AIService.normalizeDateOrNull.
  static final _dateInputFormatters = [FilteringTextInputFormatter.allow(RegExp(r'[0-9/]'))];

  Widget _sectionTitle(String text) => Padding(
        padding: const EdgeInsets.only(top: 20, bottom: 8),
        child: Text(text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
      );

  /// Pedido explícito del usuario: "nada debería ser fijo, todo debería
  /// depender de tablas dinámicas" — cualquier pregunta con "options"
  /// no vacío (ej. tipos de diabetes, o lo que se agregue después desde
  /// admin-web) muestra un dropdown con esas opciones en vez del campo
  /// de texto libre — generalizado, no hay ningún caso especial para
  /// diabetes en particular acá.
  Widget _conditionTile(Map<String, dynamic> question) {
    // Ver el comentario de _fractures: única pregunta multi-instancia
    // hoy, con su propia lista repetible en vez del campo único de
    // _ConditionRowState.
    if (question['code'] == 'BONE_FRACTURE') return _fractureTile(question);
    final id = question['id'] as String;
    final label = question['questionText'] as String;
    final options = (question['options'] as List?)?.cast<String>();
    final row = _conditionRows[id]!;
    // Bug real reportado en vivo: "hago clic en la zona donde indica
    // tiene diabetes, sin destildar nada, y me sale el mensaje de
    // quitar el dato" — CheckboxListTile hace tocable TODA la fila
    // (el texto de la pregunta, no solo el cuadradito), así que un
    // toque cerca del label o de los campos de abajo destildaba sin
    // querer y disparaba la confirmación de borrado. Reemplazado por un
    // Row con Checkbox suelto: solo el cuadradito responde al toque, el
    // texto de la pregunta ya no es parte del área tocable.
    Future<void> onCheckedChanged(bool? v) async {
      final checking = v ?? false;
      if (!checking && row.existingId != null) {
        final ok = await _confirmAndSoftDeleteExisting(
          resource: 'conditions',
          id: row.existingId!,
          itemLabel: row.detailController.text.trim().isNotEmpty ? row.detailController.text.trim() : label,
        );
        if (!ok) return; // cancelado o falló — sigue tildado
        row.existingId = null;
      }
      setState(() => row.checked = checking);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Checkbox(value: row.checked, onChanged: onCheckedChanged),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 14))),
        ]),
        if (row.checked && options != null && options.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(left: 16, bottom: 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                // Pedido explícito del usuario: "no corregiste el
                // margen de los box contenedores... sacale margen y va
                // a andar bien" — un flex proporcional se achicaba en
                // pantallas angostas hasta cortar "dd/mm/aaaa". Un
                // ancho FIJO (suficiente para 10 caracteres con
                // margen) garantiza que la fecha entre completa sin
                // importar cuánto ocupe el campo de al lado.
                SizedBox(
                  width: 118,
                  child: TextField(
                    controller: row.dateController,
                    decoration: _dateFieldDecoration(context.tr('form.approxDateLabel')),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: row.selectedOption,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: context.tr('form.conditionTypeLabel'), isDense: true),
                    items: options.map((t) => DropdownMenuItem(value: t, child: Text(t, overflow: TextOverflow.ellipsis))).toList(),
                    onChanged: (v) => setState(() => row.selectedOption = v),
                  ),
                ),
              ]),
              if (row.selectedOption?.trim().toLowerCase() == 'otra' || row.selectedOption?.trim().toLowerCase() == 'otro')
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: TextField(
                    controller: row.detailController,
                    decoration: _lightLabelDecoration(context.tr('form.whichLabel')),
                  ),
                ),
            ]),
          )
        else if (row.checked)
          Padding(
            padding: const EdgeInsets.only(left: 16, bottom: 12),
            child: Row(children: [
              SizedBox(
                width: 118,
                child: TextField(
                  controller: row.dateController,
                  decoration: _dateFieldDecoration(context.tr('form.approxDateLabel')),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: row.detailController,
                  decoration: _lightLabelDecoration(context.tr('form.detailOptionalLabel')),
                ),
              ),
            ]),
          ),
      ],
    );
  }

  /// Ver el comentario de _fractures: mismo patrón visual que
  /// cirugías/implantes (lista repetible de lugar+fecha), pero
  /// escondida detrás de un checkbox como el resto de _questions —
  /// "¿tuviste alguna fractura?" primero, y solo si contesta que sí
  /// aparecen las filas para cargar cada una.
  Widget _fractureTile(Map<String, dynamic> question) {
    final label = question['questionText'] as String;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Checkbox(
            value: _fracturesChecked,
            onChanged: (v) => setState(() {
              _fracturesChecked = v ?? false;
              if (_fracturesChecked && _fractures.isEmpty) _fractures.add(_NameDateRow());
            }),
          ),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 14))),
        ]),
        if (_fracturesChecked)
          Padding(
            padding: const EdgeInsets.only(left: 16, bottom: 4),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (var i = 0; i < _fractures.length; i++)
                _nameDateRow(_fractures, i, context.tr('form.fractureLocationLabel'), 'conditions'),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => setState(() => _fractures.add(_NameDateRow())),
                  icon: const Icon(Icons.add),
                  label: Text(context.tr('form.addFractureButton')),
                ),
              ),
            ]),
          ),
      ],
    );
  }

  Widget _allergyRow(int i) {
    final row = _allergies[i];
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: TextField(
            controller: row.nameController,
            decoration: InputDecoration(labelText: context.tr('form.allergyWhatLabel'), isDense: true),
          )),
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: context.tr('form.remove'),
            onPressed: () => _removeRow(
              resource: 'allergies',
              existingId: row.existingId,
              itemLabel: row.nameController.text.trim(),
              onRemove: () => setState(() { row.dispose(); _allergies.removeAt(i); }),
            ),
          ),
        ]),
        const SizedBox(height: 4),
        Row(children: [
          Expanded(child: DropdownButtonFormField<String>(
            initialValue: row.type,
            isExpanded: true,
            decoration: InputDecoration(labelText: context.tr('form.conditionTypeLabel'), isDense: true),
            items: [
              DropdownMenuItem(value: 'MEDICATION', child: Text(context.tr('form.allergyTypeMedication'), overflow: TextOverflow.ellipsis)),
              DropdownMenuItem(value: 'FOOD', child: Text(context.tr('form.allergyTypeFood'), overflow: TextOverflow.ellipsis)),
              DropdownMenuItem(value: 'ENVIRONMENTAL', child: Text(context.tr('form.allergyTypeEnvironmental'), overflow: TextOverflow.ellipsis)),
              DropdownMenuItem(value: 'OTHER', child: Text(context.tr('form.allergyTypeOther'), overflow: TextOverflow.ellipsis)),
            ],
            onChanged: (v) => setState(() => row.type = v ?? 'OTHER'),
          )),
          const SizedBox(width: 8),
          Expanded(child: DropdownButtonFormField<String>(
            initialValue: row.severity,
            isExpanded: true,
            decoration: InputDecoration(labelText: context.tr('form.severityLabel'), isDense: true),
            items: [
              DropdownMenuItem(value: 'MILD', child: Text(context.tr('form.severityMild'), overflow: TextOverflow.ellipsis)),
              DropdownMenuItem(value: 'MODERATE', child: Text(context.tr('form.severityModerate'), overflow: TextOverflow.ellipsis)),
              DropdownMenuItem(value: 'SEVERE', child: Text(context.tr('form.severitySevere'), overflow: TextOverflow.ellipsis)),
              DropdownMenuItem(value: 'CRITICAL', child: Text(context.tr('form.severityCritical'), overflow: TextOverflow.ellipsis)),
            ],
            onChanged: (v) => setState(() => row.severity = v ?? 'MODERATE'),
          )),
        ]),
      ]),
    );
  }

  Widget _medicationRow(int i) {
    final row = _medications[i];
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: TextField(
            controller: row.nameController,
            decoration: InputDecoration(labelText: context.tr('form.medicationNameLabel'), isDense: true),
          )),
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: context.tr('form.remove'),
            onPressed: () => _removeRow(
              resource: 'medications',
              existingId: row.existingId,
              itemLabel: row.nameController.text.trim(),
              onRemove: () => setState(() { row.dispose(); _medications.removeAt(i); }),
            ),
          ),
        ]),
        const SizedBox(height: 4),
        Row(children: [
          Expanded(child: TextField(
            controller: row.doseController,
            decoration: InputDecoration(labelText: context.tr('form.doseLabel'), isDense: true),
          )),
          const SizedBox(width: 8),
          Expanded(child: TextField(
            controller: row.sinceController,
            decoration: InputDecoration(labelText: context.tr('form.sinceWhenLabel'), isDense: true),
          )),
        ]),
      ]),
    );
  }

  Widget _nameDateRow(List<_NameDateRow> list, int i, String nameLabel, String resource) {
    final row = list[i];
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(children: [
        Expanded(flex: 2, child: TextField(
          controller: row.nameController,
          decoration: InputDecoration(labelText: nameLabel, isDense: true),
        )),
        const SizedBox(width: 8),
        SizedBox(
          width: 118,
          child: TextField(
            controller: row.dateController,
            decoration: _dateFieldDecoration(context.tr('form.approxDateLabel')),
          ),
        ),
        IconButton(
          icon: const Icon(Icons.delete_outline),
          tooltip: context.tr('form.remove'),
          onPressed: () => _removeRow(
            resource: resource,
            existingId: row.existingId,
            itemLabel: row.nameController.text.trim(),
            onRemove: () => setState(() { row.dispose(); list.removeAt(i); }),
          ),
        ),
      ]),
    );
  }

  /// Baja lógica del registro real (si la fila vino precargada) antes
  /// de sacarla del formulario — si el viajero cancela la confirmación
  /// o falla el pedido, la fila queda tal cual estaba.
  Future<void> _removeRow({
    required String resource,
    required String? existingId,
    required String itemLabel,
    required VoidCallback onRemove,
  }) async {
    if (existingId != null) {
      final ok = await _confirmAndSoftDeleteExisting(resource: resource, id: existingId, itemLabel: itemLabel);
      if (!ok) return;
    }
    onRemove();
  }
}
