import 'package:go_router/go_router.dart';

import 'core/auth_state.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/home/home_shell.dart';
import 'features/profile/profile_screen.dart';
import 'features/health/health_records_screen.dart';
import 'features/share/share_screen.dart';
import 'features/assistant/assistant_screen.dart';
import 'features/assistant/health_assistant_screen.dart';
import 'features/emergency/case_chat_screen.dart';

/// /login y /register quedan fuera del shell (sin bottom nav) — mismo
/// criterio que App.tsx en admin-web. El redirect central evita el
/// típico problema de "quedó en /login ya logueado" o viceversa.
GoRouter buildRouter(AuthState authState) {
  return GoRouter(
    refreshListenable: authState,
    initialLocation: '/',
    redirect: (context, state) {
      if (authState.isLoading) return null;
      final loggingIn = state.matchedLocation == '/login' || state.matchedLocation == '/register';
      if (!authState.isAuthenticated && !loggingIn) return '/login';
      if (authState.isAuthenticated && loggingIn) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/register', builder: (context, state) => const RegisterScreen()),
      GoRoute(path: '/', builder: (context, state) => const HomeShell()),
      GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
      GoRoute(path: '/health', builder: (context, state) => const HealthRecordsScreen()),
      GoRoute(path: '/share', builder: (context, state) => const ShareScreen()),
      GoRoute(path: '/assistant', builder: (context, state) => const AssistantScreen()),
      GoRoute(path: '/health-assistant', builder: (context, state) => const HealthAssistantScreen()),
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
