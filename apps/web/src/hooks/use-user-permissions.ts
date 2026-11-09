'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { io, type Socket } from 'socket.io-client';

/**
 * Hook de gestion des permissions RBAC côté client.
 *
 * Les permissions sont récupérées depuis /api/user/permissions (proxy NestJS).
 * Elles sont automatiquement rafraîchies via WebSocket à chaque changement.
 *
 * API exposée :
 *   has(permission)          — l'utilisateur a-t-il cette permission ?
 *   canAny([...])            — l'utilisateur a-t-il AU MOINS UNE de ces permissions ?
 *   canAll([...])            — l'utilisateur a-t-il TOUTES ces permissions ?
 *   getUserPermissions()     — liste complète des noms de permissions
 *   refetch()                — rafraîchissement manuel
 */
export function useUserPermissions() {
  const { user } = useAuth();
  const [permissionSet, setPermissionSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  const fetchPermissions = useCallback(async () => {
    if (!user) {
      setPermissionSet(new Set());
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/user/permissions', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const names: string[] = data.permissions ?? [];
        setPermissionSet(new Set(names));
      }
    } catch {
      // Silently ignore — permissions restent inchangées
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const id = setTimeout(() => { void fetchPermissions(); }, 0);
    return () => clearTimeout(id);
  }, [fetchPermissions]);

  // WebSocket : invalidation temps réel des permissions
  useEffect(() => {
    if (!user?.id) return;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? '';
    const socket = io(socketUrl, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('permissions_changed', () => {
      setLoading(true);
      void fetchPermissions();
    });

    return () => {
      socket.off('permissions_changed');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, fetchPermissions]);

  const refetch = useCallback(() => {
    setLoading(true);
    void fetchPermissions();
  }, [fetchPermissions]);

  /** L'utilisateur a-t-il cette permission ? */
  const has = useCallback(
    (permission: string): boolean => permissionSet.has(permission),
    [permissionSet]
  );

  /** L'utilisateur a-t-il AU MOINS UNE des permissions listées ? */
  const canAny = useCallback(
    (permissions: string[]): boolean => permissions.some((p) => permissionSet.has(p)),
    [permissionSet]
  );

  /** L'utilisateur a-t-il TOUTES les permissions listées ? */
  const canAll = useCallback(
    (permissions: string[]): boolean => permissions.every((p) => permissionSet.has(p)),
    [permissionSet]
  );

  /** Liste complète des noms de permissions */
  const getUserPermissions = useCallback(
    (): string[] => Array.from(permissionSet),
    [permissionSet]
  );

  return {
    loading,
    refetch,
    has,
    canAny,
    canAll,
    getUserPermissions,
    /** @deprecated Utiliser has() */
    hasPermission: has,
    /** @deprecated Utiliser canAny() */
    hasAnyPermission: canAny,
    /** @deprecated Utiliser canAll() */
    hasAllPermissions: canAll,
  };
}
