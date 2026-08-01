import 'package:flutter/material.dart';

import '../../core/api_client.dart';

class _AssistantMessage {
  _AssistantMessage({required this.text, required this.fromUser});
  final String text;
  final bool fromUser;
}

/// Chat de ayuda para USAR LA APP (no un chat clínico — eso es
/// "Compartir con el médico"). Si el backend no tiene ANTHROPIC_API_KEY
/// configurada, /me/assistant/ask devuelve ayuda estática igual — la
/// pantalla nunca queda "rota" por falta de config.
class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _messages = <_AssistantMessage>[
    _AssistantMessage(
      text: '¡Hola! Preguntame lo que necesites sobre cómo usar MedTravelApp: completar tu ficha médica, tu cobertura, o cómo compartir tu historia clínica con un médico.',
      fromUser: false,
    ),
  ];
  bool _sending = false;

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
      setState(() {
        _messages.add(_AssistantMessage(text: response.data['answer'] as String, fromUser: false));
      });
    } catch (_) {
      setState(() {
        _messages.add(_AssistantMessage(text: 'No pude responder ahora — probá de nuevo en un momento.', fromUser: false));
      });
    } finally {
      if (mounted) setState(() => _sending = false);
      _scrollToBottom();
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
      appBar: AppBar(title: const Text('Asistente')),
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
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    decoration: const InputDecoration(hintText: 'Escribí tu pregunta…', border: OutlineInputBorder()),
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
