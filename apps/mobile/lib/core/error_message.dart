import 'package:dio/dio.dart';

/// Bug real reportado en vivo: login_screen.dart (y otras pantallas de
/// auth) usaban `catch (_) { _error = 'Email o contraseña incorrectos.' }`
/// — un catch genérico que le ponía ESE mensaje a cualquier falla, sin
/// distinguir credenciales inválidas de un error de red o de la sesión
/// única bloqueando el login (que el backend ya manda con su propio
/// mensaje claro, mismo status 401 que credenciales inválidas — no se
/// puede distinguir por status code, hay que mostrar el mensaje real).
String dioErrorMessage(Object error, String fallback) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map) {
      final message = data['message'];
      // El ValidationPipe global de NestJS manda `message` como lista de
      // errores (uno por campo, ej. "password must be longer than or
      // equal to 8 characters") en vez de un string — bug real: esto
      // caía siempre al fallback genérico y el usuario nunca se enteraba
      // de qué campo estaba mal.
      if (message is String) return message;
      if (message is List && message.isNotEmpty) {
        return message.map((m) => m.toString()).join(' — ');
      }
    }
    if (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout) {
      return 'No se pudo conectar al servidor. Revisá tu conexión e intentá de nuevo.';
    }
  }
  return fallback;
}
