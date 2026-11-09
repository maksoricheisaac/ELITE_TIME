import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { LogsService } from './logs.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('logs')
@UseGuards(AuthGuard, PermissionsGuard)
export class LogsController {
  constructor(private readonly service: LogsService) {}

  @Get()
  @RequirePermissions('logs.view')
  async getAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getAll({
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
      type,
      userId,
      from,
      to,
    });
  }

  @Get('employees')
  @RequirePermissions('logs.view')
  async getEmployees() {
    return this.service.getEmployees();
  }
}
