import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { SeedService } from './seed.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';

/**
 * Endpoints d'initialisation — réservés à la mise en place initiale.
 *
 * ⚠  La migration RBAC (seed + migration données) s'effectue via :
 *    npx ts-node --project tsconfig.scripts.json scripts/migrate-rbac-granular.ts
 *    (ou : npm run migrate:rbac)
 *
 * Ces endpoints ne doivent pas être exposés en production après la première installation.
 */
@Controller('admin/seed')
@UseGuards(AuthGuard)
export class SeedController {
  constructor(private readonly service: SeedService) {}

  @Post('first-admin')
  @HttpCode(HttpStatus.OK)
  async seedFirstAdmin(@CurrentUser() user: AuthenticatedUser) {
    if (user.role !== 'admin')
      throw new ForbiddenException('Réservé aux administrateurs');
    return this.service.seedFirstAdmin();
  }

  @Post('grant-all')
  @HttpCode(HttpStatus.OK)
  async grantAll(@CurrentUser() user: AuthenticatedUser) {
    if (user.role !== 'admin')
      throw new ForbiddenException('Réservé aux administrateurs');
    return this.service.grantAllPermissionsToAdmins();
  }
}
