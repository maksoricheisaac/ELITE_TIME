import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PointagesService } from './pointages.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';

@Controller('pointages')
@UseGuards(AuthGuard, PermissionsGuard)
export class PointagesController {
  constructor(
    private readonly service: PointagesService,
    private readonly prisma: PrismaService,
  ) {}

  private async canViewOtherUser(user: AuthenticatedUser): Promise<boolean> {
    if (['admin', 'manager', 'team_lead'].includes(user.role)) return true;
    const perms = await this.prisma.userPermission.findMany({
      where: { userId: user.id },
      include: { permission: { select: { name: true } } },
    });
    const names = new Set(perms.map((p) => p.permission.name));
    return (
      names.has('pointages.view_team') ||
      names.has('pointages.view_all') ||
      names.has('pointages.create') ||
      names.has('reports.view_team') ||
      names.has('reports.view_all')
    );
  }

  @Get()
  async getRecent(
    @CurrentUser() user: AuthenticatedUser,
    @Query('userId') userId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const canViewOther = await this.canViewOtherUser(user);
    const targetId = userId && canViewOther ? userId : user.id;
    return this.service.getRecent(targetId, new Date(from), new Date(to));
  }

  @Get('week-stats')
  async getWeekStats(
    @CurrentUser() user: AuthenticatedUser,
    @Query('userId') userId?: string,
  ) {
    const canViewOther = await this.canViewOtherUser(user);
    return this.service.getWeekStats(userId && canViewOther ? userId : user.id);
  }

  @Get('today')
  async getTodayPointage(
    @CurrentUser() user: AuthenticatedUser,
    @Query('userId') userId?: string,
  ) {
    const canViewOther = await this.canViewOtherUser(user);
    return this.service.getTodayPointage(
      userId && canViewOther ? userId : user.id,
    );
  }

  @Get('today/all')
  async getTodayAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('userId') userId?: string,
  ) {
    const canViewOther = await this.canViewOtherUser(user);
    return this.service.getTodayAll(userId && canViewOther ? userId : user.id);
  }

  @Get('incomplete')
  async getIncomplete(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getIncomplete(user.id);
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { earlyExitReason?: string },
  ) {
    return this.service.start(user.id, body.earlyExitReason);
  }

  @Post('end')
  @HttpCode(HttpStatus.OK)
  async end(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { earlyExitReason?: string },
  ) {
    return this.service.end(user.id, body.earlyExitReason);
  }

  @Patch('today/late-reason')
  async updateTodayLateReason(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { reason: string },
  ) {
    return this.service.updateLateReason(user.id, body.reason);
  }

  @Patch(':id/late-reason')
  async updateLateReason(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.service.updateLateReason(user.id, body.reason, id);
  }

  @Patch(':id/early-exit-reason')
  async updateEarlyExitReason(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.service.updateEarlyExitReason(user.id, id, body.reason);
  }

  @Get('manager/by-date')
  @RequirePermissions('pointages.create')
  async getManagerByDate(
    @Query('date') date: string,
    @Query('userIds') userIds: string,
  ) {
    return this.service.getManagerByDate(date, userIds.split(','));
  }

  @Post('manager')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('pointages.create')
  async managerUpsert(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      userId: string;
      date: string;
      entryTime?: string;
      exitTime?: string;
      lateReason?: string;
      earlyExitReason?: string;
      sessionNumber?: number;
    },
  ) {
    return this.service.managerUpsert(
      user.id,
      body.userId,
      body.date,
      body.entryTime ?? null,
      body.exitTime ?? null,
      body.lateReason ?? null,
      body.earlyExitReason ?? null,
      body.sessionNumber,
    );
  }

  @Delete('manager/extra-sessions')
  @RequirePermissions('pointages.delete')
  async deleteExtraSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('userId') userId: string,
    @Query('date') date: string,
  ) {
    await this.service.deleteExtraSessions(userId, date);
    return { success: true };
  }
}
