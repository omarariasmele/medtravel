import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// URL base de apps/api-core. En emulador Android, localhost del host
/// se accede como 10.0.2.2 — en web/desktop/iOS-simulator es localhost
/// directo. Cambiar acá si se prueba contra un dispositivo físico en
/// la misma red (usar la IP de la máquina que corre api-core).
String get apiBaseUrl {
  if (kIsWeb) return 'http://localhost:3000';
  if (defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
}

const _accessTokenKey = 'medtravel_access_token';
const _refreshTokenKey = 'medtravel_refresh_token';

/// Mismo patrón que apps/admin-web/src/lib/api-client.ts: tokens en
/// almacenamiento seguro del dispositivo (Keychain/Keystore/EncryptedSharedPrefs
/// vía flutter_secure_storage), interceptor que agrega el Bearer y
/// reintenta una vez con /auth/refresh ante un 401.
class ApiClient {
  ApiClient._internal() {
    _dio = Dio(BaseOptions(baseUrl: apiBaseUrl));
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.read(key: _accessTokenKey);
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
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

  Future<bool> _tryRefresh() async {
    final refreshToken = await _storage.read(key: _refreshTokenKey);
    if (refreshToken == null) return false;
    try {
      final response = await Dio(BaseOptions(baseUrl: apiBaseUrl)).post(
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
