import 'package:flutter/material.dart';

import 'tenant_config_service.dart';

/// Misma paleta que apps/admin-web/src/theme.ts — primary #0F6E5B
/// (verde MedTravelApp), secondary #1A73E8 — usada como fallback
/// cuando `brand` es null o no trae un color puntual (Fase 1: viajero
/// sin marca resuelta todavía, o la empresa activa no tiene tema
/// configurado).
ThemeData buildAppTheme({TenantBrand? brand}) {
  final primary = brand?.colorPrimary ?? const Color(0xFF0F6E5B);
  final secondary = brand?.colorSecondary ?? const Color(0xFF1A73E8);

  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: primary,
      primary: primary,
      secondary: secondary,
      // "Acento"/"Fondo"/"Texto" del panel — antes se guardaban en
      // core.tenant_brand_profiles pero no se usaban acá. tertiary es
      // el color de acento (Material 3 lo usa en algunos highlights
      // secundarios); surface/onSurface son el fondo de pantallas y
      // el color de texto principal sobre ese fondo.
      tertiary: brand?.colorAccent,
      surface: brand?.colorBgPrimary,
      onSurface: brand?.colorTextPrimary,
      brightness: Brightness.light,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: primary,
      foregroundColor: Colors.white,
    ),
    // Sin esto, el TabBar dentro del AppBar (ver "Ficha médica") usa el
    // color de texto por defecto de Material 3 (oscuro) — invisible
    // sobre el fondo verde del AppBar.
    tabBarTheme: const TabBarThemeData(
      labelColor: Colors.white,
      unselectedLabelColor: Colors.white70,
      indicatorColor: Colors.white,
    ),
    inputDecorationTheme: const InputDecorationTheme(
      border: OutlineInputBorder(),
    ),
  );
}
