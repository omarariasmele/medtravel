import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../l10n/app_strings.dart';
import 'realtime_voice_engine.dart';

class _RealtimeBubble {
  _RealtimeBubble(this.text, {this.isSystemNote = false, this.fromUser = false, this.isNotice = false})
      : closed = isSystemNote || fromUser || isNotice;
  String text;
  /// true cuando la IA ya terminó de hablar este turno (ver
  /// onAssistantTurnDone) — la próxima delta arranca una burbuja
  /// nueva en vez de seguir pegándose a esta. Las notas de sistema
  /// (isSystemNote) y las burbujas del viajero (fromUser) arrancan
  /// siempre cerradas — nunca se les pega texto de otro turno (a
  /// diferencia de las de la IA, no llegan en deltas).
  bool closed;
  /// Pedido explícito del usuario: "que algo se vaya registrando en
  /// la pantalla para que el usuario vea que se está registrando" —
  /// a diferencia del texto que dice la IA, esto se muestra distinto
  /// (chip chico, no una burbuja de charla) cada vez que se guarda un
  /// antecedente (ver onProposal).
  final bool isSystemNote;
  /// Pedido explícito del usuario: "debería funcionar como ChatGPT
  /// cuando hablamos... eso lo debería mostrar en pantalla" — burbuja
  /// con lo que dijo el VIAJERO (ver onUserTranscript), alineada a la
  /// derecha para distinguirla de lo que dice la IA.
  final bool fromUser;
  /// Pedido explícito del usuario: avisarle (sin hablar de límites
  /// técnicos) que contar muchos antecedentes muy seguido hace que la
  /// IA necesite una pausa, y cómo ayudar a que fluya mejor — visual
  /// distinto del chip verde de confirmación (isSystemNote), para que
  /// no se lea como si algo se hubiera guardado.
  final bool isNotice;
}

Map<String, String> _proposalTypeLabels(String lang) => {
      'CONDITION': AppStrings.forLang(lang, 'realtimeAssistant.proposalCondition'),
      'MEDICATION': AppStrings.forLang(lang, 'realtimeAssistant.proposalMedication'),
      'ALLERGY': AppStrings.forLang(lang, 'realtimeAssistant.proposalAllergy'),
      'SURGERY': AppStrings.forLang(lang, 'realtimeAssistant.proposalSurgery'),
      'VITALS': AppStrings.forLang(lang, 'realtimeAssistant.proposalVitals'),
      'LAB_RESULT': AppStrings.forLang(lang, 'realtimeAssistant.proposalLabResult'),
      'IMPLANT_DEVICE': AppStrings.forLang(lang, 'realtimeAssistant.proposalImplant'),
      'TREATMENT': AppStrings.forLang(lang, 'realtimeAssistant.proposalTreatment'),
    };

String _describeProposal(RealtimeProposalEvent proposal, String lang) {
  final name = proposal.data['conditionName'] ??
      proposal.data['genericName'] ??
      proposal.data['allergenName'] ??
      proposal.data['procedureName'] ??
      proposal.data['deviceName'] ??
      proposal.data['treatmentName'] ??
      proposal.data['labName'];
  final label = _proposalTypeLabels(lang)[proposal.proposalType] ?? proposal.proposalType;
  return name is String && name.isNotEmpty ? '$label: $name' : label;
}

/// Modo Clásico — pantalla nueva, motor de voz en tiempo real (OpenAI
/// Realtime API vía WebRTC). Reemplaza, para el botón "Modo Clásico"
/// de la app, a la implementación de texto anterior en
/// health_assistant_screen.dart — esa pantalla sigue existiendo tal
/// cual (Estructurado la sigue usando sin cambios, y sirve de plan de
/// contingencia: ver router.dart) pero ya no es a la que lleva el
/// botón de Clásico.
///
/// A diferencia del motor anterior, acá no hay nada de
/// pauseFor/listenFor/watchdog de cuelgue para programar a mano: el
/// audio del micrófono y de la respuesta van y vienen por UNA sola
/// conexión WebRTC directo con OpenAI, que detecta sola cuándo la
/// persona terminó de hablar (server_vad).
class RealtimeHealthAssistantScreen extends StatefulWidget {
  const RealtimeHealthAssistantScreen({super.key, this.structuredModel = false});

  /// Pedido explícito del usuario: "por qué no hacemos que el
  /// Estructurado pase a usar el mismo motor de voz continua que el
  /// Clásico" — misma pantalla, mismo motor, solo cambia qué guion
  /// pide el backend (ver RealtimeVoiceEngine.structuredModel).
  final bool structuredModel;

  @override
  State<RealtimeHealthAssistantScreen> createState() => _RealtimeHealthAssistantScreenState();
}

enum _ConnectionState { connecting, connected, saving, saved, discarded, error }

/// Ver el comentario de _pendingRetry más abajo.
enum _PendingRetry { none, save, discard }

class _RealtimeHealthAssistantScreenState extends State<RealtimeHealthAssistantScreen> {
  late final RealtimeVoiceEngine _engine;
  final List<_RealtimeBubble> _bubbles = [];
  final ScrollController _scrollController = ScrollController();
  _ConnectionState _state = _ConnectionState.connecting;
  String? _errorMessage;
  /// Bug real reportado en vivo: "tardó mucho para corregirla... no me
  /// dijo nada que estaba procesando el cambio" — ver
  /// onProcessingPauseStart/End en RealtimeVoiceEngine. A diferencia
  /// del aviso educativo (onProcessingPause, una nota fija en el
  /// historial), esto cambia el indicador de "Escuchando" de abajo —
  /// siempre visible, sin scroll — mientras dura la espera real.
  bool _isProcessingPause = false;
  int _proposalsSaved = 0;
  /// Bug real reportado en vivo: cuando falló el guardado final (confirm-all
  /// tiró un 500), el botón "Reintentar" volvía a arrancar la charla desde
  /// cero (reconectaba la voz) en vez de reintentar el guardado — la
  /// conversación anterior quedaba abandonada con los antecedentes ya
  /// capturados sin confirmar. Y cuando se agregó "cerrar sin guardar",
  /// el mismo bug volvió a aparecer ahí (bool _saveErrorPending no
  /// distinguía "falló guardar" de "falló descartar"). Un enum en vez
  /// de un bool para no repetir el error una tercera vez si se agrega
  /// otra acción de cierre en el futuro.
  _PendingRetry _pendingRetry = _PendingRetry.none;

  /// Bug real reportado en vivo, gravísimo: "no guarda la información,
  /// dice problema técnico" — pero el log del servidor mostraba el
  /// INSERT + COMMIT exitoso cada vez. Causa real: los callbacks de
  /// abajo (onProposal/onRecordEdited/onDisconnected) los dispara el
  /// motor de voz de forma asíncrona, NO durante el build de este
  /// widget — pero usaban context.tr()/context.lang (context.watch por
  /// dentro, ver AppStrings._resolveLang), y Provider tira una
  /// excepción si watch() se llama fuera de build(). Esa excepción
  /// interrumpía RealtimeVoiceEngine._handleFunctionCall justo DESPUÉS
  /// de guardar con éxito pero ANTES de mandar el ack "saved: true" —
  /// caía al catch, que le avisaba a la IA "saved: false" a pesar de
  /// que el dato ya estaba guardado. Con la IA convencida de que nada
  /// se había guardado, terminaba ofreciendo "descartar todo" — lo que
  /// si el viajero aceptaba, BORRABA datos que en realidad sí se habían
  /// guardado bien. context.read (no watch) es seguro en cualquier
  /// lado, incluidos estos callbacks.
  String get _preferredLang => context.read<AuthState>().preferredLang;

  @override
  void initState() {
    super.initState();
    _engine = RealtimeVoiceEngine(
      structuredModel: widget.structuredModel,
      onConnected: () {
        if (!mounted) return;
        setState(() => _state = _ConnectionState.connected);
      },
      onDisconnected: () {
        if (!mounted || _state == _ConnectionState.saved) return;
        final message = AppStrings.forLang(_preferredLang, 'realtimeAssistant.connectionLost');
        setState(() {
          _state = _ConnectionState.error;
          _pendingRetry = _PendingRetry.none;
          _errorMessage = message;
        });
      },
      onError: (message) {
        if (!mounted) return;
        setState(() {
          _state = _ConnectionState.error;
          _pendingRetry = _PendingRetry.none;
          _errorMessage = message;
        });
      },
      onAssistantTranscriptDelta: (delta) {
        if (!mounted) return;
        setState(() {
          if (_bubbles.isNotEmpty && !_bubbles.last.closed) {
            _bubbles.last.text += delta;
          } else {
            _bubbles.add(_RealtimeBubble(delta));
          }
        });
        _scrollToBottom();
      },
      onAssistantTurnDone: () {
        if (!mounted || _bubbles.isEmpty) return;
        setState(() => _bubbles.last.closed = true);
      },
      onUserTranscript: (text) {
        if (!mounted) return;
        setState(() => _bubbles.add(_RealtimeBubble(text, fromUser: true)));
        _scrollToBottom();
      },
      onProposal: (proposal) {
        if (!mounted) return;
        final description = _describeProposal(proposal, _preferredLang);
        setState(() {
          _proposalsSaved++;
          _bubbles.add(_RealtimeBubble('✓ $description', isSystemNote: true));
        });
        _scrollToBottom();
      },
      onCloseInterview: _handleCloseInterview,
      onDiscardInterview: _handleDiscardInterview,
      onProcessingPause: () {
        if (!mounted) return;
        final message = AppStrings.forLang(_preferredLang, 'realtimeAssistant.processingPause');
        setState(() {
          _bubbles.add(_RealtimeBubble('⏳ $message', isNotice: true));
        });
        _scrollToBottom();
      },
      onProcessingPauseStart: () {
        if (!mounted) return;
        setState(() => _isProcessingPause = true);
      },
      onProcessingPauseEnd: () {
        if (!mounted) return;
        setState(() => _isProcessingPause = false);
      },
      onRecordEdited: (action, recordName) {
        if (!mounted) return;
        final verb = action == 'DELETE'
            ? AppStrings.forLang(_preferredLang, 'realtimeAssistant.recordDeleted')
            : AppStrings.forLang(_preferredLang, 'realtimeAssistant.recordUpdated');
        setState(() {
          _bubbles.add(_RealtimeBubble('✓ $verb: $recordName', isSystemNote: true));
        });
        _scrollToBottom();
      },
    );
    _engine.connect();
  }

  @override
  void dispose() {
    _engine.disconnect();
    _scrollController.dispose();
    super.dispose();
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

  Future<void> _handleCloseInterview() async {
    final conversationId = _engine.conversationId;
    if (!mounted || conversationId == null) return;
    setState(() => _state = _ConnectionState.saving);
    try {
      final confirmResponse = await withRealtimeNetworkRetry(() => ApiClient.instance.dio.post(
        '/me/health-assistant/conversations/$conversationId/confirm-all',
      ));
      // Bug real reportado en vivo: "la primera vez que se pone una
      // fecha mal... guarda la enfermedad pero no la fecha y no dice
      // nada" — confirm-all ahora devuelve dateWarnings cuando un
      // antecedente NUEVO tenía una fecha futura/anterior al
      // nacimiento (se guardó sin fecha). Acá se le informa antes de
      // cerrar, en vez de dejarlo pasar en silencio.
      final dateWarnings =
          ((confirmResponse.data as Map<String, dynamic>?)?['dateWarnings'] as List?)?.cast<String>() ??
              const <String>[];
      // Bug real reportado en vivo: "el cierre fue muy rápido, no dejó
      // que termine de hablar" — la IA suele decir una frase de
      // despedida en el mismo turno en que avisa que hay que cerrar;
      // sin esto, disconnect() cortaba el audio a mitad de frase.
      await _engine.waitForCurrentAudioToFinish();
      await _engine.disconnect();
      if (!mounted) return;
      if (dateWarnings.isNotEmpty) {
        setState(() => _state = _ConnectionState.saved);
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Text(context.tr('assistant.dateWarningTitle')),
            content: Text(dateWarnings.join(' ')),
            actions: [
              FilledButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(context.tr('form.errorDialogOk'))),
            ],
          ),
        );
        if (mounted) Navigator.of(context).pop();
        return;
      }
      setState(() => _state = _ConnectionState.saved);
      // Bug real reportado en vivo: "salió el mensaje pero no volvió
      // al menú principal" — se queda 2s mostrando la confirmación
      // (para que se alcance a leer) y recién ahí vuelve sola, sin
      // necesitar un toque más.
      await Future.delayed(const Duration(seconds: 2));
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      debugPrint('[REALTIME] _handleCloseInterview: error guardando: $e');
      if (!mounted) return;
      setState(() {
        _state = _ConnectionState.error;
        _pendingRetry = _PendingRetry.save;
        _errorMessage = kRealtimeFriendlyErrorMessage;
      });
    }
  }

  /// Bug real reportado en vivo: la viajera pidió cerrar SIN guardar
  /// nada, y la charla se cerró guardando igual — no existía ningún
  /// camino de "cerrar sin guardar" en el motor Realtime (a diferencia
  /// del modelo Estructurado, que ya tenía este mismo bug arreglado).
  /// Usa discard-realtime, NO reject-all: como cada antecedente se
  /// guarda de una a medida que se confirma (ver saveRealtimeProposal),
  /// para esta charla no queda nada "pendiente" que reject-all pueda
  /// descartar — hay que deshacer lo ya aplicado a la Ficha de Salud.
  Future<void> _handleDiscardInterview() async {
    final conversationId = _engine.conversationId;
    if (!mounted || conversationId == null) return;
    setState(() => _state = _ConnectionState.saving);
    try {
      await withRealtimeNetworkRetry(() => ApiClient.instance.dio.post(
        '/me/health-assistant/conversations/$conversationId/discard-realtime',
      ));
      // Ver el mismo comentario en _handleCloseInterview.
      await _engine.waitForCurrentAudioToFinish();
      await _engine.disconnect();
      if (!mounted) return;
      setState(() => _state = _ConnectionState.discarded);
      await Future.delayed(const Duration(seconds: 2));
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      debugPrint('[REALTIME] _handleDiscardInterview: error descartando: $e');
      if (!mounted) return;
      setState(() {
        _state = _ConnectionState.error;
        _pendingRetry = _PendingRetry.discard;
        _errorMessage = kRealtimeFriendlyErrorMessage;
      });
    }
  }

  Future<void> _retry() async {
    setState(() {
      _state = _ConnectionState.connecting;
      _errorMessage = null;
      _pendingRetry = _PendingRetry.none;
      _bubbles.clear();
      _proposalsSaved = 0;
    });
    await _engine.disconnect();
    await _engine.connect();
  }

  void _sendQuickAnswer(String text) {
    if (_state != _ConnectionState.connected) return;
    _engine.sendTextAnswer(text);
  }

  /// El botón "Reintentar" del banner de error tiene que hacer cosas
  /// distintas según qué falló: si falló GUARDAR o DESCARTAR, la
  /// conexión de voz sigue viva — hay que reintentar esa acción
  /// puntual, no reconectar (eso abandonaba la conversación a mitad de
  /// camino). Si en cambio falló la CONEXIÓN de voz, ahí sí hay que
  /// reconectar desde cero.
  Future<void> _handleRetry() {
    switch (_pendingRetry) {
      case _PendingRetry.save:
        return _handleCloseInterview();
      case _PendingRetry.discard:
        return _handleDiscardInterview();
      case _PendingRetry.none:
        return _retry();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.structuredModel ? context.tr('assistant.chatTitleStructured') : context.tr('assistant.chatTitleClassic')),
        actions: [
          if (_state == _ConnectionState.connected)
            IconButton(
              icon: const Icon(Icons.save_outlined),
              tooltip: context.tr('realtimeAssistant.saveAndExitTooltip'),
              onPressed: _handleCloseInterview,
            ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            _StatusBanner(state: _state, errorMessage: _errorMessage, proposalsSaved: _proposalsSaved, onRetry: _handleRetry),
            Expanded(
              child: _bubbles.isEmpty
                  // Bug real reportado en vivo: "no muestra lo que va
                  // registrando, está la pantalla vacía" — cuando la
                  // conexión se cortaba (sin ninguna burbuja llegada
                  // todavía), acá seguía diciendo "Conectando..." para
                  // siempre en vez de reflejar que había un error.
                  //
                  // Bug real reportado en vivo (regresión del arreglo
                  // anterior): el mensaje de error terminaba mostrado
                  // DOS veces en pantalla — una arriba en _StatusBanner
                  // (con el botón "Reintentar") y otra acá abajo,
                  // repetido tal cual. En error, el banner ya lo cubre
                  // del todo — acá solo hace falta el mensaje de
                  // "conectando", nada en el estado de error.
                  ? (_state == _ConnectionState.error
                      ? const SizedBox.shrink()
                      : Center(child: Text(context.tr('realtimeAssistant.connectingToVoiceAssistant'))))
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.all(16),
                      itemCount: _bubbles.length,
                      itemBuilder: (context, index) {
                        final bubble = _bubbles[index];
                        if (bubble.isSystemNote || bubble.isNotice) {
                          final color = bubble.isNotice ? Colors.amber : Colors.green;
                          return Align(
                            alignment: Alignment.center,
                            child: Container(
                              margin: const EdgeInsets.symmetric(vertical: 6),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: color.shade50,
                                border: Border.all(color: color.shade200),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                bubble.text,
                                textAlign: TextAlign.center,
                                style: TextStyle(color: color.shade800, fontSize: 12),
                              ),
                            ),
                          );
                        }
                        // Pedido explícito del usuario: charla estilo
                        // ChatGPT — burbujas del viajero a la derecha,
                        // en el color primario, para distinguirlas de
                        // lo que dice la IA a la izquierda.
                        return Align(
                          alignment: bubble.fromUser ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                            decoration: BoxDecoration(
                              color: bubble.fromUser
                                  ? Theme.of(context).colorScheme.primaryContainer
                                  : Theme.of(context).colorScheme.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Text(
                              bubble.text,
                              style: bubble.fromUser
                                  ? TextStyle(color: Theme.of(context).colorScheme.onPrimaryContainer)
                                  : null,
                            ),
                          ),
                        );
                      },
                    ),
            ),
            // Pedido explícito del usuario: "una combinación con
            // botones y escucha real como el Clásico... para agilizar
            // en caso de no usar que el usuario le hable en algunos
            // momentos" — Estructurado es casi todo sí/no, así que
            // estos botones cubren la gran mayoría de los turnos sin
            // reemplazar la escucha (sigue activa en paralelo, se
            // puede seguir contestando hablando en cualquier momento).
            if (_state == _ConnectionState.connected && widget.structuredModel)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _sendQuickAnswer(context.tr('assistant.yes')),
                        child: Text(context.tr('assistant.yes')),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _sendQuickAnswer(context.tr('assistant.no')),
                        child: Text(context.tr('assistant.no')),
                      ),
                    ),
                  ],
                ),
              ),
            if (_state == _ConnectionState.connected)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: _isProcessingPause
                      ? [
                          SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.amber.shade800),
                          ),
                          const SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              context.tr('realtimeAssistant.processingPauseIndicator'),
                              style: TextStyle(color: Colors.amber.shade800, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ]
                      : [
                          const Icon(Icons.mic, color: Colors.green),
                          const SizedBox(width: 8),
                          Text(context.tr('realtimeAssistant.listeningNaturally')),
                        ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({
    required this.state,
    required this.errorMessage,
    required this.proposalsSaved,
    required this.onRetry,
  });

  final _ConnectionState state;
  final String? errorMessage;
  final int proposalsSaved;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    switch (state) {
      case _ConnectionState.connecting:
        return const LinearProgressIndicator();
      case _ConnectionState.saving:
        return const LinearProgressIndicator();
      case _ConnectionState.error:
        return Container(
          width: double.infinity,
          color: Theme.of(context).colorScheme.errorContainer,
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(errorMessage ?? context.tr('realtimeAssistant.genericError'), style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer)),
              const SizedBox(height: 8),
              ElevatedButton(onPressed: onRetry, child: Text(context.tr('realtimeAssistant.retry'))),
            ],
          ),
        );
      case _ConnectionState.saved:
        return Container(
          width: double.infinity,
          color: Colors.green.shade100,
          padding: const EdgeInsets.all(12),
          child: Text(proposalsSaved == 1
              ? context.tr('realtimeAssistant.savedOne')
              : context.tr('realtimeAssistant.savedMany', params: {'count': '$proposalsSaved'})),
        );
      case _ConnectionState.discarded:
        return Container(
          width: double.infinity,
          color: Colors.grey.shade300,
          padding: const EdgeInsets.all(12),
          child: Text(context.tr('realtimeAssistant.discardedNothing')),
        );
      case _ConnectionState.connected:
        return const SizedBox.shrink();
    }
  }
}
