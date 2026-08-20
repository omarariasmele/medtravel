/// Bug real reportado en vivo: al escribir "años" (o cualquier palabra
/// con ñ/á/é/í/ó/ú/ü) en el chat del asistente de salud, en vez de la
/// letra acentuada aparecía "un símbolo y una n a continuación" — el
/// teclado del dispositivo compone la letra en dos eventos (la marca
/// diacrítica sola, ej. el signo de tilde flotante U+0303, seguida del
/// carácter base "n"), y el TextField la deja tal cual llegó en vez de
/// combinarla en un solo carácter "ñ" (forma NFC). Dart no tiene
/// normalización Unicode nativa, así que se resuelve a mano para el
/// alfabeto español, en cualquier orden (marca+letra o letra+marca,
/// según cómo la mande el teclado) — se aplica siempre que se envía o
/// guarda texto tipeado por el viajero, para que el dato que llega al
/// servidor esté siempre bien formado aunque la vista en pantalla
/// mientras se escribe se vea rara.
const Map<String, Map<String, String>> _combiningMarks = {
  '́': {'a': 'á', 'e': 'é', 'i': 'í', 'o': 'ó', 'u': 'ú', 'A': 'Á', 'E': 'É', 'I': 'Í', 'O': 'Ó', 'U': 'Ú'},
  '̀': {'a': 'à', 'e': 'è', 'i': 'ì', 'o': 'ò', 'u': 'ù', 'A': 'À', 'E': 'È', 'I': 'Ì', 'O': 'Ò', 'U': 'Ù'},
  '̃': {'n': 'ñ', 'N': 'Ñ'},
  '̈': {'u': 'ü', 'U': 'Ü'},
};

String normalizeSpanishAccents(String input) {
  final runes = input.runes.toList();
  final result = <int>[];
  var i = 0;
  while (i < runes.length) {
    final ch = String.fromCharCode(runes[i]);
    final markMap = _combiningMarks[ch];
    if (markMap != null && i + 1 < runes.length) {
      // Orden 1: la marca llegó suelta, seguida de la letra base.
      final nextCh = String.fromCharCode(runes[i + 1]);
      final merged = markMap[nextCh];
      if (merged != null) {
        result.addAll(merged.runes);
        i += 2;
        continue;
      }
    }
    if (markMap != null) {
      // Marca suelta sin letra con la que combinar — se descarta en vez
      // de dejar el símbolo flotante como texto suelto.
      i += 1;
      continue;
    }
    if (i + 1 < runes.length) {
      // Orden 2 (NFD estándar): letra base seguida de la marca.
      final nextMarkMap = _combiningMarks[String.fromCharCode(runes[i + 1])];
      if (nextMarkMap != null) {
        final merged = nextMarkMap[ch];
        if (merged != null) {
          result.addAll(merged.runes);
          i += 2;
          continue;
        }
      }
    }
    result.add(runes[i]);
    i += 1;
  }
  return String.fromCharCodes(result);
}
