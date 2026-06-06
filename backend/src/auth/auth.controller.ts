import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard, SESSION_COOKIE_NAME } from './guards/auth.guard';
import { ROLE_DEFAULT_PERMISSIONS } from './guards/permissions.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './interfaces/authenticated-request.interface';

const SESSION_MAX_AGE_SECONDS = 86400;

const cookieOptions = (secure: boolean) => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure,
  maxAge: SESSION_MAX_AGE_SECONDS * 1000,
  path: '/',
});

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { username: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string) ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress ||
      'unknown';
    const userAgent = (req.headers['user-agent'] as string) || 'unknown';

    const { user, session } = await this.authService.login(
      body.username,
      body.password,
      ip,
      userAgent,
    );

    const secure = process.env.COOKIE_SECURE === 'true';
    res.cookie(
      SESSION_COOKIE_NAME,
      session.sessionToken,
      cookieOptions(secure),
    );

    return {
      success: true,
      message: 'Authentication successful',
      user: this.authService.sanitizeUser(user),
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async logout(
    @Req() req: Request & { sessionToken?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.sessionToken) {
      await this.authService.deleteSession(req.sessionToken);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { success: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Get('permissions')
  @UseGuards(AuthGuard)
  async permissions(@CurrentUser() user: AuthenticatedUser) {
    if (user.role === 'admin') {
      const all = await this.authService.getAllPermissionNames();
      return { permissions: all };
    }

    // Permissions explicites en DB + defaults du rôle (format granulaire uniquement)
    const explicitPerms = await this.authService.getUserPermissions(user.id);
    const roleDefaults =
      ROLE_DEFAULT_PERMISSIONS[user.role] ?? new Set<string>();

    const allPerms = new Set([...explicitPerms, ...roleDefaults]);
    return { permissions: Array.from(allPerms) };
  }
}
