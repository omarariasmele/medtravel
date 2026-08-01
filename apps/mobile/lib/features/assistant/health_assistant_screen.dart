import 'package:flutter/material.dart';

import '../../core/api_client.dart';

class _ChatMessage {
  _ChatMessage({required this.text, required this.fromUser, this.proposals = const []});
  final String text;
  final bool fromUser;
  final List<_Proposal> proposals;
}

class _Proposal {
  _Proposal({
    required this.id,
    required this.proposalType,
    required this.confidence,
    required this.data,
  });

  factory _Proposal.fromJson(Map<String, dynamic> json) => _Proposal(
        id: json['id'] as String,
        proposalType: json['proposalType'] as String,
        confidence: (json['confidence'] as num).toDouble(),
        data: Map<String, dynamic>.from(json['data'] as Map),
      );

  final String id;
  final String proposalType;
  final double confidence;
  final Map<String, dynamic> data;

  String get title => proposalType == 'MEDICATION' ? 'Medicamento' : 'Alergia';

  String get description {
    if (proposalType == 'MEDICATION') {
      final generic = data['genericName'] as String? ?? '';
      final brand = data['brandName'] as String?;
      return brand != null && brand.isNotEmpty ? '$generic ($brand)' : generic;
    }
    final name = data['allergenName'] as String? ?? '';
    final severity = data['severity'] as String?;
    return severity != null ? '$name — severidad: ${_severityLabel(severity)}' : name;
  }

  static String _severityLabel(String code) {
    switch (code) {
      case 'MILD':
        return 'leve';
      case 'MODERATE':
        return 'moderada';
      case 'SEVERE':
        return 'severa';
      case 'CRITICAL':
        return 'crítica';
      default:
        return code;
    }
  }
}

/// Chat de IA para cargar la ficha médica (alergias/medicamentos)
/// charlando en lenguaje natural — distinto del asistente de ayuda de
/// uso de la app (AssistantScreen). La IA propone datos estructurados
/// que se muestran como tarjetas con "Confirmar"/"Rechazar": nada se
/// guarda en la ficha médica real hasta que el viajero toca Confirmar.
class HealthAssistantScreen extends StatefulWidget {
  const HealthAssistantScreen({super.key});

  @override
  State<HealthAssistantScreen> createState() => _HealthAssistantScreenState();
}

class _HealthAssistantScreenState extends State<HealthAssistantScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _messages = <_ChatMessage>[
    _ChatMessage(
      text: 'Contame qué alergias o medicamentos tenés y te ayudo a cargarlos en tu ficha médica. '
          'Por ejemplo: "Soy alérgico a la penicilina, me da una reacción severa".',
      fromUser: false,
    ),
  ];
  String? _conversationId;
  bool _sending = false;
  final _resolvedProposals = <String>{};

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() {
      _messages.add(_ChatMessage(text: text, fromUser: true));
      _sending = true;
      _controller.clear();
    });
    _scrollToBottom();
    try {
      final response = await ApiClient.instance.dio.post('/me/health-assistant/chat', data: {
        'question': text,
        if (_conversationId != null) 'conversationId': _conversationId,
      });
      final data = response.data as Map<String, dynamic>;
      _conversationId = data['conversationId'] as String?;
      final proposals = (data['proposals'] as List? ?? [])
          .map((p) => _Proposal.fromJson(p as Map<String, dynamic>))
          .toList();
      setState(() {
        _messages.add(_ChatMessage(text: data['reply'] as String, fromUser: false, proposals: proposals));
      });
    } catch (_) {
      setState(() {
        _messages.add(_ChatMessage(text: 'No pude responder ahora — probá de nuevo en un momento.', fromUser: false));
      });
    } finally {
      if (mounted) setState(() => _sending = false);
      _scrollToBottom();
    }
  }

  Future<void> _resolveProposal(_Proposal proposal, bool confirm) async {
    try {
      await ApiClient.instance.dio.post(
        '/me/health-assistant/proposals/${proposal.id}/${confirm ? 'confirm' : 'reject'}',
      );
      setState(() => _resolvedProposals.add(proposal.id));
      if (mounted && confirm) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Se agregó a tu ficha médica: ${proposal.description}')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo procesar — probá de nuevo.')),
        );
      }
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Asistente de salud')),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(12),
              itemCount: _messages.length,
              itemBuilder: (context, i) {
                final m = _messages[i];
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
                        child: Text(m.text),
                      ),
                    ),
                    ...m.proposals.map((p) {
                      final resolved = _resolvedProposals.contains(p.id);
                      return Card(
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(children: [
                                Icon(
                                  p.proposalType == 'MEDICATION' ? Icons.medication_outlined : Icons.warning_amber_outlined,
                                  size: 18,
                                ),
                                const SizedBox(width: 6),
                                Text(p.title, style: Theme.of(context).textTheme.titleSmall),
                              ]),
                              const SizedBox(height: 4),
                              Text(p.description),
                              const SizedBox(height: 8),
                              if (resolved)
                                const Text('Procesado ✓', style: TextStyle(color: Colors.green))
                              else
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  children: [
                                    TextButton(
                                      onPressed: () => _resolveProposal(p, false),
                                      child: const Text('Rechazar'),
                                    ),
                                    const SizedBox(width: 8),
                                    FilledButton(
                                      onPressed: () => _resolveProposal(p, true),
                                      child: const Text('Confirmar'),
                                    ),
                                  ],
                                ),
                            ],
                          ),
                        ),
                      );
                    }),
                  ],
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
                    decoration: const InputDecoration(hintText: 'Contame tu alergia o medicamento…', border: OutlineInputBorder()),
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
