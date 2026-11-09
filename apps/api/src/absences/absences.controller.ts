import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { AbsencesService } from './absences.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ROLE_DEFAULT_PERMISSIONS } from '../auth/guards/permissions.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import {
  CreateAbsenceDto,
  UpdateOwnAbsenceDto,
  RejectAbsenceDto,
  CreateManagedAbsenceDto,
  UpdateManagedAbsenceDto,
} from './dto/absence.dto';

@Controller('absences')
@UseGuards(AuthGuard, PermissionsGuard)
export class AbsencesController {
  constructor(
    private readonly service: AbsencesService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Résout l'ensemble complet des permissions de l'utilisateur : permissions
   * par défaut de son rôle (ROLE_DEFAULT_PERMISSIONS) + permissions accordées
   * individuellement via UserPermission. Reflète exactement ce que vérifie
   * PermissionsGuard, pour que les décisions de scope prises ici (accès
   * équipe vs global) restent cohérentes avec le RBAC réel de l'utilisateur.
   */
  private async resolvePermissionSet(
    user: AuthenticatedUser,
  ): Promise<Set<string>> {
    const roleDefaults =
      ROLE_DEFAULT_PERMISSIONS[user.role] ?? new Set<string>();
    const perms = await this.prisma.userPermission.findMany({
      where: { userId: user.id },
      include: { permission: { select: { name: true } } },
    });
    const names = new Set(roleDefaults);
    for (const p of perms) names.add(p.permission.name);
    return names;
  }

  /**
   * Accès en lecture aux absences d'autrui : admin/manager/team_lead ont les
   * permissions absences.* par défaut, mais l'accès est aussi accordé via
   * reports.view_team/view_all car la génération de rapports d'équipe a besoin
   * de lire les absences des employés du département sans permission absences.*
   * dédiée. Vérification manuelle (pas de decorator) car il s'agit d'un OR sur
   * plusieurs permissions — @RequirePermissions applique un AND.
   */
  private hasTeamAbsenceAccess(
    user: AuthenticatedUser,
    permissionSet: Set<string>,
  ): boolean {
    if (user.role === 'admin') return true;
    return (
      permissionSet.has('absences.view_team') ||
      permissionSet.has('absences.view_all') ||
      permissionSet.has('absences.approve') ||
      permissionSet.has('reports.view_team') ||
      permissionSet.has('reports.view_all')
    );
  }

  @Get()
  @RequirePermissions('absences.view_self')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Query('userId') userId?: string,
  ) {
    if (userId && userId !== user.id) {
      const permissionSet = await this.resolvePermissionSet(user);
      const canViewOther = this.hasTeamAbsenceAccess(user, permissionSet);
      if (canViewOther) return this.service.getForUser(userId);
    }
    return this.service.getForUser(user.id);
  }

  @Get('team')
  async getTeam(@CurrentUser() user: AuthenticatedUser) {
    const permissionSet = await this.resolvePermissionSet(user);
    const canView = this.hasTeamAbsenceAccess(user, permissionSet);
    if (!canView) throw new ForbiddenException('Permission requise');
    const hasFullAccess =
      user.role === 'admin' || permissionSet.has('absences.view_all');
    return this.service.getTeamAbsences(user.id, user.role, hasFullAccess);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('absences.create')
  async request(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateAbsenceDto,
  ) {
    return this.service.request(user.id, body);
  }

  @Patch(':id')
  @RequirePermissions('absences.edit')
  async updateOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateOwnAbsenceDto,
  ) {
    return this.service.updateOwn(id, body, user);
  }

  @Delete(':id')
  @RequirePermissions('absences.delete')
  async deleteOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.deleteOwn(id, user);
  }

  @Patch(':id/approve')
  @RequirePermissions('absences.approve')
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.approve(id, user);
  }

  @Patch(':id/reject')
  @RequirePermissions('absences.reject')
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: RejectAbsenceDto,
  ) {
    return this.service.reject(id, user, body.comment);
  }

  @Post('managed')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('absences.create_managed')
  async createManaged(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateManagedAbsenceDto,
  ) {
    return this.service.createManaged(user, body);
  }

  @Patch('managed/:id')
  @RequirePermissions('absences.edit_managed')
  async updateManaged(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateManagedAbsenceDto,
  ) {
    return this.service.updateManaged(id, body, user);
  }

  @Delete('managed/:id')
  @RequirePermissions('absences.delete_managed')
  async deleteManaged(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.deleteManaged(id, user);
  }

  /**
   * Retire l'absence de l'affichage (manager + employé concerné) sans la
   * supprimer physiquement ni changer son statut métier — masquage
   * d'affichage uniquement, la ligne reste récupérable en base de données.
   */
  @Patch('managed/:id/hide')
  @RequirePermissions('absences.delete_managed')
  async hideManaged(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.hideManaged(id, user);
  }
}
