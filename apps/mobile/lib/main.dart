import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/auth_state.dart';
import 'core/theme.dart';
import 'router.dart';

void main() {
  runApp(const MedTravelApp());
}

class MedTravelApp extends StatelessWidget {
  const MedTravelApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AuthState()..bootstrap(),
      child: Builder(
        builder: (context) {
          final authState = context.watch<AuthState>();
          // Mientras no sabemos si hay sesión guardada, ni el router ni
          // HomeShell deben montarse — HomeShell arma sus 5 pantallas de
          // una (IndexedStack) y cada una dispara su propio fetch en
          // initState(), lo que pegaría a la API sin token antes de que
          // el redirect a /login pueda actuar.
          if (authState.isLoading) {
            return MaterialApp(
              title: 'MedTravelApp',
              debugShowCheckedModeBanner: false,
              theme: buildAppTheme(),
              home: const Scaffold(body: Center(child: CircularProgressIndicator())),
            );
          }
          return MaterialApp.router(
            title: 'MedTravelApp',
            debugShowCheckedModeBanner: false,
            theme: buildAppTheme(),
            routerConfig: buildRouter(authState),
          );
        },
      ),
    );
  }
}
