import 'dart:async';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:go_router/go_router.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

import '../../core/api_client.dart';
import '../../core/text_normalize.dart';
import 'health_form_screen.dart';

/// Pedido explícito del usuario: TRES formas de cargar la Ficha de
/// Salud — Clásico (charla libre), Estructurado (pregunta por
/// pregunta) y Formulario (una sola pantalla, sin chat) — mismo entry
/// point desde donde antes se navegaba directo a HealthAssistantScreen
/// (home y "Salud"), ahora pasa primero por este selector.
Future<void> openHealthAssistant(BuildContext context) async {
  final choice = await showModalBottomSheet<String>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('¿Cómo querés cargar tu Ficha de Salud?'),
          ),
          ListTile(
            leading: const Icon(Icons.chat_outlined),
            title: const Text('Modo clásico'),
            subtitle: const Text('Charla libre, la IA conduce la entrevista'),
            onTap: () => Navigator.of(ctx).pop('classic'),
          ),
          ListTile(
            leading: const Icon(Icons.checklist_outlined),
            title: const Text('Modo estructurado'),
            subtitle: const Text('Preguntas guiadas por IA'),
            onTap: () => Navigator.of(ctx).pop('structured'),
          ),
          ListTile(
            leading: const Icon(Icons.article_outlined),
            title: const Text('Formulario'),
            subtitle: const Text('Preguntas en pantalla validadas por IA'),
            onTap: () => Navigator.of(ctx).pop('form'),
          ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
  if (choice == null || !context.mounted) return;
  if (choice == 'form') {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const HealthFormScreen()));
    return;
  }
  context.push('/health-assistant', extra: {'structuredModel': choice == 'structured'});
}

/// Mensaje de error puntual del backend (ej. "Ya tenés cargada esa
/// comorbilidad", 409 vía mapPgError) si viene; si no, un texto
/// genérico — evitaba que el usuario reintentara sin entender por qué
/// fallaba siempre lo mismo (reportado en vivo).
String _errorMessage(Object error, String fallback) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map && data['message'] is String) {
      return data['message'] as String;
    }
  }
  return fallback;
}

/// Defensa aparte del prompt (ver SYSTEM_PROMPT en openai.provider.ts):
/// si igual llega markdown (viñetas, negrita, etc.) no lo lea literal —
/// "asterisco asterisco" o "guion" en voz alta suena mal.
String _speakableText(String raw) {
  return raw
      .replaceAll(RegExp(r'[*_`#]'), '')
      .replaceAll(RegExp(r'^\s*[-•]\s+', multiLine: true), '')
      .replaceAll(RegExp(r'\n+'), '. ')
      .replaceAll(RegExp(r'\s{2,}'), ' ')
      .trim();
}

class _ChatMessage {
  _ChatMessage({required this.text, required this.fromUser, this.options});
  final String text;
  final bool fromUser;
  /// Pedido explícito del usuario: poder tocar las opciones (ej. los 3
  /// tipos de diabetes) en vez de tener que decirlas o tipearlas.
  final List<String>? options;
}

/// Chat de IA para cargar la ficha médica (alergias/medicamentos)
/// charlando en lenguaje natural — distinto del asistente de ayuda de
/// uso de la app (AssistantScreen). Es una conversación de texto lisa y
/// llana: nunca se muestra ninguna tarjeta ni popup de confirmación por
/// dato (pedido explícito del usuario — eso trababa el flujo e
/// interfería con la siguiente respuesta). La IA va anotando cada dato
/// como pendiente puertas adentro y lo reconoce con una frase dentro de
/// su propia respuesta; nada se guarda en la ficha médica real hasta el
/// cierre (interviewComplete), cuando el viajero confirma TODO junto.
class HealthAssistantScreen extends StatefulWidget {
  const HealthAssistantScreen({super.key, this.structuredModel = false});

  /// Pedido explícito del usuario: un SEGUNDO modelo de carga de Ficha
  /// de Salud (guiado por tabla, endpoint /structured-chat) para
  /// comparar contra el modelo Clásico conversacional (endpoint /chat,
  /// default) en una demo — mismo widget, cambia solo el endpoint y el
  /// título de la pantalla, toda la UI de chat/voz es compartida.
  final bool structuredModel;

  @override
  State<HealthAssistantScreen> createState() => _HealthAssistantScreenState();
}

class _HealthAssistantScreenState extends State<HealthAssistantScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  // Pedido explícito del usuario: "no me lleva al final de lo que
  // hablo" — un TextField de una sola línea sin foco (se llena por voz,
  // no por teclado) no siempre sigue el cursor solo con .selection; se
  // controla el scroll horizontal a mano para garantizar que siempre
  // se vea lo último reconocido (ver _setControllerText).
  final _inputScrollController = ScrollController();
  // Sin saludo fijo: el primer mensaje lo genera la IA en _startConversation
  // (corto, se presenta sola, saluda por el nombre y decide si preguntar
  // los datos básicos o si ya hay ficha cargada — ver SYSTEM_PROMPT).
  final _messages = <_ChatMessage>[];
  String? _conversationId;
  bool _sending = false;

  /// Pedido explícito del usuario: no confirmar antecedente por
  /// antecedente durante la entrevista, ni mostrar ninguna tarjeta o
  /// popup por dato — se van anotando como pendientes puertas adentro
  /// (nunca visible en la UI) y recién se confirman TODOS JUNTOS en un
  /// solo request cuando la IA llega al cierre y marca
  /// "interviewComplete" en la respuesta.
  bool _interviewComplete = false;
  bool _confirmingAll = false;
  /// Pedido explícito del usuario: la IA entiende "quiero pausar" (ver
  /// wantsToPause en interpretStructuredAnswer) y el backend YA confirma
  /// todo lo pendiente en ese mismo turno — a diferencia del cierre
  /// normal (interviewComplete sin esto), acá no hay nada más que
  /// confirmar, así que no corresponde mostrar la barra "¿Confirmamos
  /// todo?" con un botón que reconfirmaría algo ya guardado.
  bool _paused = false;

  final _speech = stt.SpeechToText();
  bool _speechAvailable = false;
  bool _listening = false;
  int _consecutiveMicErrors = 0;
  static const _maxConsecutiveMicErrors = 3;
  static const _maxConsecutiveNetworkErrors = 8;
  Future<bool>? _speechInitFuture;

  /// Bug real reportado en vivo: "dije la frase completa (peso, altura y
  /// grupo sanguíneo) pero solo tomó 'peso' y se quedó colgado" —
  /// confirmado que el reconocedor nativo de Android a veces deja de
  /// entregar CUALQUIER callback (ni onResult, ni onStatus, ni onError)
  /// a mitad de una sesión, sin que listenFor/pauseFor lo corten (esos
  /// timeouts los aplica el propio reconocedor, y si su hilo quedó
  /// colgado no llegan a dispararse). Como todo el flujo de escucha
  /// depende enteramente de esos callbacks, sin esto quedaba
  /// "Escuchando..." para siempre, igual que pasó con onPlayerComplete
  /// en la síntesis de voz (ver _playAudioBytes). Se re-arma en cada
  /// onResult (prueba de que la sesión sigue viva) y se cancela al
  /// terminar de cualquier forma normal (final, status, error).
  Timer? _listenWatchdog;

  final _tts = FlutterTts();
  final _audioPlayer = AudioPlayer();
  // Por accesibilidad (pedido explícito del usuario: "le sirve a una
  // persona que no puede ver") arranca SIEMPRE activado (salvo que se
  // haya apagado por parámetro, ver _loadVoiceSettings) y encadena solo
  // hablar → escuchar → hablar, sin que haga falta tocar la pantalla. Se
  // apaga tocando el parlante, diciendo una frase para silenciarlo, o
  // solo, si en algún momento no se detecta voz (ver _handleSilenceTimeout).
  bool _voiceReplyEnabled = true;
  bool _speaking = false;

  /// Parámetros editables desde admin-web (Parámetros de la app) sin
  /// recompilar la app — ver params.app_settings / AppSettingsPage.
  /// Los valores acá son el fallback si el fetch falla (sin conexión,
  /// backend caído): mismos defaults que la migración sembró.
  final Map<String, String> _voiceSettings = {
    'assistant.tts_speech_rate': '0.55',
    'assistant.tts_pitch': '1.0',
    'assistant.tts_pause_seconds': '2',
    'assistant.tts_listen_seconds': '60',
    'assistant.voice_reply_default_enabled': 'true',
    'assistant.tts_voice': 'nova',
  };

  double _voiceDouble(String key, double fallback) => double.tryParse(_voiceSettings[key] ?? '') ?? fallback;
  int _voiceInt(String key, int fallback) => int.tryParse(_voiceSettings[key] ?? '') ?? fallback;

  String get _chatEndpoint => widget.structuredModel
      ? '/me/health-assistant/structured-chat'
      : '/me/health-assistant/chat';

  /// Bug real reportado en vivo: "el micrófono parece activo pero no
  /// escucha nada" — logcat mostró error_server_disconnected en 0ms,
  /// SIEMPRE (listen() ni siquiera llega a abrir audio), con wifi
  /// confirmado activo — no es un problema de red, es la conexión del
  /// plugin nativo con el servicio de reconocimiento de Android que
  /// quedó rota. Reintentar listen() sobre el mismo objeto no alcanza
  /// (confirmado: se repitió 2/2 veces); lo único que lo destrababa
  /// antes era salir y volver a entrar a la pantalla, que fuerza un
  /// initState nuevo. Factoreado a método propio para poder volver a
  /// llamar initialize() (sin recrear la pantalla) y reestablecer esa
  /// conexión nativa cuando pasa esto.
  Future<bool> _initSpeech() {
    return _speech.initialize(
      onError: (error) {
        debugPrint('[MIC] onError: ${error.errorMsg} permanent=${error.permanent} structured=${widget.structuredModel}');
        _cancelListenWatchdog();
        if (!mounted) return;
        setState(() => _listening = false);

        // Bug real reportado en vivo: "no se envía nunca lo que yo
        // digo, tengo que presionar la flechita". Causa encontrada con
        // logcat: cuando la sesión vuelve en silencio TOTAL (la
        // persona terminó de hablar y no dijo nada más), el plugin NO
        // llama a onResult(finalResult:true) como cualquier otro corte
        // — dispara error_no_match acá, en onError, que nunca miraba
        // si ya había algo acumulado de sesiones anteriores para
        // enviar. Antes esto solo reintentaba escuchar sin fin.
        //
        // Bug real reportado en vivo (segunda vuelta, confirmado con
        // logcat): "escucha y escribe, pero se queda ahí, no procesa
        // nada" — pasaba cuando, después de acumular una frase, la
        // sesión siguiente NO volvía en silencio limpio (error_no_match)
        // sino con OTRO error (ej. error_network, error_server_
        // disconnected) — este bloque solo miraba error_no_match, así
        // que cualquier otro error dejaba lo ya dicho huérfano para
        // siempre: reintentaba escuchar de nuevo pero nunca lo mandaba.
        // Ahora, si ya hay algo acumulado, CUALQUIER error de esta
        // sesión (no solo silencio limpio) lo envía — llegados a este
        // punto la sesión actual ya está muerta de cualquier forma, y
        // perder lo que la persona ya dijo es peor que enviarlo.
        // Bug real reportado en vivo: "le pregunté qué es un AIT y no me
        // escuchó" — confirmado con logcat: dijo "no" a una pregunta,
        // la app reabrió el micrófono por si agregaba algo más, ella
        // tardó en reaccionar con la pregunta de seguimiento y para
        // cuando empezó a hablar la sesión ya había cerrado — pero acá
        // el bloque de arriba solo miraba _accumulatedSpeech (lo ya
        // cerrado de la sesión ANTERIOR) e ignoraba _lastPartial (lo que
        // sea que esta sesión nueva alcanzó a reconocer antes del
        // error), perdiéndolo en silencio. Mismo criterio que ya se usa
        // en _recoverFromHungListen: cualquier palabra suelta que
        // llegó a reconocerse se suma antes de mandar, en vez de
        // descartarla porque la sesión terminó en error.
        if (_lastPartial.trim().isNotEmpty) {
          _accumulatedSpeech = _accumulatedSpeech.isEmpty
              ? _lastPartial.trim()
              : '$_accumulatedSpeech ${_lastPartial.trim()}';
          _lastPartial = '';
        }
        if (_accumulatedSpeech.isNotEmpty) {
          final text = _accumulatedSpeech;
          _accumulatedSpeech = '';
          _lastPartial = '';
          _consecutiveMicErrors = 0;
          _submitRecognizedText(text);
          return;
        }

        if (_voiceReplyEnabled) {
          // Modo manos libres: pedido explícito del usuario — "el
          // micrófono... deberia permanecer abierto, para que siempre
          // esté escuchando". Cualquier error del reconocedor (silencio,
          // timeout, glitch) reintenta solo, nunca apaga el modo.
          //
          // Bug real reportado en vivo: "se prende y apaga rápido, como
          // si estuviera tildado" — esto reintentaba en el mismo tick,
          // sin ninguna pausa, así que si el reconocedor erroreaba de
          // entrada (glitch puntual del dispositivo, foco de audio
          // ocupado) quedaba en un loop de encendido/apagado sin fin.
          // Ahora hay una pausa antes de reintentar, y si se repite
          // varias veces seguidas se corta el auto-reintento (el ícono
          // de micrófono sigue disponible para arrancarlo a mano).
          //
          // Bug real reportado en vivo: con error_network (glitch de
          // conectividad del reconocedor, nada que ver con lo que dice
          // el usuario) el límite de 3 reintentos se agotaba ANTES de
          // que la red se recuperase (se vieron 4+ error_network
          // seguidos en el log real de una prueba) — el modo manos
          // libres se apagaba y había que tocar el ícono a mano justo
          // cuando el problema era transitorio. Ahora error_network
          // tiene su propio presupuesto, más alto y con más paciencia
          // entre intentos, separado de otros errores.
          //
          // Bug real reportado en vivo: error_server_disconnected (ver
          // comentario en _initSpeech) necesita, además de la pausa, un
          // initialize() nuevo antes de reintentar — si no, repite el
          // mismo error al toque, en loop, hasta agotar los reintentos.
          final isNetworkError = error.errorMsg == 'error_network';
          final isServerDisconnected = error.errorMsg == 'error_server_disconnected';
          _consecutiveMicErrors++;
          final maxErrors = isNetworkError ? _maxConsecutiveNetworkErrors : _maxConsecutiveMicErrors;
          if (_consecutiveMicErrors > maxErrors) {
            _consecutiveMicErrors = 0;
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('El micrófono no responde — tocá el ícono para intentar de nuevo.')),
            );
            return;
          }
          final delay = isNetworkError ? const Duration(milliseconds: 1500) : const Duration(milliseconds: 800);
          if (isServerDisconnected) {
            _speechInitFuture = _initSpeech().then((available) {
              if (mounted) setState(() => _speechAvailable = available);
              return available;
            });
          }
          Future.delayed(delay, () async {
            if (isServerDisconnected) await _speechInitFuture;
            if (mounted && !_listening) _startListening();
          });
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('No se pudo reconocer la voz (${error.errorMsg}) — probá de nuevo.')),
          );
        }
      },
      onStatus: (status) {
        debugPrint('[MIC] onStatus: $status structured=${widget.structuredModel}');
        if (status == 'done' || status == 'notListening') {
          _cancelListenWatchdog();
          if (mounted) setState(() => _listening = false);
        }
      },
    );
  }

  @override
  void initState() {
    super.initState();
    _speechInitFuture = _initSpeech().then((available) {
      debugPrint('[MIC] initialize resolved: available=$available structured=${widget.structuredModel}');
      if (mounted) setState(() => _speechAvailable = available);
      return available;
    });
    _tts.setStartHandler(() {
      _muteMicForPlayback();
      if (mounted) setState(() => _speaking = true);
    });
    _tts.setCompletionHandler(_onSpeechFinished);
    _tts.setCancelHandler(() {
      if (mounted) setState(() => _speaking = false);
    });
    _tts.setErrorHandler((message) {
      if (!mounted) return;
      setState(() => _speaking = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo reproducir la respuesta en voz alta ($message).')),
      );
    });
    _initVoiceFlow();
  }

  @override
  void dispose() {
    _listenWatchdog?.cancel();
    _speech.stop();
    _tts.stop();
    _audioPlayer.dispose();
    _inputScrollController.dispose();
    super.dispose();
  }

  void _armListenWatchdog() {
    _listenWatchdog?.cancel();
    final timeoutSeconds = _voiceInt('assistant.tts_listen_seconds', 60) +
        _voiceInt('assistant.tts_pause_seconds', 3) +
        10;
    _listenWatchdog = Timer(Duration(seconds: timeoutSeconds), _recoverFromHungListen);
  }

  void _cancelListenWatchdog() {
    _listenWatchdog?.cancel();
    _listenWatchdog = null;
  }

  /// Recuperación cuando el reconocedor dejó de responder del todo (ver
  /// comentario de _listenWatchdog): cancela la sesión colgada, manda lo
  /// que ya se había reconocido (aunque no haya llegado a un
  /// finalResult) y sigue el mismo criterio que el resto del archivo
  /// para no perder lo que la persona ya dijo.
  Future<void> _recoverFromHungListen() async {
    debugPrint('[MIC] watchdog: sin actividad del reconocedor — recuperando sesión colgada');
    if (!mounted || !_listening) return;
    await _speech.cancel();
    if (!mounted) return;
    setState(() => _listening = false);
    final pending = _lastPartial.trim();
    _lastPartial = '';
    if (pending.isNotEmpty) {
      _accumulatedSpeech = _accumulatedSpeech.isEmpty ? pending : '$_accumulatedSpeech $pending';
    }
    if (_accumulatedSpeech.isNotEmpty) {
      final text = _accumulatedSpeech;
      _accumulatedSpeech = '';
      _setControllerText(text);
      _submitRecognizedText(text);
      return;
    }
    if (_voiceReplyEnabled) {
      _startListening();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('El micrófono dejó de responder — tocá el ícono para intentar de nuevo.')),
      );
    }
  }

  /// El corazón del modo manos libres: apenas termina de hablar (el
  /// saludo inicial, cualquier respuesta, o una pregunta de
  /// confirmación), activa el micrófono solo — sin importar qué motor
  /// de voz habló (ver _speak).
  void _onSpeechFinished() {
    debugPrint('[MIC] _onSpeechFinished: suppress=$_suppressAutoListen voiceReplyEnabled=$_voiceReplyEnabled '
        'sending=$_sending listening=$_listening structured=${widget.structuredModel}');
    if (!mounted) return;
    setState(() => _speaking = false);
    if (_suppressAutoListen) return;
    if (_voiceReplyEnabled && !_sending && !_listening) {
      _startListening();
    }
  }

  /// Evita que _onSpeechFinished dispare el micrófono entre párrafos
  /// intermedios del saludo inicial (ver _speakFirstTurn) — solo debe
  /// arrancar a escuchar después del ÚLTIMO párrafo (la pregunta).
  bool _suppressAutoListen = false;

  /// Voz de OpenAI (gpt-4o-mini-tts, mucho más natural — pedido
  /// explícito del usuario) con el motor del teléfono como respaldo si
  /// falla el pedido (sin conexión, IA deshabilitada, etc.) — nunca deja
  /// el modo manos libres en silencio total.
  /// Bug real reportado en vivo: "cuando habla la IA... se escriben lo
  /// que dice y cuando hay que responder no se puede" — el micrófono
  /// captaba el propio audio de la IA sonando por el parlante como si
  /// fuera el usuario hablando (eco), llenando lo acumulado con
  /// basura y dejando el reconocedor en un estado raro para cuando la
  /// persona sí quería contestar. En vez de perseguir CADA carrera
  /// puntual que puede dejar el mic abierto justo antes de que arranque
  /// el audio, esto es un cortafuegos único que se llama SIEMPRE que
  /// arranca a sonar algo (los dos motores de voz, ver más abajo): si
  /// en ese instante el mic estaba escuchando, se corta ya mismo.
  void _muteMicForPlayback() {
    if (_listening) {
      debugPrint('[MIC] _muteMicForPlayback: cortando escucha activa antes de reproducir audio (eco)');
      _speech.cancel();
      setState(() {
        _listening = false;
        _accumulatedSpeech = '';
        _lastPartial = '';
      });
    }
  }

  /// Pedido explícito del usuario: "lo que trascribe del audio queda
  /// fijo en las primeras palabras... debería mostrar siempre el
  /// final" — asignar _controller.text sola no mueve el cursor, así
  /// que en un texto largo el campo se queda mostrando el principio en
  /// vez de seguir lo último reconocido. Mover .text y .selection
  /// juntos en un solo .value ya ayuda, pero el campo no tiene foco
  /// (se llena por voz, no por teclado) y Flutter no siempre desplaza
  /// solo el scroll horizontal de un TextField sin foco con eso —
  /// bug real reportado en vivo tras el primer intento. Se fuerza el
  /// scroll al final a mano, en el frame siguiente (recién ahí el
  /// controller de scroll ya tiene el nuevo maxScrollExtent).
  void _setControllerText(String text) {
    _controller.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_inputScrollController.hasClients) {
        _inputScrollController.jumpTo(_inputScrollController.position.maxScrollExtent);
      }
    });
  }

  /// Bug real reportado en vivo: "tarda mucho en arrancar a hablar" y
  /// "cuando lee se entrecorta o hace pausas" — antes esto mandaba TODO
  /// el texto de la respuesta en un solo pedido de síntesis a OpenAI;
  /// una respuesta de varias oraciones no suena NADA hasta que ese
  /// pedido entero vuelve (y encima cuanto más larga la respuesta, más
  /// tarda la síntesis). Ahora se trocea por oración y se sintetiza la
  /// SIGUIENTE en paralelo mientras suena la actual — mismo patrón ya
  /// probado en RemoteTtsPlayer.speakChunks, que resolvió el mismo
  /// reclamo en "Info del destino" (trips_screen.dart). Solo la primera
  /// oración tiene la espera real de red/síntesis; el resto suena
  /// seguido, sin el corte de esperar el audio COMPLETO antes de decir
  /// la primera palabra. Respuestas de una sola oración van directo por
  /// el camino simple (sin pipeline, no hay nada que paralelizar).
  Future<void> _speak(String rawText) async {
    final text = _speakableText(rawText);
    if (text.trim().isEmpty) return;
    final sentences = _splitIntoSentences(text);
    if (sentences.length <= 1) {
      if (await _speakWithOpenAi(text)) return;
      await _tts.speak(text);
      return;
    }
    if (await _speakChunksWithOpenAi(sentences)) return;
    await _tts.speak(text);
  }

  /// Separa en oraciones para el pipeline de síntesis — un simple split
  /// por puntuación de cierre alcanza acá porque el texto viene de
  /// prompts controlados por nosotros (preguntas/respuestas fijas o
  /// generadas por nuestro propio backend), no de texto arbitrario de
  /// terceros con abreviaturas raras que confundirían el corte.
  List<String> _splitIntoSentences(String text) {
    return text
        .split(RegExp(r'(?<=[.!?])\s+'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
  }

  Future<Uint8List?> _synthesizeSpeechBytes(String text) async {
    try {
      final response = await ApiClient.instance.dio.post<List<int>>(
        '/me/health-assistant/speech',
        data: {
          'text': text,
          'voice': _voiceSettings['assistant.tts_voice'] ?? 'nova',
        },
        options: Options(responseType: ResponseType.bytes),
      );
      return Uint8List.fromList(response.data!);
    } catch (_) {
      return null;
    }
  }

  Future<void> _playAudioBytes(Uint8List bytes) async {
    final completer = Completer<void>();
    late final StreamSubscription<void> sub;
    sub = _audioPlayer.onPlayerComplete.listen((_) {
      sub.cancel();
      if (!completer.isCompleted) completer.complete();
    });
    await _audioPlayer.play(BytesSource(bytes));
    // Bug real reportado en vivo: "se queda escuchando"/"no hace nada"
    // después de hablar — confirmado con logcat en un Samsung Galaxy
    // S20+: el paquete audioplayers a veces NUNCA emite onPlayerComplete
    // para audio reproducido desde bytes en memoria (falla conocida del
    // plugin en ciertos dispositivos/versiones de Android). Sin este
    // timeout, completer.future no se resolvía NUNCA y todo lo que
    // depende de "terminó de hablar" (mic automático, pregunta
    // siguiente) quedaba trabado para siempre en apariencia. Es solo
    // una red de seguridad — el camino normal sigue resolviendo por el
    // evento real; esto solo actúa si ese evento se pierde. 30s alcanza
    // de sobra para UNA oración (a diferencia del límite viejo de 60s,
    // que era para el audio completo sin trocear).
    await completer.future.timeout(
      const Duration(seconds: 30),
      onTimeout: () {
        debugPrint('[MIC] _playAudioBytes: onPlayerComplete nunca llegó, sigo por timeout');
        sub.cancel();
      },
    );
  }

  Future<bool> _speakWithOpenAi(String text) async {
    final bytes = await _synthesizeSpeechBytes(text);
    if (bytes == null) return false;
    if (!mounted) return true;
    _muteMicForPlayback();
    setState(() => _speaking = true);
    await _playAudioBytes(bytes);
    _onSpeechFinished();
    return true;
  }

  Future<bool> _speakChunksWithOpenAi(List<String> sentences) async {
    if (!mounted) return true;
    _muteMicForPlayback();
    setState(() => _speaking = true);
    Future<Uint8List?>? pending = _synthesizeSpeechBytes(sentences[0]);
    var anySucceeded = false;
    for (var i = 0; i < sentences.length; i++) {
      final bytes = await pending;
      // Ni bien tenemos (o falló) el audio de ESTA oración, ya se pide
      // la siguiente en paralelo — no se espera a que termine de sonar
      // la actual, para que esté lista (o casi) cuando le toque el turno.
      pending = (i + 1 < sentences.length) ? _synthesizeSpeechBytes(sentences[i + 1]) : null;
      if (!mounted) return true;
      if (bytes != null) {
        anySucceeded = true;
        await _playAudioBytes(bytes);
      } else {
        await _tts.speak(sentences[i]);
      }
    }
    _onSpeechFinished();
    return anySucceeded;
  }

  /// El saludo inicial trae varios párrafos separados por "\n\n"
  /// (nombre/presentación, confidencialidad, "Comenzaremos a registrar
  /// sus datos de salud.", y recién ahí la primera pregunta). Pedido
  /// explícito del usuario: que haya una pausa real antes de arrancar
  /// con las preguntas, no que se lea todo corrido sin respiro.
  /// Bug real reportado en vivo: partir el saludo en un llamado de voz
  /// POR CADA párrafo (uno por cada "\n\n") metía una pausa de más
  /// entre TODOS ellos, no solo antes de la pregunta — cada llamado a
  /// /me/health-assistant/speech tiene su propia latencia de red, y esa
  /// demora se sentía como un espacio largo entre "Hola..." y "Estos
  /// datos son confidenciales...", que nunca se pidió. Ahora se corta
  /// en SOLO un punto (el último "\n\n", justo antes de la primera
  /// pregunta): todo lo anterior se lee de un solo llamado — el "\n\n"
  /// interno queda como una pausa natural de lectura (_speakableText ya
  /// lo convierte en un punto), no como un espacio largo — y la única
  /// pausa deliberada queda exactamente donde se pidió.
  Future<void> _speakFirstTurn(String reply) async {
    final splitAt = reply.lastIndexOf('\n\n');
    if (splitAt == -1) {
      await _speak(reply);
      return;
    }
    final intro = reply.substring(0, splitAt).trim();
    final question = reply.substring(splitAt + 2).trim();

    _suppressAutoListen = true;
    if (intro.isNotEmpty) await _speak(intro);
    if (!mounted) return;

    await Future.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;

    _suppressAutoListen = false;
    await _speak(question);
  }

  Future<void> _initVoiceFlow() async {
    await _loadVoiceSettings();
    await _configureTts();
    // Pedido explícito del usuario: nada de saludo fijo ni de dejar el
    // diálogo esperando que el viajero hable primero sin saber qué
    // contestar — la IA arranca sola la charla, se presenta corto, y
    // decide ella misma (según DATOS DEL VIAJERO) si preguntar los
    // datos básicos o si ya hay ficha cargada (ver SYSTEM_PROMPT,
    // sección PRIMER TURNO).
    await _startConversation();
  }

  /// Dispara el primer turno de la IA sin esperar a que el viajero
  /// escriba/hable algo primero. No se muestra como si el viajero
  /// hubiese dicho "Hola" — solo se agrega y (si corresponde) se lee en
  /// voz alta la respuesta de la IA.
  Future<void> _startConversation() async {
    if (_sending || _conversationId != null) return;
    setState(() => _sending = true);
    try {
      final response = await ApiClient.instance.dio.post(_chatEndpoint, data: {
        'question': 'Hola',
      });
      final data = response.data as Map<String, dynamic>;
      _conversationId = data['conversationId'] as String?;
      final reply = data['reply'] as String;
      if (!mounted) return;
      // _sending se apaga ACÁ, antes de hablar — no en un finally después
      // del await _speak. Bug real encontrado en vivo ("se presenta pero
      // no escucha"): _onSpeechFinished (quien arranca el micrófono solo)
      // exige `!_sending`, y si se esperaba a que terminara el audio del
      // saludo con _sending todavía en true, el primer arranque de la
      // escucha automática se saltaba siempre.
      // Bug real reportado en vivo: la primera pregunta (la que viene
      // pegada al saludo) nunca mostraba los botones de sí/no, aunque
      // el backend SÍ los manda (ver structuredIntakeChat) — acá nunca
      // se leía data['options'], a diferencia de _send() más abajo, que
      // sí lo hace.
      setState(() {
        _messages.add(_ChatMessage(text: reply, fromUser: false, options: _optionsFrom(data)));
        _sending = false;
        _interviewComplete = data['interviewComplete'] as bool? ?? false;
      });
      _scrollToBottom();
      if (_voiceReplyEnabled) await _speakFirstTurn(reply);
    } catch (e) {
      final errorText = _errorMessage(e, 'No pude empezar la charla ahora — probá de nuevo en un momento.');
      if (!mounted) return;
      setState(() {
        _messages.add(_ChatMessage(text: errorText, fromUser: false));
        _sending = false;
      });
      _scrollToBottom();
      if (_voiceReplyEnabled) await _speak(errorText);
    }
  }

  Future<void> _loadVoiceSettings() async {
    try {
      final response = await ApiClient.instance.dio.get('/params/app-settings');
      final rows = response.data as List;
      for (final row in rows) {
        final key = row['key'] as String?;
        final value = row['value'] as String?;
        if (key != null && value != null && _voiceSettings.containsKey(key)) {
          _voiceSettings[key] = value;
        }
      }
      _voiceReplyEnabled = _voiceSettings['assistant.voice_reply_default_enabled'] != 'false';
    } catch (_) {
      // Sigue con los defaults locales — no bloquea el arranque del asistente.
    }
  }

  /// Ni un solo botón: si nadie dijo nada durante la escucha automática,
  /// vuelve a escuchar sola. Pedido explícito del usuario: "el
  /// micrófono... deberia permanecer abierto, para que siempre este
  /// escuchando" — antes acá se apagaba el modo manos libres para
  /// siempre ante cualquier silencio, que es justo lo que se quiere
  /// evitar.
  Future<void> _handleSilenceTimeout() async {
    if (!mounted || !_voiceReplyEnabled) return;
    // Mismo bug de "se prende y apaga rápido" que en onError (ver
    // initState): pauseFor por defecto son solo 2 segundos, así que si
    // la persona se queda pensando un poco entre frases, esto reiniciaba
    // el micrófono en el mismo instante, una y otra vez, sin pausa.
    _consecutiveMicErrors++;
    if (_consecutiveMicErrors > _maxConsecutiveMicErrors) {
      _consecutiveMicErrors = 0;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se detectó voz — tocá el ícono del micrófono cuando quieras seguir.')),
        );
      }
      return;
    }
    await Future.delayed(const Duration(milliseconds: 800));
    if (mounted && !_listening) await _startListening();
  }

  static const _muteCommandPhrases = [
    'silenciar', 'silencio', 'apagar el parlante', 'apagá el parlante',
    'apagar audio', 'apagá el audio', 'dejá de hablar', 'deja de hablar',
    'no hables', 'mutear', 'apagar la voz', 'apagá la voz',
    'apagar el sonido', 'apagá el sonido',
  ];

  bool _isMuteCommand(String text) {
    final t = text.toLowerCase();
    return _muteCommandPhrases.any(t.contains);
  }

  /// Pedido explícito del usuario: poder decir "quiero terminar acá,
  /// sigo después" (por voz o tipeado) en cualquier punto del
  /// cuestionario, sin tener que ir a tocar el ícono de "Guardar y
  /// salir" — dispara EXACTAMENTE el mismo diálogo de confirmación
  /// (ver _confirmSaveAndExit), nunca guarda directo sin confirmar,
  /// para no cortar la entrevista por un falso positivo del reconocedor.
  static const _exitCommandPhrases = [
    'guardar y salir', 'quiero salir', 'quiero terminar', 'terminar por ahora',
    'termino por ahora', 'sigo despues', 'sigo después', 'continuo despues',
    'continúo después', 'despues sigo', 'después sigo', 'salir de aca',
    'salir de aquí', 'salir de acá', 'dejarlo aca', 'dejarlo acá',
    'lo dejo aca', 'lo dejo acá', 'terminar aca', 'terminar acá',
    'continuar mas tarde', 'continuar más tarde', 'seguimos despues',
    'seguimos después',
    // Bug real reportado en vivo: "podemos terminar ahora y continuar
    // en otro momento" no matcheaba ninguna variante de arriba — se
    // le mandaba tal cual a la IA en vez de cortar la charla.
    'terminar ahora', 'termino ahora', 'terminemos ahora',
    'paramos aca', 'paramos aquí', 'paramos acá',
    'cortamos aca', 'cortamos aquí', 'cortamos acá',
    'en otro momento', 'otro momento', 'otro rato',
    'continuar en otro', 'seguir en otro', 'retomar en otro',
    'retomamos despues', 'retomamos después', 'retomar despues', 'retomar después',
    // Bug real reportado en vivo: decir solo "cerrar" o "terminar" (sin
    // ninguna otra palabra) no matcheaba nada de lo de arriba — el
    // pedido quedaba esperando una respuesta del servidor en vez de
    // cerrarse al toque. Estas dos son literalmente las palabras que
    // usó el usuario.
    'cerrar', 'cerrá', 'terminar', 'termino',
  ];

  /// Bug real reportado en vivo: la lista de frases exactas de arriba no
  /// cubría pedidos naturales como "grabá lo registrado hasta el
  /// momento" (ni "grabar" ni esa construcción estaban en la lista) —
  /// se le mandaba tal cual a la IA, que no tiene forma de garantizar
  /// nada por sí sola y seguía preguntando. Se agrega un segundo chequeo
  /// más amplio: un verbo de guardar/grabar/terminar/salir junto con una
  /// referencia a "lo ya contestado", sin depender de una frase exacta.
  static const _exitVerbs = ['guard', 'grab', 'termin', 'salir', 'salgo', 'dejar', 'dejo'];
  static const _exitReferences = [
    'hasta ahora', 'hasta aca', 'hasta acá', 'hasta aqui', 'hasta aquí',
    'hasta el momento', 'lo que tengo', 'lo que hay', 'lo que conteste',
    'lo que contesté', 'lo registrado', 'lo cargado', 'lo que llevo',
  ];

  bool _isExitCommand(String text) {
    final t = text.toLowerCase();
    if (_exitCommandPhrases.any(t.contains)) return true;
    final hasVerb = _exitVerbs.any(t.contains);
    final hasReference = _exitReferences.any(t.contains);
    return hasVerb && hasReference;
  }

  /// Para que se pueda desactivar el modo manos libres 100% por voz, sin
  /// tocar la pantalla (pedido explícito del usuario).
  Future<void> _handleMuteCommand() async {
    setState(() => _voiceReplyEnabled = false);
    await _speak('Listo, dejé de leer en voz alta. Podés reactivarlo tocando el ícono de parlante.');
  }

  /// Voz más natural: bajamos un poco la velocidad respecto del default
  /// del motor (sonaba "cortada"/apurada) y probamos con una voz de
  /// mejor calidad si el dispositivo tiene alguna instalada para
  /// español, antes de resignarnos al voice picker automático del SO.
  Future<void> _configureTts() async {
    await _tts.setLanguage('es-AR');
    await _tts.setSpeechRate(_voiceDouble('assistant.tts_speech_rate', 0.55));
    await _tts.setPitch(_voiceDouble('assistant.tts_pitch', 1.0));
    await _tts.setVolume(1.0);
    // Sin esto, `await _tts.speak(...)` vuelve apenas el motor encola el
    // audio (no cuando termina de leer) — necesario para poder
    // encadenar "terminá de hablar A → recién ahí hablá B" con awaits
    // simples en vez de depender solo del completion handler.
    await _tts.awaitSpeakCompletion(true);
    try {
      final voices = await _tts.getVoices as List<dynamic>?;
      if (voices == null) return;
      final spanish = voices
          .whereType<Map>()
          .where((v) => (v['locale'] as String? ?? '').toLowerCase().startsWith('es'))
          .toList();
      if (spanish.isEmpty) return;
      final preferred = spanish.firstWhere(
        (v) => (v['locale'] as String? ?? '').toLowerCase() == 'es-ar',
        orElse: () => spanish.firstWhere(
          (v) => (v['locale'] as String? ?? '').toLowerCase().startsWith('es-'),
          orElse: () => spanish.first,
        ),
      );
      await _tts.setVoice({
        'name': preferred['name'] as String,
        'locale': preferred['locale'] as String,
      });
    } catch (_) {
      // Si falla la selección de voz, seguimos con la voz por defecto del idioma.
    }
  }

  /// Toque manual del ícono de micrófono — a diferencia de _startListening
  /// (encadenado solo después de hablar), acá un toque estando activo
  /// SIEMPRE corta, sin importar si se llegó a escuchar algo.
  Future<void> _toggleListening() async {
    final available = _speechAvailable || await (_speechInitFuture ?? Future.value(false));
    if (!available || !mounted) return;
    if (_listening) {
      // Marca que este stop es manual — el onResult que dispare abajo
      // tiene que enviar lo acumulado en vez de seguir escuchando en
      // silencio (ver _manualStop más abajo).
      _manualStop = true;
      _cancelListenWatchdog();
      await _speech.stop();
      setState(() => _listening = false);
      return;
    }
    _consecutiveMicErrors = 0;
    await _startListening();
  }

  /// Texto ya confirmado de sesiones de escucha anteriores dentro de la
  /// MISMA respuesta — ver el bug documentado en onResult más abajo.
  String _accumulatedSpeech = '';
  bool _manualStop = false;

  /// Bug real reportado en vivo, confirmado con logcat: a mitad de UNA
  /// misma sesión de escucha (sin que dispare onStatus ni finalResult),
  /// el reconocedor de Android a veces reinicia su hipótesis — el
  /// campo "words" vuelve a "" (o se achica) y arranca de cero una
  /// frase nueva. Antes esto perdía en silencio lo que ya se había
  /// dicho (ej. "sí quiero agregar" desaparecía si la persona hacía
  /// una pausa breve a mitad de la oración) — solo se guardaba texto
  /// en _accumulatedSpeech cuando la sesión terminaba del todo.
  /// _lastPartial guarda el último "words" visto de la sesión actual
  /// para poder detectar este reinicio y rescatar el texto antes de
  /// que se pierda.
  String _lastPartial = '';

  /// A diferencia del botón "Guardar y salir" (que sí pide confirmar
  /// con un diálogo, porque un toque puede ser accidental), decir la
  /// frase completa por voz/texto YA es en sí mismo confirmar — guarda
  /// directo, sin un diálogo de más que rompería el modo manos libres.
  Future<void> _handleExitCommand() async {
    if (_voiceReplyEnabled) await _speak('Listo, guardo lo que contestaste hasta ahora.');
    await _confirmAllPending();
  }

  void _submitRecognizedText(String text) {
    if (_isExitCommand(text)) {
      _controller.clear();
      _handleExitCommand();
    } else if (_isMuteCommand(text)) {
      _controller.clear();
      _handleMuteCommand();
    } else if (_interviewComplete) {
      _controller.clear();
      _handleFinalConfirmation(text);
    } else {
      _send();
    }
  }

  /// Bug real reportado en vivo (modo Estructurado, que responde mucho
  /// más rápido que el Clásico al no llamar a OpenAI en cada turno):
  /// _onSpeechFinished podía disparar el arranque automático del
  /// micrófono ANTES de que _speech.initialize() terminara de resolver
  /// (_speechAvailable todavía en false en ese instante exacto), y
  /// como nada reintentaba después, el modo manos libres quedaba mudo
  /// para siempre. Ahora se espera la MISMA future de inicialización
  /// en vez de confiar en el booleano ya asentado.
  /// Bug real reportado en vivo: "se queda escuchando sin responder"
  /// (comparado con el asistente de ayuda de la app). Causa: cuando ya
  /// hay texto acumulado de una pausa anterior, este método se vuelve a
  /// llamar para CONFIRMAR que la persona terminó, y esa segunda vuelta
  /// espera el mismo pauseFor largo antes de mandar la respuesta — se
  /// siente trabado. Se probó acortar esa segunda espera (parámetro
  /// `confirmingEnd`, pauseFor de 1s) pero eso quedó POR DEBAJO del piso
  /// de 1-3s que Android impone (ver más abajo) y rompió el
  /// reconocimiento — volvió "el micrófono no responde" que ya se había
  /// arreglado antes. Revertido: sigue pendiente encontrar una forma de
  /// acortar esa espera sin tocar pauseFor por debajo del piso del SO.
  Future<void> _startListening() async {
    if (_listening) {
      debugPrint('[MIC] _startListening: ya estaba escuchando, no-op');
      return;
    }
    final available = _speechAvailable || await (_speechInitFuture ?? Future.value(false));
    debugPrint('[MIC] _startListening: available=$available structured=${widget.structuredModel}');
    if (!available || !mounted || _listening) return;
    // Bug real reportado en vivo: "a veces me deja de escuchar y tengo
    // que apagar y volver a encender el micrófono" — nuestro booleano
    // _listening puede decir "no está escuchando" mientras el plugin
    // nativo todavía tiene una sesión de reconocimiento colgada de un
    // intento anterior (glitch de audio/foco), y listen() sobre una
    // sesión así no arranca de verdad. cancel() es no-op si ya está
    // libre, así que no tiene costo hacerlo siempre antes de escuchar.
    if (_speech.isListening) {
      debugPrint('[MIC] _startListening: plugin ya tenía una sesión activa, cancelando antes de reintentar');
      await _speech.cancel();
    }
    setState(() => _listening = true);
    _armListenWatchdog();
    try {
      await _speech.listen(
        listenOptions: stt.SpeechListenOptions(
          localeId: 'es_AR',
          // dictation (no confirmation, pensado para frases cortas) cortaba
          // antes de que la persona terminara de describir un antecedente.
          listenMode: stt.ListenMode.dictation,
          // Android impone un piso de 1-3s que esto no puede bajar del
          // todo — ambos valores vienen de Parámetros de la app (admin-web).
          // Bug real reportado en vivo: bajar esto a 1s por debajo de ese
          // piso documentado para "confirmar silencio" más rápido
          // (intento anterior) rompió el reconocimiento — volvió el
          // error "el micrófono no responde" que ya se había arreglado
          // antes. Revertido: pauseFor siempre usa el valor configurado,
          // sea o no la vuelta de confirmación.
          pauseFor: Duration(seconds: _voiceInt('assistant.tts_pause_seconds', 3)),
          listenFor: Duration(seconds: _voiceInt('assistant.tts_listen_seconds', 60)),
        ),
        onResult: (result) {
          debugPrint('[MIC] onResult: final=${result.finalResult} words="${result.recognizedWords}" '
              'confidence=${result.confidence} accumulated="$_accumulatedSpeech" lastPartial="$_lastPartial"');
          // Cualquier callback prueba que la sesión sigue viva — reinicia
          // la cuenta regresiva del watchdog (ver su comentario arriba).
          if (result.finalResult) {
            _cancelListenWatchdog();
          } else {
            _armListenWatchdog();
          }
          final words = result.recognizedWords;

          // Bug real reportado en vivo, confirmado con logcat: a mitad
          // de UNA misma sesión (sin onStatus ni finalResult de por
          // medio) el reconocedor a veces reinicia su hipótesis — words
          // vuelve a "" o se achica y arranca una frase nueva. Antes
          // esto perdía en silencio lo ya dicho ("sí quiero agregar"
          // desaparecía si había una pausa breve a mitad de la frase).
          //
          // Bug real reportado en vivo (segunda vuelta): comparar con
          // startsWith() era demasiado sensible — el reconocedor ajusta
          // mayúsculas/tildes de palabras YA dichas todo el tiempo
          // (ej. "ola" -> "Hola"), y eso también deja de "empezar
          // igual" sin ser un reinicio real — quedaba enganchado
          // plegando de más y nunca llegaba a un silencio limpio para
          // enviar. Ahora solo cuenta como reinicio si la cantidad de
          // PALABRAS bajó de verdad (un simple reacomodo de texto no
          // pierde palabras, solo les cambia la forma).
          final lastWordCount = _lastPartial.trim().isEmpty ? 0 : _lastPartial.trim().split(RegExp(r'\s+')).length;
          final wordCount = words.trim().isEmpty ? 0 : words.trim().split(RegExp(r'\s+')).length;
          if (_lastPartial.isNotEmpty && wordCount < lastWordCount) {
            _accumulatedSpeech = _accumulatedSpeech.isEmpty
                ? _lastPartial
                : '$_accumulatedSpeech $_lastPartial';
          }
          _lastPartial = words;

          // Muestra lo ya confirmado + lo que se está reconociendo en
          // vivo — antes esto pisaba _controller.text con SOLO la
          // sesión actual, que es justo lo que hacía parecer que se
          // "borraba y arrancaba de cero" al retomar tras una pausa.
          final liveText = _accumulatedSpeech.isEmpty
              ? words
              : '$_accumulatedSpeech $words';
          setState(() => _setControllerText(liveText));

          if (result.finalResult) {
            setState(() => _listening = false);
            _lastPartial = '';
            // OJO: freshText acá es lo de ESTA sesión nomás (no
            // liveText) — necesario para distinguir "esta sesión no
            // trajo nada nuevo" (silencio real, puede haber que
            // finalizar lo ya acumulado) de "esta sesión sí trajo
            // texto" (seguir acumulando). Lo plegado por el reset de
            // arriba ya quedó en _accumulatedSpeech, no se pierde.
            final freshText = words.trim();
            final wasManualStop = _manualStop;
            _manualStop = false;

            if (freshText.isEmpty) {
              if (_accumulatedSpeech.isNotEmpty) {
                // Ya había algo de una pausa anterior y esta vez sí hubo
                // silencio real (nada nuevo) — recién acá se toma como
                // la respuesta completa.
                final text = _accumulatedSpeech;
                _accumulatedSpeech = '';
                _setControllerText(text);
                _consecutiveMicErrors = 0;
                _submitRecognizedText(text);
                return;
              }
              if (_voiceReplyEnabled) _handleSilenceTimeout();
              return;
            }

            // Bug real reportado en vivo: al pausar a mitad de una
            // respuesta más larga ("cardiopatía congénita" ... pausa ...
            // "el 10 de enero de 2020"), Android corta la sesión de
            // reconocimiento por el pauseFor configurado y la entrega
            // como "final" — antes se mandaba directo, perdiendo lo que
            // faltaba decir y arrancando de cero en la sesión siguiente.
            // Ahora se acumula y se sigue escuchando EN SILENCIO (sin
            // hablar nada, sin contar como error) — recién se envía
            // cuando una sesión vuelve sin nada nuevo (silencio real) o
            // cuando el usuario corta a mano con el ícono.
            _accumulatedSpeech = _accumulatedSpeech.isEmpty
                ? freshText
                : '$_accumulatedSpeech $freshText';
            _setControllerText(_accumulatedSpeech);
            _consecutiveMicErrors = 0;

            if (wasManualStop) {
              final text = _accumulatedSpeech;
              _accumulatedSpeech = '';
              _submitRecognizedText(text);
              return;
            }

            _startListening();
          }
        },
      );
      debugPrint('[MIC] _speech.listen() returned normally');
    } catch (e) {
      debugPrint('[MIC] _speech.listen() threw: $e');
      _cancelListenWatchdog();
      if (mounted) {
        setState(() => _listening = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo activar el micrófono — revisá el permiso en Ajustes.')),
        );
      }
    }
  }

  /// Le saca la lista "Opciones:\n1 - ...\n2 - ..." al texto que se
  /// MUESTRA en el globo — sigue viniendo completa desde el backend
  /// para leerse en voz alta, pero visualmente ya está cubierta por los
  /// botones (ver showOptionButtons), así que mostrarla dos veces era
  /// redundante.
  String _stripOptionsList(String text) {
    final idx = text.indexOf(' Opciones:\n');
    return idx == -1 ? text : text.substring(0, idx).trim();
  }

  List<String>? _optionsFrom(Map<String, dynamic> data) {
    final raw = data['options'];
    if (raw is List && raw.isNotEmpty) return raw.map((e) => e.toString()).toList();
    return null;
  }

  /// Toque de un botón de opción (ver ListView.builder más abajo) —
  /// somete la opción tal cual el usuario hubiese tipeado/dicho su
  /// nombre, mismo camino que cualquier otra respuesta.
  ///
  /// Pedido explícito del usuario: preguntas con una opción catch-all
  /// ("Otra"/"Otro", ej. tipos de diabetes) tienen que pedir la
  /// descripción real — mandar literal "Otra" no dice nada útil ni en
  /// la ficha ni al médico. En vez de tocar el pipeline del backend
  /// (que no distingue esta opción de cualquier otra), la resolvemos
  /// en la UI: tocarla NO envía nada, solo deja el cuadro de texto
  /// listo para que el viajero escriba/diga cuál es — esa respuesta
  /// libre ya cae sola en la interpretación por IA de cualquier otra
  /// respuesta que no matchea una opción fija.
  Future<void> _submitOption(String option) async {
    final normalized = normalizeSpanishAccents(option.trim().toLowerCase());
    if (normalized == 'otra' || normalized == 'otro') {
      _setControllerText('');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Contame cuál — escribilo o decilo por voz.')),
      );
      return;
    }
    _controller.text = option;
    await _send();
  }

  Future<void> _send() async {
    final text = normalizeSpanishAccents(_controller.text.trim());
    if (text.isEmpty || _sending) return;
    // Bug real reportado en vivo: _isExitCommand solo se chequeaba en el
    // camino de voz reconocida (_submitRecognizedText) — un pedido de
    // "guardar y salir" ESCRITO iba directo a la IA, que no puede
    // garantizar nada por su cuenta y seguía preguntando. Mismo chequeo
    // acá, para que escribir o decirlo se comporten igual.
    if (_isExitCommand(text)) {
      _controller.clear();
      await _handleExitCommand();
      return;
    }
    // Mismo criterio que la escucha por voz: en el turno de cierre
    // (interviewComplete), un "sí"/"no" tipeado confirma o corrige TODO
    // en vez de mandarse como una pregunta nueva a la IA.
    if (_interviewComplete) {
      _controller.clear();
      await _handleFinalConfirmation(text);
      return;
    }
    setState(() {
      _messages.add(_ChatMessage(text: text, fromUser: true));
      _sending = true;
      _controller.clear();
    });
    _scrollToBottom();
    try {
      final response = await ApiClient.instance.dio.post(_chatEndpoint, data: {
        'question': text,
        if (_conversationId != null) 'conversationId': _conversationId,
      });
      final data = response.data as Map<String, dynamic>;
      _conversationId = data['conversationId'] as String?;
      final reply = data['reply'] as String;
      final pauseRequested = data['pauseRequested'] as bool? ?? false;
      // Bug real reportado en vivo: "después de que me indique el
      // estudio... no se volvió a habilitar el micrófono". Mismo bug
      // que ya se había encontrado y arreglado en _startConversation
      // (ver comentario ahí) pero nunca se aplicó acá: _sending recién
      // se apagaba en el finally, DESPUÉS de esperar a que termine de
      // hablar — y _onSpeechFinished (el que prende el micrófono solo)
      // exige `!_sending` en el momento justo en que termina de hablar,
      // que es ANTES de que este finally llegue a correr. Se apaga acá,
      // antes de hablar, para que el arranque automático nunca se salte.
      setState(() {
        _messages.add(_ChatMessage(text: reply, fromUser: false, options: _optionsFrom(data)));
        _interviewComplete = data['interviewComplete'] as bool? ?? false;
        _paused = pauseRequested;
        _sending = false;
      });
      debugPrint('[MIC] _send: reply="$reply" voiceReplyEnabled=$_voiceReplyEnabled structured=${widget.structuredModel}');
      if (_voiceReplyEnabled) await _speak(reply);
      // Bug real reportado en vivo: cuando la IA detecta que el usuario
      // quiso cerrar/pausar (wantsToPause), el backend ya guardó todo
      // — pero acá se quedaba mostrando una barra con un botón "Cerrar"
      // que había que tocar a mano, y eso se sentía como que la app
      // "quedaba esperando" en vez de cerrar. Igual que
      // _confirmAllPending, si ya se guardó, se vuelve solo a la
      // pantalla principal.
      if (pauseRequested && mounted) Navigator.of(context).pop();
    } catch (e) {
      final errorText = _errorMessage(e, 'No pude responder ahora — probá de nuevo en un momento.');
      setState(() {
        _messages.add(_ChatMessage(text: errorText, fromUser: false));
      });
      // Sin esto, en modo manos libres un error de red deja el diálogo en
      // silencio total — sin nada que dispare el próximo _startListening.
      if (_voiceReplyEnabled) _speak(errorText);
    } finally {
      if (mounted) setState(() => _sending = false);
      _scrollToBottom();
    }
  }

  /// Pedido explícito del usuario: nada se confirma antecedente por
  /// antecedente — al llegar al cierre de la entrevista (interviewComplete
  /// en true) se confirma TODO lo anotado en esta conversación en un
  /// solo request/transacción (ver AIService.confirmAllProposals).
  Future<void> _confirmSaveAndExit() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Guardar y salir?'),
        content: const Text(
          'Se guarda todo lo que ya contestaste hasta ahora en tu Historial de Salud, '
          'aunque no hayas terminado todas las preguntas.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Guardar y salir')),
        ],
      ),
    );
    if (confirmed == true) await _confirmAllPending();
  }

  Future<void> _confirmAllPending() async {
    final conversationId = _conversationId;
    if (conversationId == null || _confirmingAll) return;
    setState(() => _confirmingAll = true);
    try {
      final response = await ApiClient.instance.dio.post(
        '/me/health-assistant/conversations/$conversationId/confirm-all',
      );
      final data = response.data as Map<String, dynamic>;
      final confirmedCount = (data['results'] as List? ?? []).length;
      final skipped = (data['skipped'] as List? ?? []).cast<Map<String, dynamic>>();
      if (!mounted) return;

      // Pedido explícito del usuario: "con solo decir diabetes tipo 2 la
      // IA le podría preguntar usted tiene registrado diabetes tipo 1, es
      // correcto el cambio" — cuando el backend detecta que lo que se
      // acaba de decir choca con un antecedente ya cargado para la misma
      // pregunta (ver AIService.ConditionConflictError), en vez de
      // perderlo en silencio se le pregunta acá mismo si quiere
      // reemplazarlo, y de ser así se aplica con el mismo PATCH que ya
      // usa la corrección manual desde el Formulario.
      final conflicts = skipped.where((s) => s['conflict'] != null).toList();
      final plainSkips = skipped.where((s) => s['conflict'] == null).toList();
      var updatedCount = 0;
      final unresolvedReasons = <String>[];
      for (final item in conflicts) {
        final conflict = item['conflict'] as Map<String, dynamic>;
        final existingName = conflict['existingConditionName'] as String;
        final newName = conflict['newConditionName'] as String;
        if (!mounted) break;
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('¿Confirmás el cambio?'),
            content: Text('Ya tenés "$existingName" registrada. ¿Confirmás que ahora es "$newName"?'),
            actions: [
              TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('No')),
              FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Sí, reemplazar')),
            ],
          ),
        );
        if (confirmed == true) {
          try {
            await ApiClient.instance.dio.patch(
              '/me/health-assistant/conditions/${conflict['existingConditionId']}',
              data: {
                'conditionName': newName,
                if (conflict['newDateRaw'] != null) 'dateRaw': conflict['newDateRaw'],
              },
            );
            updatedCount++;
          } catch (_) {
            unresolvedReasons.add(item['reason'] as String);
          }
        } else {
          unresolvedReasons.add(item['reason'] as String);
        }
      }
      unresolvedReasons.addAll(plainSkips.map((s) => s['reason'] as String));
      if (!mounted) return;

      // Bug real reportado en vivo: si UN dato chocaba con algo ya
      // cargado (ej. "diabetes" propuesta dos veces en la misma charla),
      // se perdía TODO lo demás sin explicación. Ahora eso ya no pasa
      // (ver AIService.confirmAllProposals) — como mucho ese ítem puntual
      // queda afuera, y acá se lo avisamos con claridad en vez de un
      // error críptico.
      final buffer = StringBuffer(
        confirmedCount == 0 && updatedCount == 0 && unresolvedReasons.isEmpty
            ? 'Ya estaba todo guardado.'
            : 'Listo, guardé todo en tu Historial de Salud.',
      );
      if (updatedCount > 0) {
        buffer.write(' Actualicé $updatedCount dato${updatedCount == 1 ? '' : 's'} que ya tenías cargado.');
      }
      if (unresolvedReasons.isNotEmpty) {
        final reasons = unresolvedReasons.toSet().join(', ');
        buffer.write(' Menos esto, que ya lo tenías cargado: $reasons.');
      }
      final confirmText = buffer.toString();
      setState(() {
        _messages.add(_ChatMessage(text: confirmText, fromUser: false));
        _interviewComplete = false;
        _paused = false;
      });
      _scrollToBottom();
      if (_voiceReplyEnabled) await _speak(confirmText);
      // Pedido explícito del usuario: al confirmar, guardar todo Y
      // cerrar la pantalla — antes se quedaba mostrando el mensaje de
      // éxito sin volver atrás, como si no hubiese terminado nada.
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_errorMessage(e, 'No se pudo confirmar — probá de nuevo.'))),
        );
      }
    } finally {
      if (mounted) setState(() => _confirmingAll = false);
    }
  }

  // Bug real encontrado en vivo: "\b" (límite de palabra) no reconoce
  // "í" como parte de la palabra en Dart/JS (no es unicode-aware por
  // default), así que "\bs[ií]\b" nunca matcheaba "sí" sola — el
  // usuario decía "sí" y quedaba sin registrar. Se saca el acento del
  // texto reconocido ANTES de matchear, así el patrón queda todo ASCII
  // y "\b" funciona normal.
  // Bug real reportado en vivo: "confirmar"/"confirmar todo" no
  // matcheaba (solo estaba "confirmo", primera persona) — el viajero
  // quedaba trabado en el loop de "¿Confirmamos todo? Decime sí o no."
  // sin entender por qué. Pedido explícito: cualquier afirmación
  // razonable tiene que cerrar la entrevista, no solo "sí".
  static final _affirmativeRegex = RegExp(
    r'\b(si|ok|okay|dale|correcto|correcta|confirmo|confirmar|confirmado|confirma|acepto|aceptar|acepta|exacto|afirmativo|listo|asi es|agregalo|agreguemos|agregar|guardalo|guardar|guarda|anotalo|anotar|vale|eso es|va|perfecto|todo bien|todo correcto|dale que si)\b',
  );
  static final _negativeRegex = RegExp(
    r'\b(no|cancelar|cancela|rechazar|rechazo|incorrecto|incorrecta|negativo|para nada|todavia no|espera|esperá|no todavia|no quiero|no asi)\b',
  );

  static const _accentMap = {
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n',
  };

  String _stripAccents(String text) {
    final buffer = StringBuffer();
    for (final rune in text.runes) {
      final char = String.fromCharCode(rune);
      buffer.write(_accentMap[char] ?? char);
    }
    return buffer.toString();
  }

  bool _isAffirmative(String text) => _affirmativeRegex.hasMatch(_stripAccents(text.toLowerCase()));
  bool _isNegative(String text) => _negativeRegex.hasMatch(_stripAccents(text.toLowerCase()));

  /// Confirmación final (voz o texto, mismo criterio) — pedido explícito
  /// del usuario: "confirmar por medio de la voz con un ok o un si o un
  /// correcto". Solo se llama cuando _interviewComplete está en true (la
  /// IA ya cerró la entrevista y pidió la única confirmación), nunca
  /// durante preguntas normales de la charla.
  Future<void> _handleFinalConfirmation(String text) async {
    if (_isAffirmative(text)) {
      await _confirmAllPending();
    } else if (_isNegative(text)) {
      const reply = 'Dale, contame qué querés corregir.';
      setState(() {
        _interviewComplete = false;
        _paused = false;
        _messages.add(_ChatMessage(text: reply, fromUser: false));
      });
      _scrollToBottom();
      if (_voiceReplyEnabled) await _speak(reply);
    } else {
      // Ambiguo: no se pierde nada, se vuelve a preguntar.
      const reply = '¿Confirmamos todo? Decime sí o no.';
      setState(() => _messages.add(_ChatMessage(text: reply, fromUser: false)));
      _scrollToBottom();
      if (_voiceReplyEnabled) await _speak(reply);
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  /// Pedido explícito del usuario: "si quedan cosas pendientes de
  /// confirmación, debería salir un popup... así no quedan cosas
  /// pendientes de confirmar" — antes, salir a mitad de la charla
  /// (botón atrás) dejaba lo dicho como PENDING_CONFIRMATION para
  /// siempre, sin guardarse ni avisar. Bug real reportado en vivo que
  /// motivó esto: una corrección de un análisis quedó así, invisible.
  Future<void> _handleBackPress() async {
    if (_conversationId == null) {
      if (mounted) Navigator.of(context).pop();
      return;
    }
    List<dynamic> pending = [];
    try {
      final response = await ApiClient.instance.dio
          .get('/me/health-assistant/conversations/$_conversationId/pending');
      pending = response.data as List<dynamic>;
    } catch (_) {
      // Si falla la consulta, mejor dejar salir que trabar al usuario
      // sin poder volver a la pantalla principal.
    }
    if (pending.isEmpty) {
      if (mounted) Navigator.of(context).pop();
      return;
    }
    if (!mounted) return;
    final action = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Tenés datos sin confirmar'),
        content: SizedBox(
          width: double.maxFinite,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Todavía no se guardó esto — ¿qué querés hacer?'),
              const SizedBox(height: 12),
              for (final p in pending)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text('• ${(p as Map<String, dynamic>)['label']}'),
                ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop('cancel'), child: const Text('Seguir acá')),
          TextButton(onPressed: () => Navigator.of(ctx).pop('discard'), child: const Text('Descartar')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop('confirm'), child: const Text('Confirmar todo')),
        ],
      ),
    );

    if (action == 'confirm') {
      // Pedido explícito del usuario: al confirmar desde este popup no
      // debería volver al chat a decir "listo, guardé todo" — eso
      // tiene sentido en "Guardar y salir" (una acción deliberada
      // desde la charla), pero acá ya se confirmó desde el popup
      // mismo; solo hace falta guardar y volver, sin mensaje ni voz de
      // más. Por eso NO reusa _confirmAllPending (que sí hace eso).
      try {
        await ApiClient.instance.dio.post('/me/health-assistant/conversations/$_conversationId/confirm-all');
      } catch (_) {
        // Si falla, no cerramos como si nada — el usuario puede reintentar.
        return;
      }
      if (mounted) Navigator.of(context).pop();
    } else if (action == 'discard') {
      try {
        await ApiClient.instance.dio.post('/me/health-assistant/conversations/$_conversationId/reject-all');
      } catch (_) {
        // Si el descarte falla en el servidor, mejor no cerrar la
        // pantalla como si nada — el usuario puede reintentar.
        return;
      }
      if (mounted) Navigator.of(context).pop();
    }
    // 'cancel' o diálogo cerrado sin elegir: se queda en la pantalla.
  }

  @override
  Widget build(BuildContext context) {
    return PopScope<Object?>(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        _handleBackPress();
      },
      child: Scaffold(
      appBar: AppBar(
        title: Text(widget.structuredModel ? 'Asistente de salud (Estructurado)' : 'Asistente de salud'),
        actions: [
          // Pedido explícito del usuario: "siempre una opción para poder
          // guardar y salir desde cualquier punto que uno esté de las
          // preguntas" — no depende de llegar al cierre natural de la
          // entrevista: reusa confirmAllProposals tal cual (ya guarda
          // solo lo que esté pendiente en esta conversación, sin
          // importar cuántas preguntas quedaron sin contestar).
          if (_conversationId != null)
            IconButton(
              icon: const Icon(Icons.save_outlined),
              tooltip: 'Guardar y salir',
              onPressed: _confirmingAll ? null : _confirmSaveAndExit,
            ),
          IconButton(
            icon: Icon(_voiceReplyEnabled ? Icons.volume_up : Icons.volume_off),
            tooltip: _voiceReplyEnabled ? 'Dejar de leer las respuestas en voz alta' : 'Leer las respuestas en voz alta',
            onPressed: () {
              setState(() => _voiceReplyEnabled = !_voiceReplyEnabled);
              if (!_voiceReplyEnabled) {
                _tts.stop();
                _audioPlayer.stop();
                if (_listening) {
                  _speech.stop();
                  setState(() => _listening = false);
                }
              }
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(12),
              itemCount: _messages.length,
              itemBuilder: (context, i) {
                final m = _messages[i];
                // Pedido explícito del usuario: poder tocar las opciones
                // en pantalla en vez de solo decirlas/tipearlas — solo en
                // el ÚLTIMO mensaje del asistente, para no dejar botones
                // de una pregunta ya contestada colgando en el historial.
                final showOptionButtons = !m.fromUser && m.options != null && i == _messages.length - 1 && !_sending;
                // Bug real reportado en vivo: se mostraba la lista de
                // opciones dos veces — como texto suelto adentro del
                // globo Y como botones debajo. El texto con "Opciones:"
                // sigue viniendo del backend porque hace falta completo
                // para leerlo en voz alta (ver _speak(reply) en _send) —
                // acá solo se recorta lo visual, nunca lo que se lee.
                final bubbleText = m.options != null ? _stripOptionsList(m.text) : m.text;
                return Column(
                  crossAxisAlignment: m.fromUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                  children: [
                    Align(
                      alignment: m.fromUser ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                        decoration: BoxDecoration(
                          color: m.fromUser ? Theme.of(context).colorScheme.primaryContainer : Colors.grey.shade200,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(bubbleText),
                      ),
                    ),
                    if (showOptionButtons)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: m.options!
                              .map((o) => OutlinedButton(
                                    onPressed: () => _submitOption(o),
                                    child: Text(o),
                                  ))
                              .toList(),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
          if (_interviewComplete && !_paused)
            Container(
              width: double.infinity,
              color: Theme.of(context).colorScheme.secondaryContainer,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(
                children: [
                  const Expanded(
                    child: Text('¿Confirmamos todo lo que hablamos?'),
                  ),
                  TextButton(
                    onPressed: _confirmingAll ? null : () => setState(() => _interviewComplete = false),
                    child: const Text('Corregir algo'),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: _confirmingAll ? null : _confirmAllPending,
                    child: _confirmingAll
                        ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Confirmar todo'),
                  ),
                ],
              ),
            )
          else if (_paused)
            Container(
              width: double.infinity,
              color: Theme.of(context).colorScheme.secondaryContainer,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(
                children: [
                  const Expanded(child: Text('Guardado. Podés volver cuando quieras.')),
                  FilledButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Cerrar'),
                  ),
                ],
              ),
            ),
          if (_sending) const LinearProgressIndicator(),
          if (_listening || _speaking)
            Container(
              width: double.infinity,
              color: Theme.of(context).colorScheme.primaryContainer,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Row(
                children: [
                  SizedBox(
                    width: 14,
                    height: 14,
                    child: _listening
                        ? Icon(Icons.circle, size: 10, color: Theme.of(context).colorScheme.error)
                        : const CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: 8),
                  Text(_listening ? 'Escuchando…' : 'Hablando…'),
                  const Spacer(),
                  if (_speaking)
                    TextButton(
                      onPressed: () {
                        _tts.stop();
                        _audioPlayer.stop();
                      },
                      child: const Text('Detener'),
                    ),
                ],
              ),
            ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    scrollController: _inputScrollController,
                    decoration: InputDecoration(
                      hintText: _listening ? 'Escuchando…' : 'Contame tus antecedentes…',
                      border: const OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                if (_speechAvailable)
                  IconButton(
                    icon: Icon(_listening ? Icons.mic : Icons.mic_none),
                    color: _listening ? Theme.of(context).colorScheme.error : null,
                    tooltip: _listening ? 'Detener' : 'Hablar',
                    onPressed: _toggleListening,
                  ),
                IconButton(icon: const Icon(Icons.send), onPressed: _send),
              ]),
            ),
          ),
        ],
      ),
      ),
    );
  }
}
