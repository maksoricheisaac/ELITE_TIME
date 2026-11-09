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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly service: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('hiddenFromLists') hiddenFromLists?: string,
    @Query('department') department?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const isPrivileged = ['admin', 'manager', 'team_lead'].includes(user.role);

    if (isPrivileged) {
      return this.service.getAll({
        search,
        role,
        status,
        hiddenFromLists,
        department,
        page: page ? +page : 1,
        limit: limit ? +limit : 1000,
      });
    }

    // Employee : vérifier permissions explicites en DB
    const permNames = await this.getEmployeePermissionNames(user.id);

    const canViewAll =
      permNames.has('employees.view_all') ||
      permNames.has('pointages.view_all') ||
      permNames.has('reports.view_all');

    const canViewTeam =
      permNames.has('employees.view_team') ||
      permNames.has('pointages.view_team') ||
      permNames.has('absences.approve') ||
      permNames.has('absences.view_team') ||
      permNames.has('reports.view_team');

    if (!canViewAll && !canViewTeam) return { users: [], total: 0 };

    const effectiveDepartment =
      !canViewAll && canViewTeam ? (user.department ?? undefined) : department;

    return this.service.getAll({
      search,
      role,
      status,
      hiddenFromLists,
      department: effectiveDepartment,
      page: page ? +page : 1,
      limit: limit ? +limit : 1000,
    });
  }

  private async getEmployeePermissionNames(
    userId: string,
  ): Promise<Set<string>> {
    const perms = await this.prisma.userPermission.findMany({
      where: { userId },
      include: { permission: { select: { name: true } } },
    });
    return new Set(perms.map((p) => p.permission.name));
  }

  @Get('me')
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getProfile(user.id);
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    // Accès à son propre profil : toujours autorisé
    if (user.id === id) return this.service.getById(id);

    // Rôles privilegiés : toujours autorisés
    if (['admin', 'manager', 'team_lead'].includes(user.role)) {
      return this.service.getById(id);
    }

    // Employé : autorisé s'il a des permissions de lecture équipe/globale
    const permNames = await this.getEmployeePermissionNames(user.id);
    const canViewOther =
      permNames.has('employees.view_all') ||
      permNames.has('employees.view_team') ||
      permNames.has('reports.view_all') ||
      permNames.has('reports.view_team');

    if (!canViewOther) return null;

    return this.service.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PermissionsGuard)
  @RequirePermissions('employees.create')
  async create(@Body() body: Parameters<UsersService['create']>[0]) {
    return this.service.create(body);
  }

  @Patch('me/profile')
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { firstname?: string; lastname?: string },
  ) {
    return this.service.updateProfile(user.id, body);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    return this.service.changePassword(
      user.id,
      body.oldPassword,
      body.newPassword,
    );
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('employees.edit')
  async update(
    @Param('id') id: string,
    @Body() body: Parameters<UsersService['update']>[1],
  ) {
    return this.service.update(id, body);
  }

  @Patch(':id/include-in-reports')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('employees.toggle_reports')
  async toggleReports(
    @Param('id') id: string,
    @Body() body: { include: boolean },
  ) {
    return this.service.toggleIncludeInReports(id, body.include);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('employees.delete')
  async delete(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
