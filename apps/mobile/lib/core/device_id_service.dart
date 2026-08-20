import 'dart:io';
import 'dart:math';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Bug real reportado en vivo: "si el usuario se conectó del mismo
/// dispositivo, no debería decir que hay otra sesión abierta" — el
/// backend nunca tenía forma de distinguir "mismo teléfono
/// reconectando" de "otro teléfono en paralelo" porque nadie mandaba
/// un identificador de dispositivo (ver auth.service.ts).
///
/// Pedido explícito del usuario (encontrado probando en vivo): la
/// primera versión de este servicio generaba un id propio y lo
/// guardaba en flutter_secure_storage — pero ESE almacenamiento se
/// borra al desinstalar la app (es parte de los datos de la app en
/// Android), así que una desinstalación + reinstalación se veía como
/// "otro dispositivo" y volvía a bloquear. Ahora se usa el
/// identificador de hardware/instalación del propio sistema operativo
/// (Android ID / identifierForVendor en iOS), que sobrevive a
/// desinstalar y reinstalar la app — solo cambia con un reset de
/// fábrica del equipo. Se cachea en secure storage solo para no
/// tener que consultar el plugin nativo en cada request.
class DeviceIdService {
  DeviceIdService._();
  static const _storage = FlutterSecureStorage();
  static const _key = 'medtravel_device_id';
  static String? _cached;

  static Future<String> getOrCreate() async {
    if (_cached != null) return _cached!;
    final existing = await _storage.read(key: _key);
    if (existing != null && existing.isNotEmpty) {
      _cached = existing;
      return existing;
    }
    final resolved = await _resolvePersistentId();
    await _storage.write(key: _key, value: resolved);
    _cached = resolved;
    return resolved;
  }

  static Future<String> _resolvePersistentId() async {
    try {
      final deviceInfo = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final info = await deviceInfo.androidInfo;
        // id (Settings.Secure.ANDROID_ID) — único por combinación
        // app-signing-key + usuario + dispositivo, sobrevive reinstalos.
        if (info.id.isNotEmpty) return 'android:${info.id}';
      } else if (Platform.isIOS) {
        final info = await deviceInfo.iosInfo;
        final vendorId = info.identifierForVendor;
        if (vendorId != null && vendorId.isNotEmpty) return 'ios:$vendorId';
      }
    } catch (_) {
      // Sigue al fallback de abajo — mejor un id aleatorio (que degrada
      // a "cada reinstalación cuenta como dispositivo nuevo") que un
      // login roto si el plugin nativo falla en algún equipo puntual.
    }
    return 'fallback:${_generateRandomId()}';
  }

  static String _generateRandomId() {
    final rnd = Random.secure();
    final bytes = List<int>.generate(16, (_) => rnd.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }
}
