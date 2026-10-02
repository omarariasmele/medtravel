import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'jwt.dart';
import 'tenant_config_service.dart';

/// Estado de sesión global — mismo rol que auth-context.tsx en
/// admin-web, pero acá el viajero SIEMPRE tiene personId (no hay
/// concepto de operador/tenant del lado del viajero). isLoading cubre
/// el chequeo inicial de "¿ya había un token guardado?" al abrir la
/// app, para no mostrar el login por un instante antes de saber.
class AuthState extends ChangeNotifier {
  String? _personId;
  bool _isLoading = true;
  // Arranca en true a propósito: mientras no sabemos el estado real
  // (todavía no llegó la respuesta de /me/profile), no queremos
  // bloquear al viajero por las dudas — se corrige solo apenas
  // refreshEmailVerified() resuelve.
  bool _emailVerified = true;

  /// Fase 1 — marca/funciones de la empresa activa. Vive acá (no como
  /// segundo provider top-level independiente) porque su ciclo de vida
  /// es el mismo que el de la sesión: se refresca junto con
  /// refreshEmailVerified() y se resetea en logout().
  final TenantConfigService tenantConfig = TenantConfigService();

  bool get isAuthenticated => _personId != null;
  String? get personId => _personId;
  bool get isLoading => _isLoading;
  bool get emailVerified => _emailVerified;

  /// Pedido explícito del usuario: "la app debería estar en el idioma
  /// que seleccionó el usuario, así como todos los mensajes que
  /// recibe" — idioma real de la app (no solo del asistente de IA),
  /// leído una vez al bootstrap/login y disponible para cualquier
  /// pantalla vía `context.watch<AuthState>().preferredLang`. Arranca en
  /// 'es' hasta que se conoce el real (mismo criterio que
  /// _emailVerified arriba: nunca bloquea, se corrige sola).
  String _preferredLang = 'es';
  String get preferredLang => _preferredLang;

  /// Pedido explícito del usuario: "la app hasta que no este validado
  /// el mail no deberia permitir su uso" — el router (ver router.dart)
  /// redirige a /verify-email mientras esto sea false, así que hay que
  /// mantenerlo al día después de login/registro y de cualquier cambio
  /// de email desde el perfil.
  Future<void> refreshEmailVerified() async {
    try {
      final response = await ApiClient.instance.dio.get('/me/profile');
      _emailVerified = response.data['email_verified'] as bool? ?? true;
      // preferred_lang ya no debería venir con relleno de espacios
      // (columna pasada a VARCHAR), pero el trim() se deja como red de
      // seguridad barata — un idioma no reconocido nunca rompe nada,
      // solo se ignora y sigue en el default.
      final lang = (response.data['preferred_lang'] as String?)?.trim();
      if (lang != null && lang.isNotEmpty) _preferredLang = lang;
    } catch (_) {
      // Si falla la carga (sin conexión, etc.) no se bloquea al
      // viajero por un problema de red — se reintenta la próxima vez.
    }
    await tenantConfig.refresh();
    notifyListeners();
  }

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
    if (_personId != null) await refreshEmailVerified();
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
    required String docTypeId,
    required String docNumber,
    required String docCountryId,
    required bool consentAccepted,
    String? preferredLang,
    String? phone,
  }) async {
    final response = await ApiClient.instance.dio.post(
      '/auth/register',
      data: {
        'firstName': firstName,
        'lastName': lastName,
        'email': email,
        'password': password,
        'docTypeId': docTypeId,
        'docNumber': docNumber,
        'docCountryId': docCountryId,
        'consentAccepted': consentAccepted,
        if (preferredLang != null) 'preferredLang': preferredLang,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
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
    await refreshEmailVerified();
  }

  Future<void> logout() async {
    await ApiClient.instance.clearTokens();
    _personId = null;
    _emailVerified = true;
    tenantConfig.reset();
    notifyListeners();
  }
}
