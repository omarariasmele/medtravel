import 'api_client.dart';

class CatalogValue {
  CatalogValue({
    required this.id,
    required this.code,
    required this.labelEs,
    this.labelEn,
    this.labelPt,
    this.labelFr,
    this.metadata = const {},
  });

  final String id;
  final String code;
  final String labelEs;
  // El backend ya devuelve estas 3 (params.catalog_values.label_en/pt/fr,
  // ver CatalogsService) — no todos los catálogos las tienen cargadas
  // todavía, por eso son opcionales y label() cae a labelEs si falta.
  final String? labelEn;
  final String? labelPt;
  final String? labelFr;
  final Map<String, dynamic> metadata;

  factory CatalogValue.fromJson(Map<String, dynamic> json) => CatalogValue(
        id: json['id'] as String,
        code: json['code'] as String,
        labelEs: json['labelEs'] as String,
        labelEn: json['labelEn'] as String?,
        labelPt: json['labelPt'] as String?,
        labelFr: json['labelFr'] as String?,
        metadata: (json['metadata'] as Map<String, dynamic>?) ?? const {},
      );

  /// Etiqueta en el idioma actual de la app (ver AppStrings/context.tr) —
  /// cae a labelEs si el catálogo todavía no tiene traducción cargada
  /// para ese idioma.
  String label(String lang) {
    switch (lang) {
      case 'en':
        return (labelEn?.trim().isNotEmpty ?? false) ? labelEn! : labelEs;
      case 'pt':
        return (labelPt?.trim().isNotEmpty ?? false) ? labelPt! : labelEs;
      case 'fr':
        return (labelFr?.trim().isNotEmpty ?? false) ? labelFr! : labelEs;
      default:
        return labelEs;
    }
  }
}

/// Mismo endpoint público que usa admin-web (GET /params/catalogs/:code,
/// sin guard — ver catalogs.controller.ts), con un cache simple en
/// memoria por proceso: los catálogos cambian poco y se piden desde
/// varias pantallas distintas.
class CatalogService {
  CatalogService._();
  static final _cache = <String, List<CatalogValue>>{};

  static Future<List<CatalogValue>> get(String domainCode) async {
    if (_cache.containsKey(domainCode)) {
      return _cache[domainCode]!;
    }
    final response = await ApiClient.instance.dio.get('/params/catalogs/$domainCode');
    final values = (response.data as List)
        .map((e) => CatalogValue.fromJson(e as Map<String, dynamic>))
        .toList();
    _cache[domainCode] = values;
    return values;
  }

  static String labelFor(List<CatalogValue> values, String? id, {String lang = 'es'}) {
    if (id == null) return '—';
    return values.firstWhere(
      (v) => v.id == id,
      orElse: () => CatalogValue(id: id, code: id, labelEs: id),
    ).label(lang);
  }

  /// Pedido explícito del usuario: alergias/medicamentos/implantes/
  /// enfermedades/cirugías se cargan eligiendo de una tabla; si el
  /// texto no matchea ninguna opción existente, se crea una entrada
  /// nueva (marcada "pendiente de revisión" en admin-web) en vez de
  /// bloquear la carga — mismo backend que usa la IA para lo mismo.
  static Future<String?> resolveOrCreate(String domainCode, String text, List<CatalogValue> catalog) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return null;
    for (final c in catalog) {
      if (c.labelEs.trim().toLowerCase() == trimmed.toLowerCase()) return c.id;
    }
    final response = await ApiClient.instance.dio.post('/params/catalog-values/resolve', data: {
      'domainCode': domainCode,
      'text': trimmed,
    });
    return response.data['id'] as String;
  }
}
