import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  apiClient,
  clearTokens,
  getAccessToken,
  setTokens,
} from '../lib/api-client';

interface JwtClaims {
  sub: string;
  personId?: string;
  tenantId?: string;
  sessionId?: string;
}

interface LoginResult {
  mfaRequired?: boolean;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  claims: JwtClaims | null;
  login: (email: string, password: string, mfaCode?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeClaims(token: string): JwtClaims {
  const payload = token.split('.')[1];
  return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [claims, setClaims] = useState<JwtClaims | null>(() => {
    const token = getAccessToken();
    return token ? decodeClaims(token) : null;
  });

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      setClaims(decodeClaims(token));
    }
  }, []);

  const login = async (
    email: string,
    password: string,
    mfaCode?: string,
  ): Promise<LoginResult> => {
    const { data } = await apiClient.post('/auth/login', {
      email,
      password,
      mfaCode,
    });

    if (data.mfaRequired) {
      return { mfaRequired: true };
    }

    setTokens(data.accessToken, data.refreshToken);
    setClaims(decodeClaims(data.accessToken));
    return {};
  };

  const logout = async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      clearTokens();
      setClaims(null);
    }
  };

  const value = useMemo(
    () => ({ isAuthenticated: claims !== null, claims, login, logout }),
    [claims],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}
