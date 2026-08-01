import 'package:flutter/material.dart';

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
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Inicio'),
          NavigationDestination(icon: Icon(Icons.medical_information_outlined), selectedIcon: Icon(Icons.medical_information), label: 'Salud'),
          NavigationDestination(icon: Icon(Icons.shield_outlined), selectedIcon: Icon(Icons.shield), label: 'Cobertura'),
          NavigationDestination(icon: Icon(Icons.flight_outlined), selectedIcon: Icon(Icons.flight), label: 'Viajes'),
          NavigationDestination(icon: Icon(Icons.emergency_outlined), selectedIcon: Icon(Icons.emergency), label: 'Emergencia'),
        ],
      ),
    );
  }
}
