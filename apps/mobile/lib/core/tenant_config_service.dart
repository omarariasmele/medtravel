import 'package:flutter/material.dart';

import 'api_client.dart';

/// Fase 1 — marca (logo/colores) de la empresa activa del viajero.
/// Todos los campos son opcionales: si algo no vino (viajero recién
/// logueado, sin fetch todavía, o la empresa activa no tiene un
/// tenant_brand_profile cargado) buildAppTheme() cae al valor
/// hardcodeado actual — nunca queda la app sin colores.
class TenantBrand {
  const TenantBrand({
    this.logoUrl,
    this.logoDarkUrl,
    this.logoIconUrl,
    this.colorPrimary,
    this.colorSecondary,
    this.colorAccent,
    this.colorBgPrimary,
    this.colorTextPrimary,
  });

  final String? logoUrl;
  final String? logoDarkUrl;
  final String? logoIconUrl;
  final Color? colorPrimary;
  final Color? colorSecondary;
  final Color? colorAccent;
  final Color? colorBgPrimary;
  final Color? colorTextPrimary;

  static Color? _hex(String? value) {
    if (value == null || value.trim().isEmpty) return null;
    final hex = value.trim().replaceFirst('#', '');
    if (hex.length != 6) return null;
    final parsed = int.tryParse('FF$hex', radix: 16);
    return parsed != null ? Color(parsed) : null;
  }

  /// Bug real reportado en vivo: "no me cambia el logo" — el logo subido
  /// desde admin-web (POST /params/admin/tenant-brand-assets/upload)
  /// guarda una URL RELATIVA ('/uploads/tenant-brands/xyz.png') en
  /// core.tenant_brand_profiles. Image.network necesita una URL
  /// absoluta — sin esto fallaba en silencio (errorBuilder) y caía
  /// siempre al asset estático, sin ningún error visible. Se resuelve
  /// acá, contra la misma base URL que ya usa ApiClient (local vía adb
  /// reverse o dominio público, lo que corresponda en cada momento).
  static String? _resolveUrl(String? value) {
    if (value == null || value.isEmpty) return null;
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    return '${ApiClient.instance.dio.options.baseUrl}$value';
  }

  factory TenantBrand.fromResponse(
    Map<String, dynamic>? brand,
    Map<String, dynamic>? theme,
  ) {
    return TenantBrand(
      logoUrl: _resolveUrl(brand?['logoUrl'] as String?),
      logoDarkUrl: _resolveUrl(brand?['logoDarkUrl'] as String?),
      logoIconUrl: _resolveUrl(brand?['logoIconUrl'] as String?),
      colorPrimary: _hex(theme?['color_primary'] as String?),
      colorSecondary: _hex(theme?['color_secondary'] as String?),
      colorAccent: _hex(theme?['color_accent'] as String?),
      colorBgPrimary: _hex(theme?['color_bg_primary'] as String?),
      colorTextPrimary: _hex(theme?['color_text_primary'] as String?),
    );
  }
}

/// Fase 1 — reemplaza el patrón de "cada pantalla pide /params/app-
/// settings por su cuenta" por un fetch único cacheado, disparado desde
/// el mismo punto donde AuthState ya refresca el estado de sesión (ver
/// AuthState.refreshEmailVerified). GET /me/tenant-config siempre
/// devuelve datos reales de ALGÚN tenant (el propio o el de plataforma,
/// OYSGROUP) — nunca "sin marca", así que isFeatureEnabled() puede
/// asumir que _enabledFeatures ya tiene sentido apenas se resolvió una
/// vez, sin un branch especial de "todavía no sé".
class TenantConfigService extends ChangeNotifier {
  String? _tenantId;
  String? _tenantName;
  TenantBrand? _brand;
  Map<String, dynamic> _enabledFeatures = {};

  String? get tenantId => _tenantId;
  String? get tenantName => _tenantName;
  TenantBrand? get brand => _brand;

  /// Fail-open a propósito, mismo criterio que
  /// FeatureFlagEvaluationService del backend: un flag que la app
  /// todavía no conoce (o que no llegó a resolverse por un problema de
  /// red) nunca es motivo para esconder una función ya construida.
  bool isFeatureEnabled(String key) => _enabledFeatures[key] != false;

  Future<void> refresh() async {
    try {
      final response = await ApiClient.instance.dio.get('/me/tenant-config');
      final data = response.data as Map<String, dynamic>;
      _tenantId = data['tenantId'] as String?;
      _tenantName = data['tenantName'] as String?;
      final brandJson = data['brand'] as Map<String, dynamic>?;
      final themeJson = data['theme'] as Map<String, dynamic>?;
      _brand = TenantBrand.fromResponse(brandJson, themeJson);
      _enabledFeatures = (data['enabledFeatures'] as Map<String, dynamic>?) ?? {};
    } catch (_) {
      // Silencioso — mismo criterio que refreshEmailVerified: sin red no
      // se bloquea al viajero, se reintenta la próxima vez.
    }
    notifyListeners();
  }

  void reset() {
    _tenantId = null;
    _tenantName = null;
    _brand = null;
    _enabledFeatures = {};
    notifyListeners();
  }
}
