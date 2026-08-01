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
    inputDecorationTheme: const InputDecorationTheme(
      border: OutlineInputBorder(),
    ),
  );
}
