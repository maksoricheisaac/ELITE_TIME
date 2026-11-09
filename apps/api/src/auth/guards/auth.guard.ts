import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptUser } from '../../lib/prisma-crypto.helper';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';

export const SESSION_COOKIE_NAME = 'elitetime_session';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<
        Request & { user?: AuthenticatedUser; sessionToken?: string }
      >();

    const sessionToken: string | undefined = request.cookies?.[
      SESSION_COOKIE_NAME
    ] as string | undefined;

    if (!sessionToken) {
      throw new UnauthorizedException('Session manquante');
    }

    const session = await this.prisma.session.findUnique({
      where: { sessionToken },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            firstname: true,
            lastname: true,
            role: true,
            department: true,
            position: true,
            status: true,
            isLocal: true,
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Session invalide');
    }

    if (session.expiresAt < new Date()) {
      await this.prisma.session.delete({ where: { id: session.id } });
      throw new UnauthorizedException('Session expirée');
    }

    if (session.user.status !== 'active') {
      throw new UnauthorizedException('Compte inactif');
    }

    request.user = decryptUser(session.user);
    request.sessionToken = sessionToken;
    return true;
  }
}
