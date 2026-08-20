import 'dart:async';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:intl/intl.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:speech_to_text/speech_to_text.dart' as stt;

import '../../core/api_client.dart';
import '../../core/text_normalize.dart';

/// Defensa aparte del prompt (mismo criterio que health_assistant_screen.dart):
/// si el texto trae markdown (viñetas, negrita, etc.) no lo lea literal.
String _speakableText(String raw) {
  return raw
      .replaceAll(RegExp(r'[*_`#]'), '')
      .replaceAll(RegExp(r'^\s*[-•]\s+', multiLine: true), '')
      .replaceAll(RegExp(r'\n+'), '. ')
      .replaceAll(RegExp(r'\s{2,}'), ' ')
      .trim();
}

class ChatMessage {
  ChatMessage({
    required this.senderName,
    required this.content,
    required this.sentAt,
    required this.isMine,
    required this.isAi,
  });

  final String senderName;
  final String content;
  final DateTime? sentAt;
  final bool isMine;
  final bool isAi;

  /// Acepta tanto el shape camelCase de TypeORM (historial vía REST)
  /// como el snake_case crudo que emite events.gateway.ts al broadcastear
  /// un mensaje nuevo por socket (INSERT ... RETURNING * sin pasar por
  /// TypeORM) — mismo mensaje, dos formas de llegar al cliente.
  factory ChatMessage.fromJson(Map<String, dynamic> json, String myPersonName) {
    final senderName = (json['senderName'] ?? json['sender_name'] ?? '') as String;
    final content = (json['content'] ?? '') as String;
    final sentRaw = json['sentAt'] ?? json['sent_at'] ?? json['created_at'];
    return ChatMessage(
      senderName: senderName,
      content: content,
      sentAt: sentRaw != null ? DateTime.tryParse(sentRaw as String) : null,
      isMine: senderName == myPersonName,
      // sender_name viene fijo como 'Asistente de IA' desde
      // insert_system_chat_message (ai.service.ts) — no hay un campo
      // sender_type en el JSON que llega acá, así que se distingue por
      // nombre, igual que isMine.
      isAi: senderName == 'Asistente de IA',
    );
  }
}

class CaseChatScreen extends StatefulWidget {
  const CaseChatScreen({
    super.key,
    required this.caseId,
    required this.channelId,
    this.caseNumber,
  });

  final String caseId;
  final String? channelId;
  final String? caseNumber;

  @override
  State<CaseChatScreen> createState() => _CaseChatScreenState();
}

class _CaseChatScreenState extends State<CaseChatScreen> {
  io.Socket? _socket;
  final _messages = <ChatMessage>[];
  final _textController = TextEditingController();
  final _scrollController = ScrollController();
  String _myName = '';
  bool _connected = false;
  String? _error;

  // Pedido explícito del usuario: "cuando el caso está cerrado no debería
  // dejar hacer nada desde la app... en el chat no debe poder ingresar
  // nada" — antes solo el servidor rechazaba el envío (silenciosamente,
  // ver _send()), sin avisar de entrada ni bloquear la UI. Se refresca al
  // abrir la pantalla y de nuevo cada vez que llega 'case_update' (mismo
  // evento que ya usa case_detail_screen.dart), por si el caso se cierra
  // mientras el chat sigue abierto.
  bool _caseClosed = false;

  // Voz opcional en el chat de emergencia (pedido explícito del usuario:
  // "que el usuario pueda usarla o no") — mismo mecanismo de OpenAI TTS +
  // reconocimiento de voz que el asistente de salud, pero sin el modo
  // manos libres encadenado: acá es una conversación de a un turno por
  // vez con un humano/IA, no una entrevista guiada.
  final _tts = FlutterTts();
  final _audioPlayer = AudioPlayer();
  final _speech = stt.SpeechToText();
  bool _speechAvailable = false;
  bool _listening = false;
  bool _voiceEnabled = true;
  bool _speaking = false;
  String _voiceCode = 'nova';
  int _listenSeconds = 30;
  int _pauseSeconds = 2;

  @override
  void initState() {
    super.initState();
    _init();
    _initVoice();
  }

  Future<void> _initVoice() async {
    _speech.initialize(
      onError: (_) {
        if (mounted) setState(() => _listening = false);
      },
      onStatus: (status) {
        if ((status == 'done' || status == 'notListening') && mounted) {
          setState(() => _listening = false);
        }
      },
    ).then((available) {
      if (mounted) setState(() => _speechAvailable = available);
    });
    _tts.setStartHandler(() {
      if (mounted) setState(() => _speaking = true);
    });
    _tts.setCompletionHandler(() {
      if (mounted) setState(() => _speaking = false);
    });
    _tts.setCancelHandler(() {
      if (mounted) setState(() => _speaking = false);
    });
    await _tts.setLanguage('es-AR');
    await _tts.awaitSpeakCompletion(true);
    try {
      // Mismos parámetros que Parámetros de la app (admin-web) usa para
      // el asistente de salud — reutilizados acá para que la voz del
      // chat de emergencia suene consistente con el resto de la app.
      final response = await ApiClient.instance.dio.get('/params/app-settings');
      final rows = response.data as List;
      for (final row in rows) {
        final key = row['key'] as String?;
        final value = row['value'] as String?;
        if (key == 'assistant.tts_voice' && value != null) _voiceCode = value;
        if (key == 'assistant.tts_listen_seconds' && value != null) {
          _listenSeconds = int.tryParse(value) ?? _listenSeconds;
        }
        if (key == 'assistant.tts_pause_seconds' && value != null) {
          _pauseSeconds = int.tryParse(value) ?? _pauseSeconds;
        }
      }
    } catch (_) {
      // Sigue con los valores por defecto — no bloquea el chat.
    }
  }

  Future<void> _speak(String rawText) async {
    if (!_voiceEnabled) return;
    final text = _speakableText(rawText);
    if (text.trim().isEmpty) return;
    if (await _speakWithOpenAi(text)) return;
    await _tts.speak(text);
  }

  Future<bool> _speakWithOpenAi(String text) async {
    try {
      final response = await ApiClient.instance.dio.post<List<int>>(
        '/me/health-assistant/speech',
        data: {'text': text, 'voice': _voiceCode},
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
      if (mounted) setState(() => _speaking = false);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _toggleListening() async {
    if (!_speechAvailable) return;
    if (_listening) {
      await _speech.stop();
      if (mounted) setState(() => _listening = false);
      return;
    }
    setState(() => _listening = true);
    try {
      await _speech.listen(
        listenOptions: stt.SpeechListenOptions(
          localeId: 'es_AR',
          listenMode: stt.ListenMode.dictation,
          pauseFor: Duration(seconds: _pauseSeconds),
          listenFor: Duration(seconds: _listenSeconds),
        ),
        onResult: (result) {
          setState(() => _textController.text = result.recognizedWords);
          if (result.finalResult) {
            setState(() => _listening = false);
            if (result.recognizedWords.trim().isNotEmpty) _send();
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

  void _toggleVoice() {
    setState(() => _voiceEnabled = !_voiceEnabled);
    if (!_voiceEnabled) {
      _tts.stop();
      _audioPlayer.stop();
      if (_listening) {
        _speech.stop();
        setState(() => _listening = false);
      }
    }
  }

  Future<void> _loadCaseClosed() async {
    try {
      final response = await ApiClient.instance.dio.get('/me/emergency-cases');
      final cases = (response.data as List).cast<Map<String, dynamic>>();
      final match = cases.where((c) => c['id'] == widget.caseId);
      final closed = match.isNotEmpty && match.first['closed_at'] != null;
      if (mounted) setState(() => _caseClosed = closed);
    } catch (_) {
      // No bloquea el chat si esta consulta puntual falla — el servidor
      // igual rechaza el envío de un caso cerrado (ver _send()).
    }
  }

  Future<void> _init() async {
    unawaited(_loadCaseClosed());

    try {
      final profileResponse = await ApiClient.instance.dio.get('/me/profile');
      _myName = '${profileResponse.data['first_name']} ${profileResponse.data['last_name']}';

      final historyResponse = await ApiClient.instance.dio.get(
        '/operations/chat-messages',
        queryParameters: {'caseId': widget.caseId},
      );
      final history = (historyResponse.data as List)
          .map((m) => ChatMessage.fromJson(m as Map<String, dynamic>, _myName))
          .toList();

      setState(() => _messages.addAll(history));
    } catch (_) {
      // Sin historial previo (caso recién creado) — no es un error real.
    }

    final token = await ApiClient.instance.getAccessToken();
    // El namespace ('cases', ver events.gateway.ts) va en la URL, no hay
    // setNamespace() en OptionBuilder.
    _socket = io.io(
      '$apiBaseUrl/cases',
      io.OptionBuilder()
          .setPath('/socket.io')
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .build(),
    );

    _socket!
      ..onConnect((_) {
        _socket!.emitWithAck('join_case', {'caseId': widget.caseId}, ack: (data) {
          if (mounted) {
            setState(() {
              _connected = (data as Map)['ok'] == true;
              if (!_connected) _error = data['error'] as String?;
            });
          }
        });
      })
      ..on('chat_message', (data) {
        if (!mounted) return;
        final message = ChatMessage.fromJson(Map<String, dynamic>.from(data as Map), _myName);
        setState(() => _messages.add(message));
        _scrollToBottom();
        // Leer en voz alta lo que llega de otra persona/IA — pedido
        // explícito del usuario ("el chat de emergencia debería estar
        // apoyado por voz"). Los mensajes propios no se leen.
        if (!message.isMine) _speak(message.content);
      })
      ..on('case_update', (_) => _loadCaseClosed())
      ..onConnectError((err) {
        if (mounted) setState(() => _error = 'No se pudo conectar al chat.');
      })
      ..connect();
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

  /// Bug real reportado en vivo: "el chat pierde data que se le tipea".
  /// handleSendMessage (events.gateway.ts) YA devuelve {ok, error} —
  /// rechaza caso cerrado, participante no autorizado, error de DB — pero
  /// antes se emitía con `.emit()` sin ack, y el texto se limpiaba de
  /// entrada asumiendo éxito. Cualquier rechazo del servidor desaparecía
  /// en silencio, sin aviso y sin poder recuperar lo tipeado. Ahora se
  /// usa emitWithAck (mismo mecanismo que ya usa join_case) y, si el
  /// servidor dice que no, se repone el texto y se avisa.
  void _send() {
    final content = normalizeSpanishAccents(_textController.text.trim());
    if (content.isEmpty || _caseClosed) return;
    if (widget.channelId == null || _socket == null || !_connected) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sin conexión al chat — el mensaje no se envió, probá de nuevo.')),
      );
      return;
    }
    _textController.clear();
    var acked = false;
    _socket!.emitWithAck('send_message', {
      'caseId': widget.caseId,
      'channelId': widget.channelId,
      'content': content,
    }, ack: (data) {
      acked = true;
      final ok = (data is Map) && data['ok'] == true;
      if (!ok && mounted) {
        if (_textController.text.isEmpty) _textController.text = content;
        final error = (data is Map) ? data['error'] as String? : null;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error ?? 'No se pudo enviar el mensaje.')),
        );
      }
    });
    Future.delayed(const Duration(seconds: 10), () {
      if (!acked && mounted) {
        if (_textController.text.isEmpty) _textController.text = content;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo confirmar el envío — probá de nuevo.')),
        );
      }
    });
  }

  @override
  void dispose() {
    _socket?.emit('leave_case', {'caseId': widget.caseId});
    _socket?.dispose();
    _textController.dispose();
    _scrollController.dispose();
    _speech.stop();
    _tts.stop();
    _audioPlayer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.caseNumber != null ? 'Caso ${widget.caseNumber}' : 'Chat del caso'),
        actions: [
          IconButton(
            icon: Icon(_voiceEnabled ? Icons.volume_up : Icons.volume_off),
            tooltip: _voiceEnabled ? 'Dejar de leer los mensajes en voz alta' : 'Leer los mensajes en voz alta',
            onPressed: _toggleVoice,
          ),
        ],
        bottom: _caseClosed
            ? PreferredSize(
                preferredSize: const Size.fromHeight(24),
                child: Container(
                  color: Colors.grey.shade700,
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: const Text(
                    'Este caso está cerrado — no se pueden enviar más mensajes',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white, fontSize: 12),
                  ),
                ),
              )
            : !_connected
                ? PreferredSize(
                    preferredSize: const Size.fromHeight(24),
                    child: Container(
                      color: Colors.orange,
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Text(
                        _error ?? 'Conectando…',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white, fontSize: 12),
                      ),
                    ),
                  )
                : null,
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
                  alignment: m.isMine ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                    decoration: BoxDecoration(
                      color: m.isMine
                          ? Theme.of(context).colorScheme.primaryContainer
                          : m.isAi
                              ? Theme.of(context).colorScheme.secondaryContainer
                              : Colors.grey.shade200,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (!m.isMine)
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (m.isAi) ...[
                                Icon(Icons.smart_toy_outlined, size: 13, color: Theme.of(context).colorScheme.onSecondaryContainer),
                                const SizedBox(width: 4),
                              ],
                              Text(m.senderName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                            ],
                          ),
                        Text(m.content),
                        if (m.sentAt != null)
                          Text(DateFormat('HH:mm').format(m.sentAt!.toLocal()), style: const TextStyle(fontSize: 10, color: Colors.grey)),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
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
                ],
              ),
            ),
          SafeArea(
            child: _caseClosed
                ? Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      'Este caso está cerrado. No se pueden enviar más mensajes.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey.shade600),
                    ),
                  )
                : Padding(
                    padding: const EdgeInsets.all(8),
                    child: Row(children: [
                      Expanded(
                        child: TextField(
                          controller: _textController,
                          decoration: InputDecoration(
                            hintText: _listening ? 'Escuchando…' : 'Escribí un mensaje…',
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
