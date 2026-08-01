import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'jwt.dart';

/// Estado de sesión global — mismo rol que auth-context.tsx en
/// admin-web, pero acá el viajero SIEMPRE tiene personId (no hay
/// concepto de operador/tenant del lado del viajero). isLoading cubre
/// el chequeo inicial de "¿ya había un token guardado?" al abrir la
/// app, para no mostrar el login por un instante antes de saber.
class AuthState extends ChangeNotifier {
  String? _personId;
  bool _isLoading = true;

  bool get isAuthenticated => _personId != null;
  String? get personId => _personId;
  bool get isLoading => _isLoading;

  Future<void> bootstrap() async {
    final token = await ApiClient.instance.getAccessToken();
    if (token != null) {
      try {
        final payload = decodeJwtPayload(token);
        _personId = payload['personId'] as String?;
      } catch (_) {
        _personId = null;
      }
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    final response = await ApiClient.instance.dio.post(
      '/auth/login',
      data: {'email': email, 'password': password},
    );
    await _applyTokens(response.data);
  }

  Future<void> register({
    required String firstName,
    required String lastName,
    required String email,
    required String password,
    String? preferredLang,
  }) async {
    final response = await ApiClient.instance.dio.post(
      '/auth/register',
      data: {
        'firstName': firstName,
        'lastName': lastName,
        'email': email,
        'password': password,
        if (preferredLang != null) 'preferredLang': preferredLang,
      },
    );
    await _applyTokens(response.data);
  }

  Future<void> _applyTokens(Map<String, dynamic> data) async {
    await ApiClient.instance.setTokens(
      data['accessToken'] as String,
      data['refreshToken'] as String,
    );
    final payload = decodeJwtPayload(data['accessToken'] as String);
    _personId = payload['personId'] as String?;
    notifyListeners();
  }

  Future<void> logout() async {
    await ApiClient.instance.clearTokens();
    _personId = null;
    notifyListeners();
  }
}
