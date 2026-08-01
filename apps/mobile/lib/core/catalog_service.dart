import 'api_client.dart';

class CatalogValue {
  CatalogValue({required this.id, required this.code, required this.labelEs});

  final String id;
  final String code;
  final String labelEs;

  factory CatalogValue.fromJson(Map<String, dynamic> json) => CatalogValue(
        id: json['id'] as String,
        code: json['code'] as String,
        labelEs: json['labelEs'] as String,
      );
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

  static String labelFor(List<CatalogValue> values, String? id) {
    if (id == null) return '—';
    return values.firstWhere(
      (v) => v.id == id,
      orElse: () => CatalogValue(id: id, code: id, labelEs: id),
    ).labelEs;
  }
}
