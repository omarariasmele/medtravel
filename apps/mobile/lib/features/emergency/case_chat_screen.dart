import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../core/api_client.dart';

class ChatMessage {
  ChatMessage({required this.senderName, required this.content, required this.sentAt, required this.isMine});

  final String senderName;
  final String content;
  final DateTime? sentAt;
  final bool isMine;

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

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
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
        setState(() {
          _messages.add(ChatMessage.fromJson(Map<String, dynamic>.from(data as Map), _myName));
        });
        _scrollToBottom();
      })
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

  void _send() {
    final content = _textController.text.trim();
    if (content.isEmpty || widget.channelId == null) return;
    _socket?.emit('send_message', {
      'caseId': widget.caseId,
      'channelId': widget.channelId,
      'content': content,
    });
    _textController.clear();
  }

  @override
  void dispose() {
    _socket?.emit('leave_case', {'caseId': widget.caseId});
    _socket?.dispose();
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.caseNumber != null ? 'Caso ${widget.caseNumber}' : 'Chat del caso'),
        bottom: !_connected
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
                      color: m.isMine ? Theme.of(context).colorScheme.primaryContainer : Colors.grey.shade200,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (!m.isMine)
                          Text(m.senderName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
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
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _textController,
                    decoration: const InputDecoration(hintText: 'Escribí un mensaje…', border: OutlineInputBorder()),
                    onSubmitted: (_) => _send(),
                  ),
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
