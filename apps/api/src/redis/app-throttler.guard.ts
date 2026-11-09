import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';

type Req = {
  ip?: string;
  path?: string;
  originalUrl?: string;
  cookies?: Record<string, string>;
  body?: { username?: unknown };
};

export const isLoginRequest = (req: Req) =>
  (req.originalUrl ?? req.path ?? '').split('?')[0].endsWith('/auth/login');

/**
 * Garde de rate limiting global.
 *  - Contextes non HTTP (Socket.IO) : ignorés.
 *  - Limiteur "login" : clé = IP + identifiant saisi (protège un compte précis
 *    sans dépendre de l'IP, qui est celle du serveur Next derrière le proxy).
 *  - Limiteur "default" : clé = hash du cookie de session si présent
 *    (sinon IP), pour ne pas mutualiser tous les utilisateurs d'un même NAT.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    return super.canActivate(context);
  }

  protected override getTracker(req: Record<string, any>): Promise<string> {
    const r = req as Req;
    const ip = r.ip ?? 'unknown';

    if (isLoginRequest(r)) {
      const username =
        typeof r.body?.username === 'string'
          ? r.body.username.trim().toLowerCase().slice(0, 128)
          : '';
      return Promise.resolve(`${ip}|${username}`);
    }

    const session = r.cookies?.['elitetime_session'];
    if (session) {
      return Promise.resolve(
        'sess:' +
          createHash('sha256').update(session).digest('hex').slice(0, 32),
      );
    }
    return Promise.resolve(`ip:${ip}`);
  }
}
