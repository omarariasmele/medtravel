import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/tenant_config_service.dart';
import '../../l10n/app_strings.dart';
import '../health/health_records_screen.dart';
import '../coverages/coverages_screen.dart';
import '../trips/trips_screen.dart';
import '../emergency/emergency_screen.dart';
import 'home_screen.dart';

/// Shell con navegación inferior. Home y Salud son siempre visibles
/// (pedido explícito del usuario: ficha por formulario y compartir
/// quedan siempre activas) — Cobertura/Viajes/Emergencia se arman
/// dinámicamente según lo que la empresa activa del viajero tenga
/// habilitado (Fase 1). "Compartir" y "Asistente" viven como accesos
/// rápidos dentro de Inicio en vez de ocupar un tab (más de 5 ítems en
/// la bottom nav es mala práctica de UX), pero son pantallas de primer
/// nivel igual (navegación normal por arriba del shell, no anidada).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _NavTab {
  const _NavTab({
    required this.screen,
    required this.icon,
    required this.selectedIcon,
    required this.labelKey,
  });

  final Widget screen;
  final IconData icon;
  final IconData selectedIcon;
  final String labelKey;
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final tenantConfig = context.watch<TenantConfigService>();

    final tabs = <_NavTab>[
      _NavTab(
        screen: const HomeScreen(),
        icon: Icons.home_outlined,
        selectedIcon: Icons.home,
        labelKey: 'nav.home',
      ),
      _NavTab(
        screen: const HealthRecordsScreen(),
        icon: Icons.medical_information_outlined,
        selectedIcon: Icons.medical_information,
        labelKey: 'nav.health',
      ),
      if (tenantConfig.isFeatureEnabled('nav.coverage_enabled'))
        _NavTab(
          screen: const CoveragesScreen(),
          icon: Icons.shield_outlined,
          selectedIcon: Icons.shield,
          labelKey: 'nav.coverage',
        ),
      if (tenantConfig.isFeatureEnabled('nav.trips_enabled'))
        _NavTab(
          screen: const TripsScreen(),
          icon: Icons.flight_outlined,
          selectedIcon: Icons.flight,
          labelKey: 'nav.trips',
        ),
      if (tenantConfig.isFeatureEnabled('nav.emergency_enabled'))
        _NavTab(
          screen: const EmergencyScreen(),
          icon: Icons.emergency_outlined,
          selectedIcon: Icons.emergency,
          labelKey: 'nav.emergency',
        ),
    ];

    final index = _index < tabs.length ? _index : 0;

    return Scaffold(
      body: IndexedStack(index: index, children: [for (final t in tabs) t.screen]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          for (final t in tabs)
            NavigationDestination(
              icon: Icon(t.icon),
              selectedIcon: Icon(t.selectedIcon),
              label: context.tr(t.labelKey),
            ),
        ],
      ),
    );
  }
}
