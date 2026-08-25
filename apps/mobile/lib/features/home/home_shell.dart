import 'package:flutter/material.dart';

import '../../l10n/app_strings.dart';
import '../health/health_records_screen.dart';
import '../coverages/coverages_screen.dart';
import '../trips/trips_screen.dart';
import '../emergency/emergency_screen.dart';
import 'home_screen.dart';

/// Shell con navegación inferior — 5 secciones principales del viajero.
/// "Compartir" y "Asistente" viven como accesos rápidos dentro de Inicio
/// en vez de ocupar un tab (más de 5 ítems en la bottom nav es mala
/// práctica de UX), pero son pantallas de primer nivel igual (navegación
/// normal por arriba del shell, no anidada).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _screens = [
    HomeScreen(),
    HealthRecordsScreen(),
    CoveragesScreen(),
    TripsScreen(),
    EmergencyScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: context.tr('nav.home')),
          NavigationDestination(icon: const Icon(Icons.medical_information_outlined), selectedIcon: const Icon(Icons.medical_information), label: context.tr('nav.health')),
          NavigationDestination(icon: const Icon(Icons.shield_outlined), selectedIcon: const Icon(Icons.shield), label: context.tr('nav.coverage')),
          NavigationDestination(icon: const Icon(Icons.flight_outlined), selectedIcon: const Icon(Icons.flight), label: context.tr('nav.trips')),
          NavigationDestination(icon: const Icon(Icons.emergency_outlined), selectedIcon: const Icon(Icons.emergency), label: context.tr('nav.emergency')),
        ],
      ),
    );
  }
}
