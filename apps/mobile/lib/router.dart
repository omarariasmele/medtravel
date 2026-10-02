import 'package:go_router/go_router.dart';

import 'core/auth_state.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/auth/forgot_password_screen.dart';
import 'features/auth/verify_email_screen.dart';
import 'features/home/home_shell.dart';
import 'features/profile/profile_screen.dart';
import 'features/health/health_records_screen.dart';
import 'features/share/share_screen.dart';
// ignore: unused_import
import 'features/assistant/assistant_screen.dart'; // motor de voz viejo (speech_to_text) — plan de contingencia, ver el comentario en /assistant más abajo
import 'features/assistant/realtime_app_help_screen.dart';
// ignore: unused_import
import 'features/assistant/health_assistant_screen.dart'; // motor de texto viejo — plan de contingencia, ver el comentario en /health-assistant más abajo
import 'features/assistant/realtime_health_assistant_screen.dart';
import 'features/emergency/case_chat_screen.dart';
import 'features/emergency/case_detail_screen.dart';

/// /login y /register quedan fuera del shell (sin bottom nav) — mismo
/// criterio que App.tsx en admin-web. El redirect central evita el
/// típico problema de "quedó en /login ya logueado" o viceversa.
GoRouter buildRouter(AuthState authState) {
  return GoRouter(
    refreshListenable: authState,
    initialLocation: '/',
    redirect: (context, state) {
      if (authState.isLoading) return null;
      final loggingIn = state.matchedLocation == '/login' ||
          state.matchedLocation == '/register' ||
          state.matchedLocation == '/forgot-password';
      if (!authState.isAuthenticated && !loggingIn) return '/login';
      if (authState.isAuthenticated && loggingIn) return '/';
      // Pedido explícito del usuario: "la app hasta que no este
      // validado el mail no deberia permitir su uso" — /profile queda
      // afuera del bloqueo para poder corregir un email mal escrito
      // (si no, quedaría sin forma de arreglarlo).
      if (authState.isAuthenticated && !authState.emailVerified) {
        final exempt = state.matchedLocation == '/verify-email' ||
            state.matchedLocation == '/profile';
        if (!exempt) return '/verify-email';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/register', builder: (context, state) => const RegisterScreen()),
      GoRoute(path: '/forgot-password', builder: (context, state) => const ForgotPasswordScreen()),
      GoRoute(path: '/verify-email', builder: (context, state) => const VerifyEmailScreen()),
      GoRoute(path: '/', builder: (context, state) => const HomeShell()),
      GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
      GoRoute(path: '/health', builder: (context, state) => const HealthRecordsScreen()),
      GoRoute(path: '/share', builder: (context, state) => const ShareScreen()),
      // Pedido explícito del usuario: "migrar a voz en tiempo real" —
      // mismo motor Realtime que Clásico/Estructurado (ver
      // realtime_app_help_screen.dart). assistant_screen.dart (el motor
      // viejo, speech_to_text) queda sin tocar como plan de contingencia:
      // si hace falta volver atrás, alcanza con cambiar este `builder` a
      // `const AssistantScreen()`, sin tocar nada más.
      GoRoute(path: '/assistant', builder: (context, state) => const RealtimeAppHelpScreen()),
      GoRoute(
        path: '/health-assistant',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>?;
          final structuredModel = extra?['structuredModel'] as bool? ?? false;
          // Los dos modos pasaron a usar el motor de voz en tiempo real
          // (ver realtime_health_assistant_screen.dart) — Estructurado
          // pide un guion fijo (RealtimeVoiceEngine.structuredModel,
          // ver AIService.createStructuredRealtimeSession) en vez de la
          // charla libre de Clásico, pero es la MISMA pantalla y el
          // MISMO motor. health_assistant_screen.dart (el motor de
          // texto viejo) queda sin tocar y sigue siendo el plan de
          // contingencia completo: si Realtime no llega sólido a la
          // demo, alcanza con volver este `return` a
          // `HealthAssistantScreen(structuredModel: true)` para
          // Estructurado, sin tocar nada más.
          return RealtimeHealthAssistantScreen(structuredModel: structuredModel);
        },
      ),
      GoRoute(
        path: '/cases/:id',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>?;
          return CaseDetailScreen(
            caseId: state.pathParameters['id']!,
            channelId: extra?['channelId'] as String?,
            caseNumber: extra?['caseNumber'] as String?,
          );
        },
      ),
      GoRoute(
        path: '/cases/:id/chat',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>?;
          return CaseChatScreen(
            caseId: state.pathParameters['id']!,
            channelId: extra?['channelId'] as String?,
            caseNumber: extra?['caseNumber'] as String?,
          );
        },
      ),
    ],
  );
}
