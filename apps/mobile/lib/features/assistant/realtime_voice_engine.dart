import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../../core/api_client.dart';

/// Pedido explícito del usuario: "esos errores no los debería dar ya
/// que el usuario puede no entender inglés... no debería pasar, la app
/// lo debería resolver reintentando 2 o 3 veces... esto no sucede con
/// aplicaciones como Facebook o Instagram". Nunca se le muestra al
/// viajero el texto crudo de una excepción (DioException, stack
/// traces en inglés) — se reintenta unas veces primero, y si sigue
/// fallando, este es el único mensaje que puede llegar a verse.
const String kRealtimeFriendlyErrorMessage =
    'Hubo un problema de conexión. Probá de nuevo en unos minutos.';

/// Un 4xx (ej. "no encontré ese antecedente", datos inválidos) es un
/// error de LÓGICA, no de conexión — reintentarlo devuelve exactamente
/// lo mismo tres veces y solo suma demora. Reintentar tiene sentido
/// para cortes de red momentáneos: sin respuesta del servidor, o un
/// 5xx.
///
/// Bug real reportado en vivo: "Hubo un problema de conexión" al
/// arrancar la charla, sin haber hablado nada todavía — logcat mostró
/// un 429 (demasiadas conexiones seguidas) de OpenAI al negociar el
/// SDP. Un 429 no es un error de lógica como un 400/404 — es
/// justamente lo opuesto, la señal más clara de que SÍ conviene
/// reintentar (con la pausa creciente que ya usa withRealtimeNetworkRetry).
bool _isRetryableNetworkError(Object e) {
  if (e is DioException) {
    final status = e.response?.statusCode;
    if (status == 429) return true;
    if (status != null && status >= 400 && status < 500) return false;
  }
  return true;
}

/// Reintenta una llamada de red hasta [attempts] veces (con una pausa
/// corta entre intentos) antes de darse por vencida — mismo pedido de
/// arriba: la mayoría de las fallas de red son momentáneas, y
/// reintentar en silencio evita mostrarle un error al viajero por un
/// corte de señal de un instante.
Future<T> withRealtimeNetworkRetry<T>(Future<T> Function() action, {int attempts = 3}) async {
  for (var attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await action();
    } catch (e) {
      if (attempt == attempts || !_isRetryableNetworkError(e)) rethrow;
      debugPrint('[REALTIME] reintentando (intento $attempt de $attempts) tras: $e');
      await Future.delayed(_retryDelay(attempt, e));
    }
  }
  throw StateError('unreachable');
}

/// Bug real reportado en vivo: tras varias rondas de prueba seguidas,
/// OpenAI empezó a devolver 429 en la negociación de audio (límite de
/// conexiones por minuto) y la pausa fija de 1-2s entre reintentos no
/// alcanzaba ni de cerca para que esa ventana de un minuto se libere —
/// se agotaban los 3 intentos en ~5 segundos. Si la respuesta trae el
/// header "Retry-After" (que OpenAI sí manda en sus 429), se respeta
/// tal cual viene; si no, para un 429 se espera bastante más que para
/// un corte de red común (15s en vez de 1-2s) porque la causa es una
/// ventana de tiempo, no una reconexión momentánea.
Duration _retryDelay(int attempt, Object e) {
  if (e is DioException && e.response?.statusCode == 429) {
    final retryAfterHeader = e.response?.headers.value('retry-after');
    final retryAfterSeconds = retryAfterHeader != null ? int.tryParse(retryAfterHeader) : null;
    if (retryAfterSeconds != null) return Duration(seconds: retryAfterSeconds);
    return const Duration(seconds: 15);
  }
  return Duration(seconds: attempt);
}

/// Bug real reportado en vivo: "aparece Indio y Chino en el medio como
/// si nada... el idioma que debe estar seteado es Español" — con audio
/// ambiguo/silencioso, la transcripción del viajero a veces alucina
/// texto en otro idioma (confirmado en vivo: una frase completa en
/// japonés, "Namaste.", "Thank you.", "Bye.", "Bye-bye.") como si el
/// viajero lo hubiera dicho, y cada una de esas alucinaciones dispara
/// una interrupción real de la IA a mitad de frase. El cambio de
/// modelo + "language: es" en createRealtimeSession reduce esto de
/// raíz, pero acá queda un freno extra del lado del celular: nunca
/// mostrar como si fuera algo que dijo el viajero un texto en otro
/// alfabeto, o una de las frases cortas que ya se vieron alucinadas en
/// vivo — mejor perder alguna transcripción real rarísima (alguien
/// diciendo "bye" en serio) que mostrar caos en pantalla.
bool _looksLikeHallucinatedTranscript(String text) {
  final nonLatinScript = RegExp(r'[぀-ヿ一-鿿ऀ-ॿ؀-ۿЀ-ӿ]');
  if (nonLatinScript.hasMatch(text)) return true;
  const knownHallucinations = {
    'thank you', 'thank you.', 'bye', 'bye.', 'bye-bye', 'bye-bye.',
    'goodbye', 'goodbye.', 'namaste', 'namaste.',
  };
  return knownHallucinations.contains(text.toLowerCase());
}

/// Un antecedente que la IA guardó durante la charla (tool-call
/// save_health_proposal, ver openai.provider.ts). Mismo shape que
/// AIProposalCandidate del backend.
class RealtimeProposalEvent {
  RealtimeProposalEvent({
    required this.proposalType,
    required this.confidence,
    required this.data,
  });

  final String proposalType;
  final double confidence;
  final Map<String, dynamic> data;
}

/// Motor nuevo del modo Clásico — voz en tiempo real (OpenAI Realtime
/// API vía WebRTC), pedido explícito del usuario tras varios bugs de
/// voz en vivo del motor de texto anterior (speech_to_text +
/// audioplayers + flutter_tts encadenados a mano): cuelgues de
/// reconocimiento a mitad de frase, ventana de silencio de 2-3s que
/// perdía preguntas de seguimiento genuinas, correcciones perdidas al
/// cerrar. Acá no hay nada de eso para programar a mano: el audio va
/// y viene por UNA sola conexión WebRTC directo con OpenAI (mic → acá,
/// voz de la IA → acá mismo, sin pasar por nuestro backend), y OpenAI
/// mismo detecta cuándo la persona terminó de hablar (server_vad) — no
/// hay pauseFor/listenFor que ajustar ni watchdog de cuelgue que armar.
///
/// El backend nunca ve el audio: solo emite un token efímero de corta
/// duración (ver AIService.createRealtimeSession) que este motor usa
/// para conectarse directo — la API key real de OpenAI nunca sale del
/// servidor.
class RealtimeVoiceEngine {
  RealtimeVoiceEngine({
    this.structuredModel = false,
    this.onAssistantTranscriptDelta,
    this.onAssistantTurnDone,
    this.onUserTranscript,
    this.onProposal,
    this.onCloseInterview,
    this.onDiscardInterview,
    this.onRecordEdited,
    this.onError,
    this.onConnected,
    this.onDisconnected,
    this.onProcessingPause,
    this.onProcessingPauseStart,
    this.onProcessingPauseEnd,
  });

  /// Pedido explícito del usuario: "por qué no hacemos que el
  /// Estructurado pase a usar el mismo motor de voz continua que el
  /// Clásico" — mismo motor, misma conexión WebRTC, la única
  /// diferencia es de qué endpoint se pide la sesión efímera (ver
  /// connect() más abajo): Estructurado arma un guion fijo con las
  /// preguntas de ai.interview_questions en vez de la charla libre de
  /// Clásico (ver AIService.createStructuredRealtimeSession).
  final bool structuredModel;

  /// Texto de la IA a medida que lo va diciendo (para mostrar el
  /// burbujeo en pantalla) — no dispara guardado, solo UI.
  final void Function(String delta)? onAssistantTranscriptDelta;
  /// Pedido explícito del usuario: "debería funcionar como ChatGPT
  /// cuando hablamos... eso lo debería mostrar en pantalla" — lo que
  /// dijo el VIAJERO, transcripto (ver session.audio.input.transcription
  /// en createRealtimeSession — sin eso, la Realtime API nunca
  /// transcribe el lado del viajero, solo lo entiende para responder).
  /// Llega de una sola vez (no en deltas) cuando termina de hablar.
  final void Function(String text)? onUserTranscript;
  /// La IA terminó de hablar este turno — cerrar la burbuja actual y
  /// esperar la próxima (sin esto, deltas de turnos distintos se
  /// pegarían todos en una sola burbuja).
  final void Function()? onAssistantTurnDone;
  final void Function(RealtimeProposalEvent proposal)? onProposal;
  /// Equivalente a interviewComplete=true del modelo de texto — avisa
  /// que hay que llamar a POST .../conversations/:id/confirm-all
  /// (mismo endpoint que ya usan Clásico/Estructurado/Formulario).
  final void Function()? onCloseInterview;
  /// Bug real reportado en vivo: el viajero pidió cerrar SIN guardar
  /// nada, y la charla se cerró guardando igual — antes no existía
  /// forma de que la IA cerrara sin disparar el guardado. Avisa que
  /// hay que llamar a POST .../conversations/:id/reject-all (mismo
  /// endpoint que ya usa el popup "Descartar" de las otras modalidades).
  final void Function()? onDiscardInterview;
  /// Pedido explícito del usuario: poder corregir o eliminar por voz un
  /// antecedente ya cargado — avisa a la UI qué se hizo (action:
  /// "UPDATE"/"DELETE", name: nombre del antecedente afectado) para
  /// mostrar el mismo tipo de chip de confirmación que onProposal.
  final void Function(String action, String recordName)? onRecordEdited;
  final void Function(String message)? onError;
  final void Function()? onConnected;
  final void Function()? onDisconnected;
  /// Pedido explícito del usuario: cuando el viajero cuenta muchos
  /// antecedentes muy seguido y la IA necesita una pausa para
  /// procesarlo todo (ver _checkForEmptyResponse), no basta con
  /// resolverlo solo puertas adentro — el viajero tiene que enterarse
  /// de que está pasando algo (no que se colgó) y de CÓMO ayudar a que
  /// vaya más fluido, sin mencionar límites técnicos de la IA. Se
  /// dispara una sola vez por charla (ver _processingPauseNotified) —
  /// no tiene sentido repetir el aviso si vuelve a pasar en la misma
  /// conversación, ya se explicó una vez.
  final void Function()? onProcessingPause;
  /// Bug real reportado en vivo: "tardó mucho para corregirla... no me
  /// dijo nada que estaba procesando el cambio" — el aviso de arriba
  /// (onProcessingPause) es una nota fija en el historial de la charla,
  /// que puede quedar arriba del scroll mientras la persona mira el
  /// indicador de "Escuchando" de abajo, siempre visible, esperando que
  /// pase algo. Estos dos callbacks marcan el INICIO y el FIN real de
  /// la espera (no solo el aviso educativo de una vez) para que la
  /// pantalla pueda cambiar ESE indicador mientras dura.
  final void Function()? onProcessingPauseStart;
  final void Function()? onProcessingPauseEnd;

  RTCPeerConnection? _pc;
  RTCDataChannel? _dc;
  MediaStream? _localStream;
  String? _conversationId;
  /// Bug real reportado en vivo: "no grabó nada en la base de datos"
  /// — confirmado con logcat que el evento
  /// response.function_call_arguments.done SOLO trae call_id +
  /// arguments, NUNCA el nombre de la función — el nombre
  /// ("save_health_proposal"/"close_realtime_interview") solo viene
  /// en response.output_item.added, cuando el tool-call arranca. Se
  /// guarda acá esa asociación para poder recuperarla cuando llegan
  /// los argumentos completos.
  final Map<String, String> _pendingCallNames = {};
  /// Defensa adicional para el mismo bug de arriba: si algo dispara
  /// connect() una segunda vez mientras la primera conexión todavía
  /// se está armando (ej. un doble toque de "Reintentar"), la
  /// segunda pisaba _pc/_dc de la primera a mitad de camino — acá se
  /// ignora la llamada repetida en vez de arriesgar la carrera.
  bool _connecting = false;

  /// Bug real reportado en vivo: "Called in wrong state: closed" al
  /// aplicar la respuesta SDP de OpenAI — pasó en medio de una tanda de
  /// respuestas cortadas por el presupuesto de tokens del minuto,
  /// donde se disparó un connect() nuevo (reconexión) mientras el
  /// anterior todavía tenía un setRemoteDescription en vuelo. El await
  /// del POST a OpenAI puede tardar un segundo entero — si en el medio
  /// se llama a disconnect()+connect() de nuevo (pantalla que se cierra
  /// y reabre, o un reintento), esa respuesta vieja llega tarde y
  /// termina aplicándose sobre una conexión que ya no es la actual, ya
  /// cerrada. Un contador de "generación" identifica de qué intento de
  /// connect() es cada callback async — si cambió antes de que
  /// terminara, se descarta en silencio en vez de tocar el estado
  /// actual.
  int _generation = 0;

  String? get conversationId => _conversationId;
  bool get isConnected => _pc != null;

  Future<void> connect() async {
    if (_connecting) {
      debugPrint('[REALTIME] connect: ya hay una conexión en curso, ignorando llamada repetida');
      return;
    }
    _connecting = true;
    final myGeneration = ++_generation;
    _responseActive = false;
    _pendingResponseCreate = false;
    try {
      debugPrint('[REALTIME] connect: pidiendo sesión efímera...');
      final sessionEndpoint = structuredModel
          ? '/me/health-assistant/realtime-session-structured'
          : '/me/health-assistant/realtime-session';
      final sessionResponse = await withRealtimeNetworkRetry(
        () => ApiClient.instance.dio.post(sessionEndpoint),
      );
      _conversationId = sessionResponse.data['conversationId'] as String;
      final clientSecret = sessionResponse.data['clientSecret'] as String;
      debugPrint('[REALTIME] connect: sesión ok, conversationId=$_conversationId');

      if (myGeneration != _generation) {
        debugPrint('[REALTIME] connect: superado por otra conexión mientras se pedía la sesión — se descarta');
        return;
      }

      final pc = await createPeerConnection({
        'iceServers': [
          {'urls': 'stun:stun.l.google.com:19302'},
        ],
      });
      if (myGeneration != _generation) {
        debugPrint('[REALTIME] connect: superado por otra conexión mientras se armaba el peer connection — se descarta');
        await pc.close();
        return;
      }
      _pc = pc;

      pc.onIceConnectionState = (state) {
        debugPrint('[REALTIME] onIceConnectionState: $state');
        if (myGeneration != _generation) return;
        if (state == RTCIceConnectionState.RTCIceConnectionStateFailed ||
            state == RTCIceConnectionState.RTCIceConnectionStateClosed) {
          onDisconnected?.call();
        }
      };
      // Bug real reportado en vivo: "no sé qué pasó que quedó
      // colgado... no entiendo por qué cerró la conversación" —
      // confirmado con logcat que la conexión SÍ se cerraba
      // (FlutterWebRTCPlugin: onConnectionChangeCLOSED), pero
      // onDisconnected nunca se disparaba porque solo estaba
      // escuchando onIceConnectionState — el evento de cierre real
      // vino por este otro callback (RTCPeerConnectionState, no
      // RTCIceConnectionState), que nunca estaba conectado.
      // Bug real reportado en vivo ("tarda en responder", "no grabó
      // nada", y un error al arrancar): confirmado con logcat que
      // "Disconnected" fue un corte breve de red (~4s) del que WebRTC
      // se recuperó SOLO (volvió a Connected sin que nadie hiciera
      // nada) — pero acá se trataba igual que Failed/Closed, así que
      // la pantalla ya mostraba error y probablemente se tocó
      // "Reintentar" DURANTE la reconexión automática, generando una
      // sesión nueva que chocó con la vieja todavía viva
      // ("Called in wrong state: closed" al hacer setRemoteDescription).
      // Ahora solo Failed/Closed cuentan como corte real — Disconnected
      // se tolera en silencio, es normal en WebRTC y suele
      // autorecuperarse en segundos.
      pc.onConnectionState = (state) {
        debugPrint('[REALTIME] onConnectionState: $state');
        if (myGeneration != _generation) return;
        if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
            state == RTCPeerConnectionState.RTCPeerConnectionStateClosed) {
          onDisconnected?.call();
        }
      };

      // Bug real reportado en vivo: "empezó diciendo... no le dije
      // nada y avanzó" (el saludo se cortaba solo apenas arrancaba) y
      // "la voz sale muy metálica" — con audio: true a secas,
      // flutter_webrtc arma las constraints de audio como
      // "optional" (ver logcat: FlutterWebRTCPlugin), que Android
      // puede llegar a ignorar. En modo altavoz (parlante, no
      // auricular) el micrófono está mucho más cerca de la salida de
      // audio — sin cancelación de eco firme, el micrófono capta la
      // propia voz de la IA saliendo del parlante y el detector de
      // voz del servidor lo interpreta como que la persona empezó a
      // hablar, cortando la respuesta a mitad de frase. Achicando el
      // req a estas tres constraints explícitas (en vez de audio:
      // true genérico) para pedirlas más en firme, no como opcionales.
      _localStream = await navigator.mediaDevices.getUserMedia({
        'audio': {
          'echoCancellation': true,
          'noiseSuppression': true,
          'autoGainControl': true,
        },
        'video': false,
      });
      for (final track in _localStream!.getAudioTracks()) {
        await pc.addTrack(track, _localStream!);
      }
      // Bug real reportado en vivo: "no sale la voz del asistente" en
      // modo Clásico (WebRTC), pero sí en Estructurado (que reproduce
      // con audioplayers, un stream de audio normal de MEDIA). Android
      // arranca cualquier sesión WebRTC en modo "comunicación"
      // (auricular/llamada), NO en el parlante/altavoz normal — sin
      // forzarlo, la voz de la IA sale (si sale) por el auricular,
      // volumen bajísimo y pegado al oído, invisible para cualquier
      // forma de escuchar el celular que no sea tenerlo contra la
      // oreja. setSpeakerphoneOn (requiere MODIFY_AUDIO_SETTINGS, ya
      // declarado en el manifest para esto mismo) fuerza el audio de
      // ESTA llamada WebRTC por el parlante, el mismo camino que ya
      // usa Estructurado.
      await Helper.setSpeakerphoneOn(true);

      final dc = await pc.createDataChannel('oai-events', RTCDataChannelInit());
      _dc = dc;
      dc.onMessage = (RTCDataChannelMessage message) {
        if (!message.isBinary) _handleEvent(message.text);
      };
      // Bug real reportado en vivo: "el usuario no sabe qué hacer" —
      // sin esto, la sesión queda escuchando en silencio hasta que la
      // persona hable primero (comportamiento default de Realtime).
      // Apenas el canal de datos abre, se dispara la primera respuesta
      // (el saludo — ver la instrucción "PRIMER TURNO" del prompt) sin
      // esperar ningún audio del viajero.
      dc.onDataChannelState = (RTCDataChannelState state) {
        debugPrint('[REALTIME] onDataChannelState: $state');
        if (state == RTCDataChannelState.RTCDataChannelOpen) {
          _requestResponseCreate();
        }
      };

      final offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      debugPrint('[REALTIME] connect: offer creada, posteando SDP a OpenAI...');

      // Bug real reportado en vivo: "Hubo un problema de conexión" apenas
      // arrancar, sin ninguna charla — confirmado con logcat que OpenAI
      // devolvió 429 (demasiadas conexiones en poco tiempo, esperable
      // tras varias rondas de prueba seguidas) al negociar el SDP, y
      // esta llamada puntual nunca se reintentaba (a diferencia del
      // resto de las llamadas de red del motor). Un 429 es justo el caso
      // que withRealtimeNetworkRetry existe para cubrir: un corte
      // momentáneo, no un error de lógica — reintentar solo.
      final sdpClient = Dio();
      final callResponse = await withRealtimeNetworkRetry(() => sdpClient.post<String>(
        'https://api.openai.com/v1/realtime/calls',
        data: offer.sdp,
        options: Options(
          headers: {
            'Authorization': 'Bearer $clientSecret',
            'Content-Type': 'application/sdp',
          },
          responseType: ResponseType.plain,
        ),
      ));
      final answerSdp = callResponse.data;
      if (answerSdp == null || answerSdp.isEmpty) {
        onError?.call('OpenAI no devolvió una respuesta SDP válida.');
        return;
      }
      if (myGeneration != _generation) {
        // Ver el comentario de _generation más arriba: este es
        // justamente el punto donde antes se veía "Called in wrong
        // state: closed" — la respuesta de OpenAI llegó tarde, después
        // de que otra conexión (o un disconnect()) ya reemplazó a esta.
        debugPrint('[REALTIME] connect: superado por otra conexión justo antes de aplicar la respuesta SDP — se descarta');
        await pc.close();
        return;
      }
      await pc.setRemoteDescription(RTCSessionDescription(answerSdp, 'answer'));
      debugPrint('[REALTIME] connect: WebRTC conectado');
      onConnected?.call();
    } catch (e) {
      debugPrint('[REALTIME] connect: excepción $e');
      onError?.call(kRealtimeFriendlyErrorMessage);
    } finally {
      _connecting = false;
    }
  }

  // Nombres de evento verificados con logcat en vivo el 20/08 — varios
  // de los que se habían asumido por la documentación no eran los que
  // esta sesión realmente manda (ver comentarios puntuales abajo).
  static bool _isHandledEvent(String? type) => const {
        'response.created',
        'response.output_audio_transcript.delta',
        'response.output_audio_transcript.done',
        'response.output_item.added',
        'response.function_call_arguments.done',
        'response.done',
        'conversation.item.input_audio_transcription.completed',
        'rate_limits.updated',
        'output_audio_buffer.started',
        'output_audio_buffer.stopped',
        'error',
      }.contains(type);

  /// Bug real reportado en vivo: "Conversation already has an active
  /// response in progress" — cuando el viajero mencionaba varios datos
  /// juntos (ej. peso, altura y grupo sanguíneo), el modelo a veces
  /// sigue hablando SOLO después de recibir el resultado de un
  /// tool-call (la propia respuesta activa continúa: agradece y hace la
  /// siguiente pregunta), sin necesitar que el cliente la empuje. Antes
  /// se mandaba `response.create` a ciegas después de CADA tool-call
  /// reconocido, sin importar si la respuesta actual ya seguía en
  /// curso — eso chocaba con la respuesta todavía activa.
  ///
  /// Bug real reportado en vivo (regresión del arreglo anterior): con
  /// el criterio de "si hay una respuesta activa, no mandes nada", la
  /// charla se quedaba colgada para siempre — confirmado con logcat que
  /// una respuesta que SOLO trae un tool-call (sin texto/audio) termina
  /// (response.done) prácticamente enseguida después de
  /// function_call_arguments.done (~300ms), así que en el caso más
  /// común (un antecedente por turno) todavía está "activa" en el
  /// instante exacto en que se reconoce el tool-call — se salteaba el
  /// response.create SIEMPRE, y como después nadie más lo pedía, la IA
  /// nunca continuaba. Ahora en vez de saltearlo se DIFIERE: si hay una
  /// respuesta activa en ese momento, se guarda que hace falta pedir
  /// una nueva, y se manda recién cuando esa respuesta termina de
  /// verdad (response.done) — nunca se pierde el pedido, y nunca se
  /// manda mientras hay una en curso.
  bool _responseActive = false;
  bool _pendingResponseCreate = false;

  /// Bug real reportado en vivo: cargando varios antecedentes seguidos
  /// (ej. 3 medicamentos + 3 enfermedades en una sola charla), la
  /// conversación se quedaba "colgada" en silencio — logcat confirmó
  /// que el motivo NO era la misma carrera que ya se corrigió arriba,
  /// sino que el presupuesto de tokens del minuto de la sesión (evento
  /// rate_limits.updated, límite 40.000) se agotaba a mitad de la
  /// carga y la última respuesta volvía completamente vacía (sin
  /// audio, sin texto, sin tool-call) — el modelo literalmente no tenía
  /// con qué generar nada más ese minuto. Antes eso se trataba como una
  /// respuesta normal y nadie volvía a pedir que continuara. Ahora se
  /// detecta (ningún "output") y se reintenta solo, dándole un respiro
  /// al presupuesto.
  ///
  /// Bug real reportado en vivo (vuelta 2): con una espera fija de 5s
  /// y 2 reintentos (10s en total), el presupuesto real (confirmado en
  /// logcat: quedaban 50 tokens de 40.000, con reset_seconds≈60) no
  /// llegaba a liberarse a tiempo — los 2 reintentos volvían vacíos
  /// igual y la charla se quedaba trabada de nuevo, solo que un poco
  /// más tarde. rate_limits.updated (evento no manejado hasta ahora,
  /// solo logueado) SÍ trae el tiempo real que falta para que se
  /// libere ("reset_seconds") — se guarda acá cada vez que llega, y el
  /// reintento espera ESE tiempo (con un margen chico) en vez de un
  /// número fijo a ciegas.
  int _consecutiveEmptyResponses = 0;
  double? _lastTokenResetSeconds;

  /// Bug real reportado en vivo: "el cierre fue muy rápido, no dejó
  /// que termine de hablar... quedó como que lo cerró cortando lo que
  /// estaba diciendo" — confirmado con logcat: cuando el modelo dice
  /// una frase de despedida Y llama a close_realtime_interview en la
  /// MISMA respuesta, response.output_audio.done (el SERVIDOR terminó
  /// de generar el audio) llega casi al instante, pero eso NO significa
  /// que el CELULAR ya terminó de reproducirlo — el audio viaja por el
  /// track de WebRTC con su propio buffer, aparte de estos eventos del
  /// canal de datos. El evento que sí refleja que la reproducción real
  /// terminó es output_audio_buffer.stopped, y antes nadie lo esperaba
  /// — se llamaba a disconnect() apenas llegaba el tool-call de cierre,
  /// cortando el audio de despedida a mitad de frase. Se trackea acá
  /// para que la pantalla pueda esperarlo antes de cortar la conexión.
  bool _audioPlaying = false;
  Completer<void>? _audioStoppedCompleter;

  Future<void> waitForCurrentAudioToFinish() async {
    if (!_audioPlaying) return;
    final completer = Completer<void>();
    _audioStoppedCompleter = completer;
    // Piso de seguridad: si por algún motivo el evento nunca llega
    // (ej. la conexión ya se cortó sola), no te quedes esperando para
    // siempre — 15s alcanza de sobra para cualquier frase de despedida.
    await completer.future.timeout(const Duration(seconds: 15), onTimeout: () {});
  }
  /// Pedido explícito del usuario: avisarle al viajero (una sola vez
  /// por charla, sin mencionar "tokens" ni límites técnicos) que
  /// contar muchos antecedentes muy seguido hace que la IA necesite
  /// una pausa — ver onProcessingPause.
  bool _processingPauseNotified = false;

  void _notifyProcessingPauseIfNeeded() {
    if (_processingPauseNotified) return;
    _processingPauseNotified = true;
    onProcessingPause?.call();
  }

  void _trackRateLimits(Map<String, dynamic> event) {
    final rateLimits = event['rate_limits'] as List?;
    if (rateLimits == null) return;
    for (final entry in rateLimits) {
      final map = entry as Map<String, dynamic>?;
      if (map?['name'] == 'tokens') {
        _lastTokenResetSeconds = (map?['reset_seconds'] as num?)?.toDouble();
      }
    }
  }

  bool _pauseIndicatorActive = false;

  void _checkForEmptyResponse(Map<String, dynamic> event) {
    final responseObj = event['response'] as Map<String, dynamic>?;
    final output = responseObj?['output'] as List?;
    if (output == null || output.isNotEmpty) {
      _consecutiveEmptyResponses = 0;
      if (_pauseIndicatorActive) {
        _pauseIndicatorActive = false;
        onProcessingPauseEnd?.call();
      }
      return;
    }
    _consecutiveEmptyResponses++;
    if (_consecutiveEmptyResponses > 2) {
      debugPrint('[REALTIME] respuesta vacía repetida — se deja de reintentar para no quedar en loop');
      if (_pauseIndicatorActive) {
        _pauseIndicatorActive = false;
        onProcessingPauseEnd?.call();
      }
      return;
    }
    // Margen de 2s arriba del tiempo real que informó OpenAI — si por
    // algún motivo no llegó ningún rate_limits.updated todavía, 8s de
    // piso (más que los 5s fijos de antes, para dar más margen igual).
    final waitSeconds = ((_lastTokenResetSeconds ?? 6) + 2).clamp(8, 65).round();
    debugPrint('[REALTIME] respuesta vacía (presupuesto de tokens del minuto agotado) — reintentando en ${waitSeconds}s (intento $_consecutiveEmptyResponses de 2)');
    _notifyProcessingPauseIfNeeded();
    if (!_pauseIndicatorActive) {
      _pauseIndicatorActive = true;
      onProcessingPauseStart?.call();
    }
    final myGeneration = _generation;
    Future.delayed(Duration(seconds: waitSeconds), () {
      // Si mientras tanto se desconectó o se reconectó (ver
      // _generation), esta charla ya no existe más — no tiene sentido
      // pedirle continuación a un canal de datos que ya no es este.
      if (_dc != null && myGeneration == _generation) _requestResponseCreate();
    });
  }

  void _handleEvent(String raw) {
    Map<String, dynamic> event;
    try {
      event = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    final type = event['type'] as String?;
    // Log de TODOS los eventos, no solo los que manejamos — sin esto
    // no hay forma de confirmar los nombres exactos de evento que
    // realmente manda esta sesión (bugs reportados en vivo de
    // pantalla vacía / nada guardado hacen sospechar que algún nombre
    // de evento no es el esperado).
    debugPrint('[REALTIME] event: $type${_isHandledEvent(type) ? '' : ' (sin manejar) $raw'}');
    switch (type) {
      // Ver el comentario de _responseActive más arriba.
      case 'response.created':
        _responseActive = true;
        break;
      // Bug real reportado en vivo ("pantalla vacía"): el nombre real
      // es response.output_audio_transcript.delta, NO
      // response.audio_transcript.delta como se había asumido.
      case 'response.output_audio_transcript.delta':
        final delta = event['delta'] as String?;
        if (delta != null && delta.isNotEmpty) onAssistantTranscriptDelta?.call(delta);
        break;
      // Marca el cierre de CADA mensaje hablado (para la UI, ver
      // onAssistantTurnDone) — no confundir con response.done, que
      // cierra la respuesta completa del modelo (puede incluir texto/
      // audio Y tool-calls) y sí llega, se usa para el uso de tokens.
      case 'response.output_audio_transcript.done':
        onAssistantTurnDone?.call();
        break;
      // Acá es donde llega el NOMBRE de la función (save_health_proposal/
      // close_realtime_interview) — response.function_call_arguments.done
      // (más abajo) nunca lo trae, solo call_id + arguments.
      case 'response.output_item.added':
        final item = event['item'] as Map<String, dynamic>?;
        if (item != null && item['type'] == 'function_call') {
          final callId = item['call_id'] as String?;
          final name = item['name'] as String?;
          if (callId != null && name != null) _pendingCallNames[callId] = name;
        }
        break;
      // Bug real reportado en vivo ("no grabó nada en la base de
      // datos"): este evento SOLO trae call_id + arguments, nunca
      // "name" — antes se buscaba event['name'] acá y siempre daba
      // null, así que la condición nunca matcheaba y no se guardaba
      // nada. El nombre se recupera del mapa armado arriba.
      case 'response.function_call_arguments.done':
        _handleFunctionCall(event);
        break;
      // Bug real reportado en vivo: "el costo de hoy sale en cero" —
      // nada capturaba el uso de tokens del motor Realtime. response.done
      // (a diferencia de response.output_audio_transcript.done, que
      // marca el fin de UN mensaje hablado) es el cierre de cada
      // respuesta completa del modelo, y trae el objeto "usage" con el
      // detalle de tokens de esa respuesta — se postea tal cual llega,
      // sin esperar a que termine la conversación.
      case 'response.done':
        _responseActive = false;
        // Bug real reportado en vivo: "salió cualquier cosa" en la
        // transcripción — cuando el viajero interrumpe a la IA a mitad
        // de frase (barge-in), el servidor trunca/cancela esa
        // respuesta y response.output_audio_transcript.done (que es lo
        // ÚNICO que cerraba la burbuja del chat, ver más arriba) a
        // veces nunca llega para la respuesta cancelada. La burbuja
        // quedaba "abierta" para siempre, y los deltas del SIGUIENTE
        // turno se pegaban al final de ese texto viejo en vez de
        // arrancar una burbuja nueva — dos respuestas distintas
        // mezcladas en un mismo globo. response.done SÍ llega siempre
        // (se usa también para el costo, ver _handleUsage más abajo),
        // así que se fuerza el cierre acá también — si ya se había
        // cerrado por el evento normal, este llamado no hace nada.
        onAssistantTurnDone?.call();
        // Ver el comentario de _pendingResponseCreate más arriba: si
        // durante esta respuesta se reconoció un tool-call y no se pudo
        // pedir la continuación en el momento (porque esta respuesta
        // todavía seguía activa), acá es donde recién es seguro
        // mandarla.
        if (_pendingResponseCreate) {
          _pendingResponseCreate = false;
          _requestResponseCreate();
        } else {
          _checkForEmptyResponse(event);
        }
        _handleUsage(event);
        break;
      // Trae el tiempo real que falta para que se libere el presupuesto
      // de tokens del minuto — ver _checkForEmptyResponse más arriba.
      case 'rate_limits.updated':
        _trackRateLimits(event);
        break;
      // Ver el comentario de waitForCurrentAudioToFinish más arriba —
      // esto es lo que de verdad indica que el celular terminó de
      // reproducir el audio, a diferencia de response.output_audio.done
      // (que solo dice que el SERVIDOR terminó de generarlo).
      case 'output_audio_buffer.started':
        _audioPlaying = true;
        break;
      case 'output_audio_buffer.stopped':
        _audioPlaying = false;
        _audioStoppedCompleter?.complete();
        _audioStoppedCompleter = null;
        break;
      // Pedido explícito del usuario: "debería funcionar como ChatGPT
      // cuando hablamos... eso lo debería mostrar en pantalla" — lo
      // que dijo el VIAJERO, no solo lo que contesta la IA. Llega de
      // una sola vez (transcripción vía gpt-4o-mini-transcribe, ver
      // session.audio.input.transcription en createRealtimeSession),
      // no en deltas.
      case 'conversation.item.input_audio_transcription.completed':
        final transcript = event['transcript'] as String?;
        if (transcript != null && transcript.trim().isNotEmpty) {
          final trimmed = transcript.trim();
          if (_looksLikeHallucinatedTranscript(trimmed)) {
            debugPrint('[REALTIME] transcripción descartada por sospecha de alucinación: "$trimmed"');
          } else {
            // Pedido explícito del usuario (bug real: "reintenté grabar
            // y dio un error" sin poder saber después QUÉ dijo para
            // que dispare discard_realtime_interview) — antes esto no
            // quedaba en el log para eventos manejados (ver
            // _isHandledEvent), así que no había forma de diagnosticar
            // en retrospectiva qué frase entendió mal el modelo.
            debugPrint('[REALTIME] viajero dijo: "$trimmed"');
            onUserTranscript?.call(trimmed);
            // Bug real reportado en vivo: el dashboard de Consumo de
            // IA mostraba "Mensajes hoy: 0" con conversaciones activas
            // reales — lo que dice el viajero acá solo se mostraba en
            // pantalla, nunca se guardaba del lado del servidor como
            // mensaje (a diferencia de Clásico/Estructurado). Fire-
            // and-forget: nunca debe trabar ni demorar la charla de
            // voz en curso si falla (misma lógica que _postUsage).
            unawaited(_postUserMessage(trimmed));
          }
        }
        break;
      // Pedido explícito del usuario: nunca mostrarle al viajero un
      // error técnico crudo en inglés (ej. "Conversation already has
      // an active response in progress: resp_..." — el que se vio en
      // vivo antes del arreglo de _pendingResponseCreate). Estos
      // errores vienen directo de OpenAI, no del backend propio, así
      // que no hay forma de traducirlos — se loguea el original para
      // diagnóstico, pero al viajero solo le llega el mensaje genérico.
      case 'error':
        final message = (event['error'] as Map?)?['message'] as String?;
        debugPrint('[REALTIME] evento "error" de OpenAI: $message');
        onError?.call(kRealtimeFriendlyErrorMessage);
        break;
    }
  }

  void _handleUsage(Map<String, dynamic> event) {
    final usage = (event['response'] as Map?)?['usage'] as Map?;
    if (usage == null || _conversationId == null) return;
    final inputDetails = usage['input_token_details'] as Map?;
    final outputDetails = usage['output_token_details'] as Map?;
    final textIn = ((inputDetails?['text_tokens'] as num?) ?? 0).toInt();
    final audioIn = ((inputDetails?['audio_tokens'] as num?) ?? 0).toInt();
    final cachedIn = ((inputDetails?['cached_tokens'] as num?) ?? 0).toInt();
    final textOut = ((outputDetails?['text_tokens'] as num?) ?? 0).toInt();
    final audioOut = ((outputDetails?['audio_tokens'] as num?) ?? 0).toInt();
    final totalIn = ((usage['input_tokens'] as num?) ?? (textIn + audioIn)).toInt();
    final totalOut = ((usage['output_tokens'] as num?) ?? (textOut + audioOut)).toInt();
    if (totalIn == 0 && totalOut == 0) return;
    // Fire-and-forget — nunca debe interrumpir la charla en curso si
    // falla (ej. sin señal un instante); es solo para el dashboard de
    // costo, no para el flujo conversacional.
    unawaited(_postUsage(textIn, audioIn, cachedIn, textOut, audioOut, totalIn, totalOut));
  }

  Future<void> _postUsage(
    int textIn, int audioIn, int cachedIn, int textOut, int audioOut, int totalIn, int totalOut,
  ) async {
    try {
      await ApiClient.instance.dio.post(
        '/me/health-assistant/realtime-usage',
        data: {
          'conversationId': _conversationId,
          'textInputTokens': textIn,
          'audioInputTokens': audioIn,
          'cachedInputTokens': cachedIn,
          'textOutputTokens': textOut,
          'audioOutputTokens': audioOut,
          'totalInputTokens': totalIn,
          'totalOutputTokens': totalOut,
        },
      );
    } catch (e) {
      debugPrint('[REALTIME] _handleUsage: error posteando uso: $e');
    }
  }

  Future<void> _postUserMessage(String text) async {
    if (_conversationId == null) return;
    try {
      await ApiClient.instance.dio.post(
        '/me/health-assistant/realtime-user-message',
        data: {'conversationId': _conversationId, 'text': text},
      );
    } catch (e) {
      debugPrint('[REALTIME] _postUserMessage: error posteando mensaje: $e');
    }
  }

  // Bug real reportado en vivo ("no grabó nada en la base de datos",
  // repetido en varias rondas): acá se armaba el RealtimeProposalEvent
  // para la UI y se le decía "saved: true" a OpenAI, pero nunca se
  // posteaba nada al backend — el POST a
  // /me/health-assistant/realtime-proposals (que sí existe y
  // funciona) jamás se llamaba desde el celular. Por eso el modelo
  // decía "lo tengo registrado" (el ack local era instantáneo y
  // siempre positivo) mientras la base de datos se quedaba sin una
  // sola fila de ai.proposals. Ahora se posetea de verdad y el "saved"
  // que recibe el modelo refleja si el guardado real funcionó o no.
  Future<void> _handleFunctionCall(Map<String, dynamic> event) async {
    final callId = event['call_id'] as String?;
    final name = callId != null ? _pendingCallNames.remove(callId) : null;
    final argumentsRaw = event['arguments'] as String?;
    if (name == 'save_health_proposal' && argumentsRaw != null) {
      try {
        final args = jsonDecode(argumentsRaw) as Map<String, dynamic>;
        final proposalType = args['proposalType'] as String;
        final confidence = ((args['confidence'] as num?) ?? 0.8).toDouble();
        final data = (args['data'] as Map).cast<String, dynamic>();
        await withRealtimeNetworkRetry(() => ApiClient.instance.dio.post(
          '/me/health-assistant/realtime-proposals',
          data: {
            'conversationId': _conversationId,
            'proposalType': proposalType,
            'confidence': confidence,
            'data': data,
          },
        ));
        onProposal?.call(RealtimeProposalEvent(
          proposalType: proposalType,
          confidence: confidence,
          data: data,
        ));
        _acknowledgeFunctionCall(callId, '{"saved": true}');
      } catch (e) {
        debugPrint('[REALTIME] _handleFunctionCall: error guardando proposal: $e');
        // Bug real reportado en vivo: un JSON cortado a mitad (ej.
        // "diagnosedDate sin cerrar comillas) es la misma señal que
        // _checkForEmptyResponse — el modelo se quedó sin presupuesto
        // de tokens del minuto a mitad de generar los argumentos.
        if (e is FormatException) _notifyProcessingPauseIfNeeded();
        final reason = _isRetryableNetworkError(e) ? 'problema de conexión' : _dioErrorMessage(e);
        _acknowledgeFunctionCall(callId, '{"saved": false, "error": "${reason.replaceAll('"', "'")}"}');
      }
    } else if (name == 'edit_or_delete_health_record' && argumentsRaw != null) {
      // Pedido explícito del usuario: "tenemos que darle al modelo
      // clásico la posibilidad de que el usuario modifique sus
      // antecedentes hablando con la IA" — corregir o eliminar un
      // antecedente YA CARGADO (de esta charla o de una anterior). Si
      // el backend no encuentra el antecedente (matchName no
      // coincide), devuelve un error descriptivo (con lo que sí está
      // cargado) — se lo pasamos tal cual al modelo para que pueda
      // recuperar la charla en vez de asumir que ya lo hizo.
      try {
        final args = jsonDecode(argumentsRaw) as Map<String, dynamic>;
        final result = await withRealtimeNetworkRetry(() => ApiClient.instance.dio.post(
          '/me/health-assistant/realtime-edit-record',
          data: {
            'conversationId': _conversationId,
            'recordType': args['recordType'],
            'matchName': args['matchName'],
            'action': args['action'],
            'data': args['data'],
          },
        ));
        final action = (result.data as Map?)?['action'] as String?;
        final recordName = (result.data as Map?)?['name'] as String?;
        onRecordEdited?.call(action ?? (args['action'] as String), recordName ?? (args['matchName'] as String));
        _acknowledgeFunctionCall(callId, '{"ok": true}');
      } catch (e) {
        final message = _dioErrorMessage(e);
        debugPrint('[REALTIME] _handleFunctionCall: error editando/eliminando antecedente: $message');
        _acknowledgeFunctionCall(callId, '{"ok": false, "error": "${message.replaceAll('"', "'")}"}');
      }
    } else if (name == 'close_realtime_interview') {
      onCloseInterview?.call();
      _acknowledgeFunctionCall(callId, '{"ok": true}');
    } else if (name == 'discard_realtime_interview') {
      onDiscardInterview?.call();
      _acknowledgeFunctionCall(callId, '{"ok": true}');
    }
  }

  /// Extrae el mensaje legible del backend (ej. "No encontré X
  /// cargado. Lo que sí tenés cargado es: Y, Z.") en vez de dejar pasar
  /// el texto crudo de la excepción — así el modelo puede leérselo al
  /// viajero tal cual y recuperar la charla, en vez de solo saber que
  /// "algo falló".
  String _dioErrorMessage(Object e) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map && data['message'] is String) return data['message'] as String;
      if (data is Map && data['message'] is List) return (data['message'] as List).join(' ');
    }
    return e.toString();
  }

  /// Le confirma al modelo que ya procesamos el tool-call — sin esto
  /// se queda "esperando" la respuesta de la función y no sigue
  /// hablando con naturalidad.
  ///
  /// Bug real reportado en vivo: "Conversation already has an active
  /// response in progress" — antes acá SIEMPRE se mandaba
  /// response.create después de reconocer un tool-call, aunque la
  /// respuesta que trajo ese tool-call siguiera activa (puede traer más
  /// de un tool-call antes de terminar). Y el arreglo siguiente
  /// (saltearlo directamente si había una respuesta activa) causó una
  /// regresión peor: la charla se quedaba colgada para siempre, porque
  /// una respuesta que SOLO trae un tool-call termina casi enseguida
  /// (response.done ~300ms después) y en ese momento todavía figuraba
  /// "activa" — se saltéaba SIEMPRE y nadie volvía a pedir que
  /// continuara. Ahora se DIFIERE en vez de saltear — ver
  /// _pendingResponseCreate y el case 'response.done' más arriba.
  ///
  /// Bug real reportado en vivo (regresión de la regresión anterior):
  /// cuando el viajero mencionaba varios antecedentes juntos (ej. 3
  /// medicamentos + 3 enfermedades en una sola charla), el modelo puede
  /// disparar varios tool-calls en respuestas separadas y rapidísimas
  /// — cada guardado es async (espera al backend), así que dos
  /// confirmaciones pueden terminar de procesarse casi al mismo
  /// tiempo. Cada una preguntaba "¿hay una respuesta activa ahora
  /// mismo?" y, si en ESE instante ninguna había llegado todavía
  /// (_responseActive solo se ponía en true al recibir el evento
  /// response.created, que tarda un viaje de ida y vuelta a OpenAI),
  /// las dos veían "no" y las dos mandaban response.create — la
  /// segunda chocaba con la primera ("ya hay una respuesta en curso"),
  /// se perdía sin reintento, y como esa era la única señal para que
  /// el modelo siguiera, la charla quedaba trabada para siempre (caso
  /// real: se guardaron 5 de 6 antecedentes y el sexto, Rosuvastatina,
  /// nunca se llegó a proponer). Ahora _responseActive se marca en true
  /// en el momento mismo en que ACÁ se manda response.create —no
  /// cuando el servidor lo confirma— así que no queda ninguna ventana
  /// en la que dos llamadas atrapen el estado en falso a la vez.
  void _acknowledgeFunctionCall(String? callId, String output) {
    final dc = _dc;
    if (callId == null || dc == null) return;
    dc.send(RTCDataChannelMessage(jsonEncode({
      'type': 'conversation.item.create',
      'item': {
        'type': 'function_call_output',
        'call_id': callId,
        'output': output,
      },
    })));
    _requestResponseCreate();
  }

  /// Pedido explícito del usuario: "una combinación con botones y
  /// escucha real como el Clásico" — para las preguntas de sí/no
  /// (la gran mayoría en Estructurado), agiliza no depender de decirlo
  /// en voz alta en todos los turnos. Manda el texto tal cual lo
  /// mandaría el reconocedor de voz (mismo mecanismo que
  /// _acknowledgeFunctionCall usa para el resultado de una tool: un
  /// conversation.item.create seguido de response.create), así que
  /// para el modelo es indistinguible de que el viajero lo haya dicho.
  /// onUserTranscript se dispara a mano para que la burbuja del chat
  /// lo muestre igual que una respuesta hablada.
  void sendTextAnswer(String text) {
    final dc = _dc;
    if (dc == null) return;
    onUserTranscript?.call(text);
    dc.send(RTCDataChannelMessage(jsonEncode({
      'type': 'conversation.item.create',
      'item': {
        'type': 'message',
        'role': 'user',
        'content': [
          {'type': 'input_text', 'text': text},
        ],
      },
    })));
    _requestResponseCreate();
  }

  void _requestResponseCreate() {
    if (_responseActive) {
      _pendingResponseCreate = true;
      return;
    }
    _responseActive = true;
    _dc?.send(RTCDataChannelMessage(jsonEncode({'type': 'response.create'})));
  }

  Future<void> disconnect() async {
    // Invalida cualquier connect() todavía en vuelo (ver _generation
    // más arriba) — evita que una respuesta SDP que llega tarde se
    // aplique después de que esta conexión ya se cerró a propósito.
    _generation++;
    // Ver el comentario en connect() sobre setSpeakerphoneOn — se
    // desarma acá para no dejar el celular pegado en modo altavoz
    // fuera de la charla (afectaría, por ejemplo, una llamada
    // telefónica normal que reciba después).
    await Helper.setSpeakerphoneOn(false);
    for (final track in _localStream?.getTracks() ?? const <MediaStreamTrack>[]) {
      await track.stop();
    }
    await _localStream?.dispose();
    _localStream = null;
    await _dc?.close();
    _dc = null;
    await _pc?.close();
    _pc = null;
  }
}
