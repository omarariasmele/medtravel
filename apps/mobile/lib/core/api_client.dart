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
  /// activo), se usa esa; si no, se cae al dominio público. Timeout
  /// corto a propósito — no vale la pena demorar el arranque de la app
  /// más de medio segundo para decidir esto.
  Future<void> autoDetectBaseUrl() async {
    if (_apiBaseUrlOverride.isNotEmpty) return;
    try {
      final probe = Dio(BaseOptions(
        baseUrl: _localBaseUrl,
        connectTimeout: const Duration(milliseconds: 500),
        receiveTimeout: const Duration(milliseconds: 500),
      ));
      final response = await probe.get('/health');
      if (response.statusCode == 200) return; // ya está en _localBaseUrl
    } catch (_) {
      // localhost no respondió — seguimos abajo con el dominio público.
    }
    _dio.options.baseUrl = _publicBaseUrl;
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
