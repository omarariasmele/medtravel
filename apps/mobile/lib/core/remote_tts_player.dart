import 'dart:async';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:dio/dio.dart';
import 'package:flutter_tts/flutter_tts.dart';

import 'api_client.dart';

/// Defensa aparte del prompt de la IA: si igual llega markdown (viñetas,
/// negrita, etc.) no lo lea literal — "asterisco asterisco" en voz alta
/// suena mal. Copiado de health_assistant_screen.dart (privado a ese
/// archivo) para poder usarlo también desde otras pantallas con voz.
String speakableText(String raw) {
  return raw
      .replaceAll(RegExp(r'[*_`#]'), '')
      .replaceAll(RegExp(r'^\s*[-•]\s+', multiLine: true), '')
      .replaceAll(RegExp(r'\n+'), '. ')
      .replaceAll(RegExp(r'\s{2,}'), ' ')
      .trim();
}

/// Pedido explícito del usuario: cualquier lectura en voz alta de la app
/// (no solo el asistente de salud) tiene que sonar IGUAL — mismo motor
/// (OpenAI TTS vía backend), misma voz configurada desde admin-web
/// (Parámetros de la app, assistant.tts_voice) — nunca la voz genérica
/// del dispositivo. Antes, por ejemplo, "Info del destino" en
/// trips_screen.dart usaba FlutterTts directo con una voz distinta y no
/// configurable; esta clase centraliza el mismo pipeline que ya usaba
/// health_assistant_screen.dart para que cualquier pantalla nueva lo
/// reutilice en vez de reinventar otra voz. FlutterTts local queda solo
/// como fallback si el backend no responde (sin conexión, etc.).
class RemoteTtsPlayer {
  final _audioPlayer = AudioPlayer();
  final _localTts = FlutterTts();
  String _voice = 'nova';
  bool _voiceLoaded = false;

  Future<void> _ensureVoiceLoaded() async {
    if (_voiceLoaded) return;
    _voiceLoaded = true;
    try {
      final response = await ApiClient.instance.dio.get('/params/app-settings');
      final rows = response.data as List;
      for (final row in rows) {
        if (row['key'] == 'assistant.tts_voice' && row['value'] is String) {
          _voice = row['value'] as String;
        }
      }
    } catch (_) {
      // Sigue con el default local — no bloquea la lectura.
    }
  }

  /// Espera a que termine de reproducirse (o falle) antes de resolver.
  Future<void> speak(String rawText) async {
    final text = speakableText(rawText);
    if (text.trim().isEmpty) return;
    await _ensureVoiceLoaded();
    if (await _speakWithOpenAi(text)) return;
    await _localTts.setLanguage('es-AR');
    await _localTts.speak(text);
  }

  /// Bug real reportado en vivo ("Info del destino" tardaba demasiado en
  /// empezar a hablar, incluso después de partir por destino): `speak()`
  /// manda TODO el texto en un solo pedido de síntesis — un texto largo
  /// tarda más en OpenAI TTS ANTES de devolver el audio (nada se escucha
  /// hasta que el pedido entero vuelve). `speakChunks` no solo parte en
  /// trozos más chicos (el caller decide el tamaño — ver trips_screen.dart,
  /// ahora por SECCIÓN, no por país entero) sino que los va sintetizando
  /// EN PARALELO a medida que suenan (pedido del siguiente trozo arranca
  /// apenas se obtiene el audio del actual, no cuando termina de sonar) —
  /// así solo el primer trozo tiene espera real de red/síntesis; el resto
  /// sigue sin cortes perceptibles, como una sola locución continua.
  /// `onFirstAudioStart` avisa apenas arranca a sonar el PRIMER trozo
  /// (no cuando termina toda la secuencia) — un caller que muestra un
  /// spinner "preparando audio" lo usa para recién ahí cambiarlo por el
  /// ícono de "hablando", en vez de tenerlo prendido hasta el final.
  Future<void> speakChunks(List<String> rawChunks, {void Function()? onFirstAudioStart}) async {
    await _ensureVoiceLoaded();
    final texts = rawChunks.map(speakableText).where((t) => t.trim().isNotEmpty).toList();
    if (texts.isEmpty) return;

    Future<Uint8List?>? pendingAudio = _synthesizeOpenAi(texts[0]);
    for (var i = 0; i < texts.length; i++) {
      final bytes = await pendingAudio;
      // Ni bien tenemos (o falló) el audio de ESTE trozo, ya se pide el
      // siguiente en paralelo — no se espera a que termine de sonar el
      // actual, para que esté listo (o casi) cuando le toque el turno.
      pendingAudio = (i + 1 < texts.length) ? _synthesizeOpenAi(texts[i + 1]) : null;
      if (i == 0) onFirstAudioStart?.call();
      if (bytes != null) {
        await _playBytes(bytes);
      } else {
        await _localTts.setLanguage('es-AR');
        await _localTts.speak(texts[i]);
      }
    }
  }

  Future<Uint8List?> _synthesizeOpenAi(String text) async {
    try {
      final response = await ApiClient.instance.dio.post<List<int>>(
        '/me/health-assistant/speech',
        data: {'text': text, 'voice': _voice},
        options: Options(responseType: ResponseType.bytes),
      );
      return Uint8List.fromList(response.data!);
    } catch (_) {
      return null;
    }
  }

  Future<void> _playBytes(Uint8List bytes) async {
    final completer = Completer<void>();
    late final StreamSubscription<void> sub;
    sub = _audioPlayer.onPlayerComplete.listen((_) {
      sub.cancel();
      if (!completer.isCompleted) completer.complete();
    });
    await _audioPlayer.play(BytesSource(bytes));
    await completer.future;
  }

  Future<bool> _speakWithOpenAi(String text) async {
    final bytes = await _synthesizeOpenAi(text);
    if (bytes == null) return false;
    await _playBytes(bytes);
    return true;
  }

  Future<void> stop() async {
    await _audioPlayer.stop();
    await _localTts.stop();
  }

  void dispose() {
    _audioPlayer.dispose();
  }
}
