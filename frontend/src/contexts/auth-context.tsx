"use client"
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useNotification } from '@/contexts/notification-context';
import type { SafeUser } from '@/lib/session';

interface AuthContextType {
  user: SafeUser | null;
  login: (username: string, password: string) => Promise<SafeUser | null>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingOut: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // 🔐 CRYPTO: Détection si les données sont chiffrées (Base64 AES-GCM typique)
  const isEncrypted = (str?: string | null) => {
    if (!str) return false;
    // Les valeurs chiffrées commencent souvent par l'IV ou un format base64 long
    // On vérifie si ça ressemble à du base64 et si c'est assez long
    return str.length > 32 && /^[A-Za-z0-9+/=]+$/.test(str);
  };

  const isUserDataReady = user && !isEncrypted(user?.firstname) && !isEncrypted(user?.lastname);
  const router = useRouter();
  const { showSuccess } = useNotification();

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const res = await fetch('/api/me', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          return;
        }

        const data = await res.json();
        if (data?.user) {
          setUser(data.user as SafeUser);
        }
      } catch {
        // ignore errors, user will stay null
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrentUser();
  }, []);

  const login = async (username: string, password: string): Promise<SafeUser | null> => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      let message = 'Erreur de connexion';
      try {
        const data = await res.json();
        if (data?.error) {
          message = data.error as string;
        }
      } catch {
        // ignore JSON parse error, keep generic message
      }
      throw new Error(message);
    }

    const data = await res.json();
    if (data?.user) {
      setUser(data.user as SafeUser);
      
      // Attendre un court instant pour s'assurer que le cookie est bien propagé par le navigateur
      // avant de déclencher la redirection via window.location.href
      await new Promise(resolve => setTimeout(resolve, 150));

      // Retourner les données complètes pour que le composant puisse gérer la redirection
      return data;
    }

    return null;
  };

  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    // Couper immédiatement l'accès côté UI
    setUser(null);
    showSuccess('Vous avez été déconnecté');
    
    try {
      await fetch('/api/logout', {
        method: 'POST',
      });
    } catch {
      // on ignore les erreurs réseau ici, la session côté client est déjà fermée
    } finally {
      setIsLoggingOut(false);

      // Forcer une redirection / rafraîchissement complet vers la page de login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.replace('/login');
      }
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      isAuthenticated: !!user, 
      isLoading: isLoading || (!!user && !isUserDataReady), 
      isLoggingOut 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
