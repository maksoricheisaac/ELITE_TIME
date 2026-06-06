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
import { PositionsService } from './positions.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('positions')
@UseGuards(AuthGuard, PermissionsGuard)
export class PositionsController {
  constructor(private readonly service: PositionsService) {}

  @Get()
  @RequirePermissions('positions.view')
  async getAll(@Query('departmentId') departmentId?: string) {
    return departmentId
      ? this.service.getByDepartment(departmentId)
      : this.service.getAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('positions.create')
  async create(
    @Body() body: { name: string; departmentId: string; description?: string },
  ) {
    return this.service.create(body);
  }

  @Patch(':id')
  @RequirePermissions('positions.edit')
  async update(
    @Param('id') id: string,
    @Body()
    body: { name?: string; departmentId?: string; description?: string },
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('positions.delete')
  async delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
