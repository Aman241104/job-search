'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, AuthUser } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import { GlobalSearchProvider } from '@/components/GlobalSearch';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, logout: async () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

// /login is the only route that renders without a session — every other
// page redirects there until api.me() resolves to a real user.
const PUBLIC_PATHS = ['/login'];

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    api.me().then((u) => {
      setUser(u);
      setLoading(false);
      if (!u && !PUBLIC_PATHS.includes(pathname)) {
        router.replace('/login');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = async () => {
    await api.logout();
    setUser(null);
    router.replace('/login');
  };

  if (PUBLIC_PATHS.includes(pathname)) {
    return <AuthContext.Provider value={{ user, loading, logout }}>{children}</AuthContext.Provider>;
  }

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen text-white/30 font-mono text-sm">
        Loading...
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      <GlobalSearchProvider>
        <div className="relative z-10 flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-y-auto min-h-screen">{children}</main>
        </div>
      </GlobalSearchProvider>
    </AuthContext.Provider>
  );
}
