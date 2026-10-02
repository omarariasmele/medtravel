import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'tenant_config_service.dart';

/// Fase 1 — logo de la empresa activa, con fallback al asset estático
/// de MedTravelApp (mismo criterio que buildAppTheme con los colores).
/// Solo se usa post-login (home_shell.dart) — las pantallas pre-login
/// (login/registro/olvidé mi contraseña) siguen con el asset fijo:
/// todavía no hay ningún tenant resuelto en ese momento.
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.height = 32});

  final double height;

  @override
  Widget build(BuildContext context) {
    final logoUrl = context.watch<TenantConfigService>().brand?.logoUrl;
    if (logoUrl == null || logoUrl.isEmpty) {
      return Image.asset('assets/images/logo-horizontal-blanco.png', height: height);
    }
    return Image.network(
      logoUrl,
      height: height,
      errorBuilder: (_, __, ___) =>
          Image.asset('assets/images/logo-horizontal-blanco.png', height: height),
    );
  }
}
