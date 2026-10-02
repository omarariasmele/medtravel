import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'core/api_client.dart';
import 'core/auth_state.dart';
import 'core/tenant_config_service.dart';
import 'core/theme.dart';
import 'router.dart';

/// Pedido explícito del usuario: poder usar la app local (USB + `adb
/// reverse`) o desde afuera (dominio público) sin reconstruir el APK
/// cada vez — se detecta sola antes de mostrar cualquier pantalla (ver
/// ApiClient.autoDetectBaseUrl).
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiClient.instance.autoDetectBaseUrl();
  runApp(const MedTravelApp());
}

class MedTravelApp extends StatefulWidget {
  const MedTravelApp({super.key});

  @override
  State<MedTravelApp> createState() => _MedTravelAppState();
}

class _MedTravelAppState extends State<MedTravelApp> {
  final AuthState _authState = AuthState()..bootstrap();
  // Bug real reportado en vivo: "la pantalla principal queda titilando
  // varias veces hasta que se establece" — buildRouter(authState) se
  // llamaba DENTRO de build(), así que cada vez que TenantConfigService
  // avisaba un cambio (ver HomeScreen._load, que ahora la refresca en
  // cada visita a Inicio) se armaba un GoRouter NUEVO, lo que desmonta
  // y remonta TODA la pila de navegación — HomeScreen volvía a
  // initState()/_load(), que volvía a refrescar TenantConfigService,
  // que volvía a disparar esto: un ciclo que tardaba varias vueltas en
  // asentarse. El router se arma UNA sola vez acá (mismo criterio que
  // _authState) y se reusa siempre, así que un cambio de marca/flags
  // solo actualiza colores/candados sin tocar la navegación.
  late final GoRouter _router = buildRouter(_authState);

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: _authState,
      child: Builder(
        builder: (context) {
          final authState = context.watch<AuthState>();
          // tenantConfig vive dentro de AuthState (mismo ciclo de vida
          // que la sesión) pero se expone como su propio
          // ChangeNotifierProvider para que cualquier pantalla pueda
          // escuchar solo cambios de marca sin re-renderizar por
          // cualquier otro cambio de AuthState (idioma, email
          // verificado, etc.).
          return ChangeNotifierProvider<TenantConfigService>.value(
            value: authState.tenantConfig,
            child: Builder(
              builder: (context) {
                final tenantConfig = context.watch<TenantConfigService>();
                // Mientras no sabemos si hay sesión guardada, ni el
                // router ni HomeShell deben montarse — HomeShell arma
                // sus pantallas de una (IndexedStack) y cada una
                // dispara su propio fetch en initState(), lo que
                // pegaría a la API sin token antes de que el redirect
                // a /login pueda actuar.
                if (authState.isLoading) {
                  return MaterialApp(
                    title: 'MedTravelApp',
                    debugShowCheckedModeBanner: false,
                    theme: buildAppTheme(brand: tenantConfig.brand),
                    home: const Scaffold(body: Center(child: CircularProgressIndicator())),
                  );
                }
                return MaterialApp.router(
                  title: 'MedTravelApp',
                  debugShowCheckedModeBanner: false,
                  theme: buildAppTheme(brand: tenantConfig.brand),
                  routerConfig: _router,
                );
              },
            ),
          );
        },
      ),
    );
  }
}
