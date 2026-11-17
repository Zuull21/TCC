import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth as authApi, setAuthLogout } from '../services/api';

const AuthContext = createContext(null);
const TOKEN_KEY = 'tourmap_token';
const CSRF_KEY  = 'tourmap_csrf';

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [token, setToken]       = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  // ── logout ───────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CSRF_KEY);
  }, []);

  // ── login ────────────────────────────────────────────────────────────────────
  const login = useCallback((jwt, userData, csrfToken) => {
    localStorage.setItem(TOKEN_KEY, jwt);
    if (csrfToken) localStorage.setItem(CSRF_KEY, csrfToken);
    setToken(jwt);
    setUser(userData);
  }, []);

  // ── updateUser ───────────────────────────────────────────────────────────────
  const updateUser = useCallback((data) => {
    setUser((prev) => ({ ...prev, ...data }));
  }, []);

  // ── Registra logout no interceptor do axios ───────────────────────────────
  useEffect(() => {
    setAuthLogout(logout);
  }, [logout]);

  // ── Valida token salvo ao montar ─────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setIsLoading(false);
      return;
    }

    setToken(stored);
    authApi
      .me()
      .then(({ data }) => {
        setUser(data.user);
      })
      .catch(() => {
        // Token inválido ou expirado — limpa silenciosamente
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, isAuthenticated, login, logout, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
