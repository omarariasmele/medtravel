import 'dart:async';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

import '../../core/api_client.dart';

class _AssistantMessage {
  _AssistantMessage({required this.text, required this.fromUser});
  final String text;
  final bool fromUser;
}

/// Defensa aparte del prompt (mismo criterio que health_assistant_screen.dart):
/// si el texto trae markdown no lo lea literal en voz alta.
String _speakableText(String raw) {
  return raw
      .replaceAll(RegExp(r'[*_`#]'), '')
      .replaceAll(RegExp(r'^\s*[-•]\s+', multiLine: true), '')
      .replaceAll(RegExp(r'\n+'), '. ')
      .replaceAll(RegExp(r'\s{2,}'), ' ')
      .trim();
}

/// Pedido explícito del usuario: "cuando se presenta siempre debe
/// mencionar el nombre del usuario en todos los casos" — antes este
/// saludo era un texto fijo sin nombre (el único de los asistentes de
/// la app que no se presentaba por nombre). `firstName` viene de
/// `/me/profile`, buscado en initState — null si el fetch falla
/// (sin conexión, etc.), y ahí cae al saludo genérico.
String _buildGreeting(String? firstName) {
  final namePart = (firstName != null && firstName.trim().isNotEmpty) ? ' $firstName' : '';
  return '¡Hola$namePart! Preguntame lo que necesites sobre cómo usar MedTravelApp: completar tu Historial de Salud, tu cobertura, o cómo compartirlo con un médico.';
}

/// Chat de ayuda para USAR LA APP (no un chat clínico — eso es
/// "Compartir con el médico"). Si el backend no tiene AI_ENABLED
/// configurada, /me/assistant/ask devuelve ayuda estática igual — la
/// pantalla nunca queda "rota" por falta de config. Voz manos-libres
/// (hablar → escuchar → hablar) igual que el asistente de salud —
/// pedido explícito del usuario de sumarle voz también acá.
class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _messages = <_AssistantMessage>[];
  bool _sending = false;

  final _speech = stt.SpeechToText();
  bool _speechAvailable = false;
  bool _listening = false;

  final _tts = FlutterTts();
  final _audioPlayer = AudioPlayer();
  bool _voiceReplyEnabled = true;
  bool _speaking = false;

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

  @override
  void initState() {
    super.initState();
    _speech.initialize(
      onError: (error) {
        if (!mounted) return;
        setState(() => _listening = false);

        // Mismo bug real reportado en vivo que en el asistente de salud
        // (health_assistant_screen.dart): "escucha y escribe, pero se
        // queda ahí, no procesa nada" — si el reconocedor corta la
        // sesión con un error (ej. error_network, error_server_
        // disconnected) en vez de un finalResult limpio, lo que ya se
        // transcribió en el cuadro de texto quedaba huérfano para
        // siempre (onError acá solo reintentaba escuchar, nunca miraba
        // si ya había algo escrito para mandar).
        if (_controller.text.trim().isNotEmpty) {
          _send();
          return;
        }

        if (_voiceReplyEnabled) {
          // Pedido explícito del usuario: el micrófono tiene que
          // permanecer siempre escuchando — reintenta en vez de apagarse.
          _startListening();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('No se pudo reconocer la voz (${error.errorMsg}) — probá de nuevo.')),
          );
        }
      },
      onStatus: (status) {
        if (status == 'done' || status == 'notListening') {
          if (mounted) setState(() => _listening = false);
        }
      },
    ).then((available) {
      if (mounted) setState(() => _speechAvailable = available);
    });
    _tts.setStartHandler(() {
      if (mounted) setState(() => _speaking = true);
    });
    _tts.setCompletionHandler(_onSpeechFinished);
    _tts.setCancelHandler(() {
      if (mounted) setState(() => _speaking = false);
    });
    _tts.setErrorHandler((message) {
      if (!mounted) return;
      setState(() => _speaking = false);
    });
    _initVoiceFlow();
  }

  @override
  void dispose() {
    _speech.stop();
    _tts.stop();
    _audioPlayer.dispose();
    super.dispose();
  }

  void _onSpeechFinished() {
    if (!mounted) return;
    setState(() => _speaking = false);
    if (_voiceReplyEnabled && !_sending && !_listening) {
      _startListening();
    }
  }

  Future<void> _speak(String rawText) async {
    if (!_voiceReplyEnabled) return;
    final text = _speakableText(rawText);
    if (text.trim().isEmpty) return;
    if (await _speakWithOpenAi(text)) return;
    await _tts.speak(text);
  }

  Future<bool> _speakWithOpenAi(String text) async {
    try {
      final response = await ApiClient.instance.dio.post<List<int>>(
        '/me/health-assistant/speech',
        data: {'text': text, 'voice': _voiceSettings['assistant.tts_voice'] ?? 'nova'},
        options: Options(responseType: ResponseType.bytes),
      );
      final bytes = Uint8List.fromList(response.data!);
      if (!mounted) return true;
      setState(() => _speaking = true);
      final completer = Completer<void>();
      late final StreamSubscription<void> sub;
      sub = _audioPlayer.onPlayerComplete.listen((_) {
        sub.cancel();
        if (!completer.isCompleted) completer.complete();
      });
      await _audioPlayer.play(BytesSource(bytes));
      await completer.future;
      _onSpeechFinished();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _initVoiceFlow() async {
    await _loadVoiceSettings();
    await _configureTts();
    String? firstName;
    try {
      final response = await ApiClient.instance.dio.get('/me/profile');
      firstName = response.data['first_name'] as String?;
    } catch (_) {
      // Sin nombre, el saludo cae al genérico — no bloquea el arranque.
    }
    final greeting = _buildGreeting(firstName);
    if (!mounted) return;
    setState(() => _messages.add(_AssistantMessage(text: greeting, fromUser: false)));
    _scrollToBottom();
    // El saludo no llama a la IA (es texto fijo, con el nombre ya
    // interpolado) — si el modo manos libres está activo, se lee en voz
    // alta y encadena directo a escuchar, mismo patrón que el
    // asistente de salud.
    if (_voiceReplyEnabled) await _speak(greeting);
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

  Future<void> _configureTts() async {
    await _tts.setLanguage('es-AR');
    await _tts.setSpeechRate(_voiceDouble('assistant.tts_speech_rate', 0.55));
    await _tts.setPitch(_voiceDouble('assistant.tts_pitch', 1.0));
    await _tts.setVolume(1.0);
    await _tts.awaitSpeakCompletion(true);
  }

  Future<void> _handleSilenceTimeout() async {
    if (!mounted || !_voiceReplyEnabled) return;
    await _startListening();
  }

  Future<void> _toggleListening() async {
    if (!_speechAvailable) return;
    if (_listening) {
      await _speech.stop();
      setState(() => _listening = false);
      return;
    }
    await _startListening();
  }

  Future<void> _startListening() async {
    if (!_speechAvailable || _listening) return;
    setState(() => _listening = true);
    try {
      await _speech.listen(
        listenOptions: stt.SpeechListenOptions(
          localeId: 'es_AR',
          listenMode: stt.ListenMode.dictation,
          pauseFor: Duration(seconds: _voiceInt('assistant.tts_pause_seconds', 3)),
          listenFor: Duration(seconds: _voiceInt('assistant.tts_listen_seconds', 60)),
        ),
        onResult: (result) {
          setState(() => _controller.text = result.recognizedWords);
          if (result.finalResult) {
            setState(() => _listening = false);
            final text = result.recognizedWords.trim();
            if (text.isEmpty) {
              if (_voiceReplyEnabled) _handleSilenceTimeout();
              return;
            }
            _send();
          }
        },
      );
    } catch (_) {
      if (mounted) {
        setState(() => _listening = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo activar el micrófono — revisá el permiso en Ajustes.')),
        );
      }
    }
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() {
      _messages.add(_AssistantMessage(text: text, fromUser: true));
      _sending = true;
      _controller.clear();
    });
    _scrollToBottom();
    try {
      final response = await ApiClient.instance.dio.post('/me/assistant/ask', data: {'question': text});
      final answer = response.data['answer'] as String;
      setState(() {
        _messages.add(_AssistantMessage(text: answer, fromUser: false));
        _sending = false;
      });
      _scrollToBottom();
      if (_voiceReplyEnabled) _speak(answer);
    } catch (_) {
      const errorText = 'No pude responder ahora — probá de nuevo en un momento.';
      setState(() {
        _messages.add(_AssistantMessage(text: errorText, fromUser: false));
        _sending = false;
      });
      _scrollToBottom();
      if (_voiceReplyEnabled) _speak(errorText);
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(_scrollController.position.maxScrollExtent, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Asistente'),
        actions: [
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
                return Align(
                  alignment: m.fromUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                    decoration: BoxDecoration(
                      color: m.fromUser ? Theme.of(context).colorScheme.primaryContainer : Colors.grey.shade200,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(m.text),
                  ),
                );
              },
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
                    decoration: InputDecoration(
                      hintText: _listening ? 'Escuchando…' : 'Escribí tu pregunta…',
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
    );
  }
}
