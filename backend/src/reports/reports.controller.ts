import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';

@Controller('reports')
@UseGuards(AuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('pdf')
  @RequirePermissions('reports.export_pdf')
  async getPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('employeeId') employeeId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.service.generatePdf({
      from,
      to,
      employeeId: employeeId || undefined,
      requester: user,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="rapport.pdf"`,
    });
    res.end(Buffer.from(pdf));
  }

  @Get('excel')
  @RequirePermissions('reports.export_excel')
  async getExcel(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('employeeId') employeeId: string,
    @Res() res: Response,
  ) {
    const buf = await this.service.generateExcel({
      from,
      to,
      employeeId: employeeId || undefined,
      requester: user,
    });
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="rapport.xlsx"`,
    });
    res.end(buf);
  }

  @Get('team')
  @RequirePermissions('reports.view_team')
  async getTeamData(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days') days?: string,
  ) {
    return this.service.getTeamData(user.id, days ? +days : 90);
  }
}
