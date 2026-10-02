import 'package:flutter/material.dart';

import '../../l10n/app_strings.dart';
import 'realtime_voice_engine.dart';

class _Bubble {
  _Bubble(this.text, {this.fromUser = false}) : closed = fromUser;
  String text;
  bool closed;
  final bool fromUser;
}

/// Pedido explícito del usuario: migrar el asistente de ayuda de uso de
/// la app ("Asistente") del motor viejo (speech_to_text + flutter_tts +
/// audioplayers encadenados a mano, ver assistant_screen.dart) al mismo
/// motor Realtime (OpenAI Realtime API vía WebRTC) que ya usan
/// Clásico/Estructurado — mismo motivo: "hace la introducción pero no
/// recibe lo que uno le consulta por voz".
///
/// A diferencia de esos dos, este asistente no guarda nada en la Ficha
/// de Salud (no tiene tools registradas, ver AIService.
/// createAppHelpRealtimeSession) — es sólo una charla de preguntas y
/// respuestas sobre cómo usar la app, así que la pantalla no necesita
/// ningún flujo de guardar/descartar/confirmar: se puede cerrar en
/// cualquier momento sin perder nada pendiente.
class RealtimeAppHelpScreen extends StatefulWidget {
  const RealtimeAppHelpScreen({super.key});

  @override
  State<RealtimeAppHelpScreen> createState() => _RealtimeAppHelpScreenState();
}

enum _ConnState { connecting, connected, error }

class _RealtimeAppHelpScreenState extends State<RealtimeAppHelpScreen> {
  late final RealtimeVoiceEngine _engine;
  final List<_Bubble> _bubbles = [];
  final ScrollController _scrollController = ScrollController();
  final TextEditingController _textController = TextEditingController();
  _ConnState _state = _ConnState.connecting;
  String? _errorMessage;
  bool _isProcessingPause = false;

  @override
  void initState() {
    super.initState();
    _engine = RealtimeVoiceEngine(
      // Ver el comentario de sessionEndpoint en RealtimeVoiceEngine: pisa
      // el endpoint que structuredModel elegiría solo, sin duplicar el
      // resto del motor (conexión WebRTC, reconexión, audio).
      sessionEndpoint: '/me/assistant/realtime-session',
      onConnected: () {
        if (!mounted) return;
        setState(() => _state = _ConnState.connected);
      },
      onDisconnected: () {
        if (!mounted) return;
        setState(() {
          _state = _ConnState.error;
          _errorMessage = context.tr('realtimeAssistant.connectionLost');
        });
      },
      onError: (message) {
        if (!mounted) return;
        setState(() {
          _state = _ConnState.error;
          _errorMessage = message;
        });
      },
      onAssistantTranscriptDelta: (delta) {
        if (!mounted) return;
        setState(() {
          if (_bubbles.isNotEmpty && !_bubbles.last.closed) {
            _bubbles.last.text += delta;
          } else {
            _bubbles.add(_Bubble(delta));
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
        setState(() => _bubbles.add(_Bubble(text, fromUser: true)));
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
    );
    _engine.connect();
  }

  @override
  void dispose() {
    _engine.disconnect();
    _scrollController.dispose();
    _textController.dispose();
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

  Future<void> _retry() async {
    setState(() {
      _state = _ConnState.connecting;
      _errorMessage = null;
      _bubbles.clear();
    });
    await _engine.disconnect();
    await _engine.connect();
  }

  void _sendTypedAnswer() {
    final text = _textController.text.trim();
    if (text.isEmpty || _state != _ConnState.connected) return;
    _textController.clear();
    _engine.sendTextAnswer(text);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('appHelp.title'))),
      body: SafeArea(
        child: Column(
          children: [
            if (_state == _ConnState.connecting) const LinearProgressIndicator(),
            if (_state == _ConnState.error)
              Container(
                width: double.infinity,
                color: Theme.of(context).colorScheme.errorContainer,
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _errorMessage ?? context.tr('realtimeAssistant.genericError'),
                      style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer),
                    ),
                    const SizedBox(height: 8),
                    ElevatedButton(onPressed: _retry, child: Text(context.tr('realtimeAssistant.retry'))),
                  ],
                ),
              ),
            Expanded(
              child: _bubbles.isEmpty
                  ? (_state == _ConnState.error
                      ? const SizedBox.shrink()
                      : Center(child: Text(context.tr('realtimeAssistant.connectingToVoiceAssistant'))))
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.all(16),
                      itemCount: _bubbles.length,
                      itemBuilder: (context, index) {
                        final bubble = _bubbles[index];
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
            if (_state == _ConnState.connected) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _textController,
                        decoration: InputDecoration(
                          hintText: context.tr('realtimeAssistant.typeAnswerHint'),
                          border: const OutlineInputBorder(),
                          isDense: true,
                        ),
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _sendTypedAnswer(),
                      ),
                    ),
                    IconButton(icon: const Icon(Icons.send), onPressed: _sendTypedAnswer),
                  ],
                ),
              ),
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
          ],
        ),
      ),
    );
  }
}
