import 'dart:io';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'device_id_service.dart';

/// URL base de apps/api-core. Por defecto sigue siendo localhost — en
/// emulador Android eso se accede como 10.0.2.2, en un dispositivo
/// físico por USB usamos `adb reverse tcp:3000 tcp:3000` y localhost
/// normal (más confiable que la IP LAN, no depende de estar en la
/// misma WiFi). Si volvés a probar en el emulador, cambiar esto de
/// nuevo a 10.0.2.2.
const String _apiBaseUrlOverride = String.fromEnvironment('API_BASE_URL');
const String _localBaseUrl = 'http://localhost:3000';
const String _publicBaseUrl = 'https://medtravelapp.oysgroup.com.ar:8443';

String get apiBaseUrl {
  if (_apiBaseUrlOverride.isNotEmpty) return _apiBaseUrlOverride;
  return _localBaseUrl;
}

/// El dominio de la demo pública usa un certificado autofirmado por
/// Caddy (Let's Encrypt no puede validar el dominio en puertos no
/// estándar como 8100/8443 — exige el 80/443 reales). Se acepta ese
/// certificado puntual SOLO para ese host — nunca en blanco para
/// cualquier servidor, eso sí sería inseguro.
const String _pinnedDemoHost = 'medtravelapp.oysgroup.com.ar';

void _allowPinnedDemoCertificate(Dio dio) {
  final adapter = dio.httpClientAdapter;
  if (adapter is IOHttpClientAdapter) {
    adapter.createHttpClient = () {
      final client = HttpClient();
      client.badCertificateCallback = (cert, host, port) => host == _pinnedDemoHost;
      return client;
    };
  }
}

const _accessTokenKey = 'medtravel_access_token';
const _refreshTokenKey = 'medtravel_refresh_token';

/// Mismo patrón que apps/admin-web/src/lib/api-client.ts: tokens en
/// almacenamiento seguro del dispositivo (Keychain/Keystore/EncryptedSharedPrefs
/// vía flutter_secure_storage), interceptor que agrega el Bearer y
/// reintenta una vez con /auth/refresh ante un 401.
class ApiClient {
  ApiClient._internal() {
    _dio = Dio(
      BaseOptions(
        baseUrl: apiBaseUrl,
        // Identifica el cliente ante /auth/login: una cuenta de
        // operador/staff no debe poder loguearse desde la app del
        // viajero (son poblaciones de usuario separadas).
        headers: {'X-Client-App': 'mobile'},
        // Bug real reportado en vivo: el asistente de voz en tiempo
        // real decía "problema técnico, no se pudo guardar" — pero el
        // log del servidor mostraba el INSERT + COMMIT exitoso cada
        // vez. Sin timeout acá, Dio esperaba indefinidamente una
        // respuesta que a veces nunca llegaba (típico de `adb reverse`
        // sobre USB: el túnel puede quedar "medio abierto" sin cerrar
        // la conexión prolijamente) — el viajero terminaba hablando de
        // nuevo mucho antes de que Dio se diera por vencido, generando
        // reintentos (y filas duplicadas) sin necesidad. Con un límite
        // razonable, una conexión realmente colgada falla rápido y cae
        // en el reintento normal (ver withRealtimeNetworkRetry) en vez
        // de quedarse esperando en silencio.
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        sendTimeout: const Duration(seconds: 15),
      ),
    );
    _allowPinnedDemoCertificate(_dio);
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.read(key: _accessTokenKey);
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          // Identifica el dispositivo ante /auth/login y /auth/register
          // (ver DeviceIdService) — le permite al backend distinguir
          // "mismo teléfono reconectando" de "otro dispositivo en
          // paralelo" en vez de bloquear cualquier reconexión.
          options.headers['X-Device-Id'] = await DeviceIdService.getOrCreate();
          handler.next(options);
        },
        onError: (error, handler) async {
          final status = error.response?.statusCode;
          final alreadyRetried = error.requestOptions.extra['retried'] == true;
          if (status == 401 && !alreadyRetried) {
            final refreshed = await _tryRefresh();
            if (refreshed) {
              final opts = error.requestOptions;
              opts.extra['retried'] = true;
              try {
                final response = await _dio.fetch(opts);
                handler.resolve(response);
                return;
              } catch (_) {
                // sigue al rechazo de abajo
              }
            }
          }
          handler.next(error);
        },
      ),
    );
  }

  static final ApiClient instance = ApiClient._internal();
  late final Dio _dio;
  final _storage = const FlutterSecureStorage();

  Dio get dio => _dio;

  /// Pedido explícito del usuario: poder usar la app local (USB +
  /// `adb reverse`) o desde afuera (dominio público) SIN reconstruir
  /// el APK cada vez — antes había que elegir la URL en tiempo de
  /// compilación con --dart-define. Ahora se detecta sola al arrancar:
  /// si localhost:3000 responde (típico con el cable + adb reverse
  /// activo), se usa esa; si no, se cae al dominio público.
  ///
  /// Bug real reportado en vivo: "borro algo y lo confirmo pero no se
  /// borra" — confirmado con logs del backend local, el pedido nunca
  /// llegó. Causa: esto probaba UNA sola vez con 500ms de timeout al
  /// arrancar la app — si en ESE instante puntual el backend local
  /// estaba reiniciando (`nest start --watch` recompilando tras un
  /// cambio de código) o el túnel `adb reverse` todavía no estaba
  /// activo, la detección fallaba y la app quedaba pegada al dominio
  /// público por el resto de esa sesión — sin volver a intentar, ni
  /// avisar. Ahora reintenta una vez más tras una pausa corta antes de
  /// resignarse al público — cubre el caso típico de desarrollo donde
  /// el backend está reiniciando en el momento exacto en que la app
  /// arranca, sin demorar el arranque en el caso normal (responde al
  /// primer intento).
  Future<void> autoDetectBaseUrl() async {
    if (_apiBaseUrlOverride.isNotEmpty) return;
    if (await _probeLocalBackend()) return;
    await Future.delayed(const Duration(milliseconds: 800));
    if (await _probeLocalBackend()) return;
    _dio.options.baseUrl = _publicBaseUrl;
  }

  Future<bool> _probeLocalBackend() async {
    try {
      final probe = Dio(BaseOptions(
        baseUrl: _localBaseUrl,
        connectTimeout: const Duration(milliseconds: 500),
        receiveTimeout: const Duration(milliseconds: 500),
      ));
      final response = await probe.get('/health');
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// El refresh token es de un solo uso — el backend lo rota en la
  /// misma fila de sesión en cada /auth/refresh (auth.service.ts,
  /// issueTokenPair con existingSessionId). Al reabrir la app después
  /// de que venza el access token (15 min), varias pantallas piden datos
  /// en paralelo y TODAS reciben 401 casi al mismo tiempo — sin este
  /// candado, cada una llamaba a /auth/refresh por su cuenta con el
  /// MISMO refresh token: la primera lo rotaba con éxito, y las
  /// siguientes fallaban contra el hash ya viejo y terminaban
  /// deslogueando a la persona pese a que la sesión en realidad se había
  /// renovado bien. Reportado por el usuario: "cuando cierro la app y
  /// vuelvo a entrar tengo que volver a loguearme".
  Future<bool>? _refreshFuture;

  Future<bool> _tryRefresh() {
    return _refreshFuture ??= _doRefresh().whenComplete(() {
      _refreshFuture = null;
    });
  }

  Future<bool> _doRefresh() async {
    final refreshToken = await _storage.read(key: _refreshTokenKey);
    if (refreshToken == null) return false;
    try {
      // _dio.options.baseUrl (no apiBaseUrl) — autoDetectBaseUrl() puede
      // haberlo cambiado al público después de construir el cliente.
      final refreshDio = Dio(BaseOptions(baseUrl: _dio.options.baseUrl));
      _allowPinnedDemoCertificate(refreshDio);
      final response = await refreshDio.post(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      await setTokens(
        response.data['accessToken'] as String,
        response.data['refreshToken'] as String,
      );
      return true;
    } catch (_) {
      await clearTokens();
      return false;
    }
  }

  Future<void> setTokens(String accessToken, String refreshToken) async {
    await _storage.write(key: _accessTokenKey, value: accessToken);
    await _storage.write(key: _refreshTokenKey, value: refreshToken);
  }

  Future<String?> getAccessToken() => _storage.read(key: _accessTokenKey);

  Future<void> clearTokens() async {
    await _storage.delete(key: _accessTokenKey);
    await _storage.delete(key: _refreshTokenKey);
  }
}
