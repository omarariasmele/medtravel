import 'dart:convert';

/// Decodifica el payload de un JWT sin validar la firma (la firma ya la
/// validó el backend al emitirlo/refrescarlo) — solo para leer claims
/// localmente (personId, exp) sin otro roundtrip a la API.
Map<String, dynamic> decodeJwtPayload(String token) {
  final parts = token.split('.');
  if (parts.length != 3) return {};
  var payload = parts[1].replaceAll('-', '+').replaceAll('_', '/');
  switch (payload.length % 4) {
    case 2:
      payload += '==';
      break;
    case 3:
      payload += '=';
      break;
  }
  final decoded = utf8.decode(base64.decode(payload));
  return json.decode(decoded) as Map<String, dynamic>;
}
