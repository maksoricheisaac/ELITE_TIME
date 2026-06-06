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
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';

@Controller('absences')
@UseGuards(AuthGuard, PermissionsGuard)
export class AbsencesController {
  constructor(
    private readonly service: AbsencesService,
    private readonly prisma: PrismaService,
  ) {}

  private async canViewOtherAbsence(user: AuthenticatedUser): Promise<boolean> {
    if (['admin', 'manager', 'team_lead'].includes(user.role)) return true;
    const perms = await this.prisma.userPermission.findMany({
      where: { userId: user.id },
      include: { permission: { select: { name: true } } },
    });
    const names = new Set(perms.map((p) => p.permission.name));
    return (
      names.has('absences.view_team') ||
      names.has('absences.view_all') ||
      names.has('absences.approve') ||
      // Accès équipe accordé via les permissions rapports (pour la génération de rapports)
      names.has('reports.view_team') ||
      names.has('reports.view_all')
    );
  }

  @Get()
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Query('userId') userId?: string,
  ) {
    const canViewOther = await this.canViewOtherAbsence(user);
    const targetId = userId && canViewOther ? userId : user.id;
    return this.service.getForUser(targetId);
  }

  @Get('team')
  async getTeam(@CurrentUser() user: AuthenticatedUser) {
    // Accepte : absences.view_team | absences.view_all | absences.approve
    //         | reports.view_team  | reports.view_all
    // (les données d'absences sont nécessaires pour la génération de rapports)
    const canView = await this.canViewOtherAbsence(user);
    if (!canView) throw new ForbiddenException('Permission requise');
    return this.service.getTeamAbsences(user.id, user.role);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async request(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: { type: string; startDate: string; endDate: string; reason: string },
  ) {
    return this.service.request(user.id, body);
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
    @Body() body: { comment?: string },
  ) {
    return this.service.reject(id, user, body.comment);
  }

  @Post('managed')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('absences.create_managed')
  async createManaged(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      userId: string;
      type: string;
      startDate: string;
      endDate: string;
      reason: string;
    },
  ) {
    return this.service.createManaged(user, body);
  }

  @Patch('managed/:id')
  @RequirePermissions('absences.edit_managed')
  async updateManaged(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { startDate?: string; endDate?: string; reason?: string },
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
}
