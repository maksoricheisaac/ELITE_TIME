import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
  username?: string;
}

interface LateAlertPayload {
  userId: string;
  userName: string;
  timestamp: string;
}

interface PointagePayload {
  userId: string;
  action: 'entry' | 'exit';
  timestamp: string;
}

interface PointageReminderPayload {
  userId: string;
  message: string;
  timestamp: string;
}

/*
 * Origines autorisées pour Socket.IO CORS.
 * En production, NEXT_ALLOWED_ORIGINS doit contenir uniquement le vhost IIS
 * (http://elitetime.elitenetwork.local) — jamais l'IP brute ni le port :4000.
 */
const allowedOrigins =
  process.env.NODE_ENV === 'development'
    ? [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
      ]
    : (process.env.NEXT_ALLOWED_ORIGINS ?? 'http://localhost:3000')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);

@WebSocketGateway({
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  path: '/socket.io',
  pingTimeout: 60000,
  pingInterval: 25000,
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(socket: AuthenticatedSocket) {
    try {
      /*
       * Stratégie d'authentification — deux sources, priorité au cookie :
       *
       * 1. Cookie elitetime_session (priorité)
       *    Le navigateur l'envoie automatiquement via withCredentials: true
       *    côté client Socket.IO. C'est le mécanisme recommandé quand tout
       *    le trafic transite par IIS (même vhost = même domaine de cookie).
       *    Le cookie est présent dans socket.handshake.headers.cookie.
       *
       * 2. socket.handshake.auth.token (fallback)
       *    Conservé pour la compatibilité avec les workers internes, scripts
       *    de test automatisés, ou clients non-navigateur qui ne peuvent pas
       *    envoyer de cookies.
       */
      const rawCookies = socket.handshake.headers.cookie ?? '';
      const sessionCookie = rawCookies
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('elitetime_session='))
        ?.split('=')
        .slice(1)
        .join('='); // Préserver les '=' dans les valeurs Base64/JWT

      const authToken =
        (socket.handshake.auth as Record<string, string>)?.token ??
        socket.handshake.headers.authorization?.replace('Bearer ', '');

      const token = sessionCookie ?? authToken;

      if (!token) {
        this.logger.warn(`Connexion refusée (pas de token) : ${socket.id}`);
        socket.disconnect();
        return;
      }

      const session = await this.prisma.session.findUnique({
        where: { sessionToken: token },
        include: {
          user: {
            select: { id: true, username: true, role: true, status: true },
          },
        },
      });

      if (
        !session ||
        session.expiresAt < new Date() ||
        session.user.status !== 'active'
      ) {
        this.logger.warn(
          `Connexion refusée (session invalide/expirée) : ${socket.id}`,
        );
        socket.disconnect();
        return;
      }

      socket.userId = session.user.id;
      socket.userRole = session.user.role;
      socket.username = session.user.username;

      this.joinRoleRooms(socket);
      void this.logEvent(
        socket.userId,
        'SOCKET_CONNECTED',
        'Connexion WebSocket',
        socket.id,
      );
      this.logger.log(`client connecté : ${socket.id} (${socket.username})`);
    } catch (err) {
      this.logger.error('auth error:', err);
      socket.disconnect();
    }
  }

  handleDisconnect(socket: AuthenticatedSocket) {
    if (socket.userId) {
      void this.logEvent(
        socket.userId,
        'SOCKET_DISCONNECTED',
        'Déconnexion',
        socket.id,
      );
    }
    this.logger.log(`client déconnecté : ${socket.id}`);
  }

  private joinRoleRooms(socket: AuthenticatedSocket) {
    if (!socket.userRole || !socket.userId) return;
    void socket.join(`user-${socket.userId}`);
    void socket.join(`${socket.userRole}-room`);
    if (socket.userRole === 'manager') void socket.join('admin-room');
    if (socket.userRole === 'admin') {
      void socket.join('manager-room');
      void socket.join('employee-room');
    }
  }

  private async logEvent(
    userId: string,
    event: string,
    details: string,
    socketId: string,
  ) {
    try {
      await this.prisma.activityLog.create({
        data: {
          userId,
          action: `WEBSOCKET: ${event}`,
          details: `${details} (Socket: ${socketId})`,
          timestamp: new Date(),
          type: 'user',
        },
      });
    } catch {
      // Non-critique, ne pas propager
    }
  }

  private validateLateAlert(data: unknown): data is LateAlertPayload {
    if (!data || typeof data !== 'object') return false;
    const p = data as Record<string, unknown>;
    return (
      typeof p.userId === 'string' &&
      typeof p.userName === 'string' &&
      typeof p.timestamp === 'string'
    );
  }

  private validatePointage(data: unknown): data is PointagePayload {
    if (!data || typeof data !== 'object') return false;
    const p = data as Record<string, unknown>;
    return (
      typeof p.userId === 'string' &&
      (p.action === 'entry' || p.action === 'exit') &&
      typeof p.timestamp === 'string'
    );
  }

  @SubscribeMessage('employee_late_alert')
  handleLateAlert(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: unknown,
  ) {
    if (socket.userRole !== 'manager' && socket.userRole !== 'admin') {
      socket.emit('error', { message: 'Non autorisé' });
      return;
    }
    if (!this.validateLateAlert(data)) {
      socket.emit('error', { message: 'Payload invalide' });
      return;
    }
    this.server.to('admin-room').emit('employee_late_alert', data);
    if (socket.userId) {
      void this.logEvent(
        socket.userId,
        'LATE_ALERT_SENT',
        `Alerte retard pour ${data.userName}`,
        socket.id,
      );
    }
  }

  @SubscribeMessage('pointage_admin_closure')
  handleAdminClosure(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: unknown,
  ) {
    if (socket.userRole !== 'admin' && socket.userRole !== 'manager') {
      socket.emit('error', { message: 'Non autorisé' });
      return;
    }
    const payload = data as {
      userId?: string;
      userName?: string;
      date?: string;
    };
    if (!payload?.userId || !payload?.date) {
      socket.emit('error', { message: 'Payload invalide' });
      return;
    }
    this.server
      .to(`user-${payload.userId}`)
      .emit('pointage_admin_closure', payload);
    if (socket.userId) {
      void this.logEvent(
        socket.userId,
        'ADMIN_CLOSURE',
        `Clôture pointage de ${payload.userName ?? payload.userId} pour le ${payload.date}`,
        socket.id,
      );
    }
  }

  @SubscribeMessage('pointage_update')
  handlePointageUpdate(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: unknown,
  ) {
    if (!this.validatePointage(data)) {
      socket.emit('error', { message: 'Payload invalide' });
      return;
    }
    if (socket.userRole === 'employee' && data.userId !== socket.userId) {
      socket.emit('error', { message: 'Non autorisé' });
      return;
    }
    if (socket.userRole === 'employee') {
      this.server.to('admin-room').emit('pointage_update', data);
    } else {
      this.server.emit('pointage_update', data);
    }
    if (socket.userId) {
      void this.logEvent(
        socket.userId,
        'POINTAGE_UPDATE',
        `Pointage ${data.action} pour ${data.userId}`,
        socket.id,
      );
    }
  }

  // Appelé par SchedulerService (même processus, pas de socket interne)
  broadcastExitReminder(payload: PointageReminderPayload) {
    this.server
      ?.to(`user-${payload.userId}`)
      .emit('employee_pointage_exit_reminder', payload);
  }

  broadcastLateAlert(payload: LateAlertPayload) {
    this.server?.to('admin-room').emit('employee_late_alert', payload);
  }

  // Notifie un utilisateur spécifique que ses permissions ont changé
  broadcastPermissionsChanged(userId: string) {
    this.server?.to(`user-${userId}`).emit('permissions_changed', { userId });
  }
}
