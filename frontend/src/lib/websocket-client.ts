import { io, type Socket } from 'socket.io-client';
import { useState, useEffect } from 'react';

export class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectDelay = 2000;

  connect(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      console.log('[WebSocket] Tentative de connexion...');

      /*
       * URL vide = connexion relative à la même origin (elitetime.elitenetwork.local).
       * Recommandé derrière IIS/ARR : Socket.IO résout depuis window.location,
       * garantissant le same-origin et l'envoi automatique du cookie de session.
       * En dev sans IIS, NEXT_PUBLIC_SOCKET_URL pointe vers localhost:3000/4000.
       */
      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? '';

      this.socket = io(socketUrl, {
        path: '/socket.io',

        /*
         * withCredentials: true → le navigateur envoie le cookie elitetime_session
         * automatiquement dans le handshake Socket.IO (polling initial + upgrade WS).
         * Le token n'est PLUS passé dans socket.handshake.auth : l'auth repose
         * exclusivement sur le cookie, qui est envoyé si :
         *  - l'URL de connexion est same-origin (même vhost IIS)
         *  - withCredentials est true
         */
        withCredentials: true,

        /*
         * polling en premier, websocket en second — obligatoire avec IIS/ARR.
         * Le premier poll HTTP établit le contexte de session ARR et valide
         * le cookie. L'upgrade WS est ensuite négocié sur une connexion déjà
         * authentifiée. Mettre ['websocket'] seul provoque un échec immédiat
         * si ARR n'a pas encore de contexte pour la session.
         */
        transports: ['polling', 'websocket'],

        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
      });

      this.socket.on('connect', () => {
        console.log('[WebSocket] Connecté :', this.socket?.id);
        this.reconnectAttempts = 0;
        resolve(this.socket!);
      });

      this.socket.on('connect_error', (error) => {
        console.error('[WebSocket] Erreur de connexion :', error.message);
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(new Error('Impossible de se connecter au serveur WebSocket'));
        }
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[WebSocket] Déconnecté :', reason);
      });

      this.socket.on('error', (error) => {
        console.error('[WebSocket] Erreur :', error);
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  on<T = unknown>(event: string, handler: (data: T) => void): void {
    this.socket?.on(event, handler);
  }

  off<T = unknown>(event: string, handler: (data: T) => void): void {
    this.socket?.off(event, handler);
  }

  emit(event: string, data?: unknown): void {
    if (!this.socket?.connected) {
      console.error('[WebSocket] Non connecté — impossible d\'émettre :', event);
      return;
    }
    this.socket.emit(event, data);
  }

  // ── Méthodes métier (interface conservée à l'identique) ───────────────────

  sendLateAlert(userId: string, userName: string): void {
    this.emit('employee_late_alert', {
      userId,
      userName,
      timestamp: new Date().toISOString(),
    });
  }

  sendPointageUpdate(userId: string, action: 'entry' | 'exit'): void {
    this.emit('pointage_update', {
      userId,
      action,
      timestamp: new Date().toISOString(),
    });
  }

  onLateAlert(
    callback: (data: { userId: string; userName: string; timestamp: string }) => void,
  ): void {
    this.socket?.on('employee_late_alert', callback);
  }

  onPointageUpdate(
    callback: (data: { userId: string; type: string; timestamp: string }) => void,
  ): void {
    this.socket?.on('pointage_update', callback);
  }

  onError(callback: (error: Error | { message: string }) => void): void {
    this.socket?.on('error', callback);
  }
}

// ── Hook React ────────────────────────────────────────────────────────────────
/*
 * Le paramètre `token` sert uniquement de garde de connexion :
 * Socket.IO ne se connecte que si une session existe côté client.
 * Le token N'EST PAS transmis au serveur — l'auth se fait par cookie.
 */
export function useWebSocket(token: string | null) {
  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    const wsClient = new WebSocketClient();

    wsClient
      .connect()
      .then(() => {
        setClient(wsClient);
        setIsConnected(true);
      })
      .catch((error: unknown) => {
        console.error('[WebSocket] Échec de connexion :', error);
        setIsConnected(false);
      });

    return () => {
      wsClient.disconnect();
      setClient(null);
      setIsConnected(false);
    };
  }, [token]);

  return { client, isConnected };
}
