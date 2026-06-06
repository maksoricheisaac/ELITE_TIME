import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';

@Controller('dashboard')
@UseGuards(AuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('admin/stats')
  @RequirePermissions('dashboard.view_global')
  async adminStats() {
    return this.service.getAdminStats();
  }

  @Get('admin/chart')
  @RequirePermissions('dashboard.view_global')
  async adminChart(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getAdminChartData(new Date(from), new Date(to));
  }

  @Get('manager/stats')
  @RequirePermissions('dashboard.view_team')
  async managerStats(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getManagerStats(user.id);
  }

  @Get('manager/chart')
  @RequirePermissions('dashboard.view_team')
  async managerChart(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.getManagerChartData(
      user.id,
      new Date(from),
      new Date(to),
    );
  }
}
