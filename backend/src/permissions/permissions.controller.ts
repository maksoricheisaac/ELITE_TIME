import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';

@Controller('permissions')
@UseGuards(AuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Get()
  @RequirePermissions('permissions.view')
  async getAll() {
    return this.service.getAll();
  }

  @Get('user/:userId')
  @RequirePermissions('permissions.view')
  async getUserPermissions(@Param('userId') userId: string) {
    return this.service.getUserPermissions(userId);
  }

  @Post('user/:userId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('permissions.assign')
  async grant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() body: { permissionId: string },
  ) {
    return this.service.grant(userId, body.permissionId, user.id);
  }

  @Delete('user/:userId/:permissionId')
  @RequirePermissions('permissions.revoke')
  async revoke(
    @Param('userId') userId: string,
    @Param('permissionId') permissionId: string,
  ) {
    return this.service.revoke(userId, permissionId);
  }

  @Post('user/:userId/reset')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('permissions.reset')
  async reset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.service.resetToRoleDefaults(userId, user.id);
  }
}
