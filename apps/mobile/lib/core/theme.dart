import 'package:flutter/material.dart';

/// Misma paleta que apps/admin-web/src/theme.ts — primary #0F6E5B
/// (verde MedTravelApp), secondary #1A73E8 — para que la marca sea
/// consistente entre panel y app.
ThemeData buildAppTheme() {
  const primary = Color(0xFF0F6E5B);
  const secondary = Color(0xFF1A73E8);

  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: primary,
      primary: primary,
      secondary: secondary,
      brightness: Brightness.light,
    ),
    appBarTheme: const AppBarTheme(
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
