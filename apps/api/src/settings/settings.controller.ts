import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('settings')
@UseGuards(AuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  @RequirePermissions('settings.view')
  async get() {
    return this.service.get();
  }

  @Patch()
  @RequirePermissions('settings.general')
  async update(@Body() body: Parameters<SettingsService['update']>[0]) {
    return this.service.update(body);
  }
}
