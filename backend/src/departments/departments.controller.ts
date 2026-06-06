import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('departments')
@UseGuards(AuthGuard, PermissionsGuard)
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  @RequirePermissions('departments.view')
  async getAll() {
    return this.service.getAll();
  }

  @Get(':id')
  @RequirePermissions('departments.view')
  async getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('departments.create')
  async create(@Body() body: { name: string; description?: string }) {
    return this.service.create(body);
  }

  @Patch(':id')
  @RequirePermissions('departments.edit')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('departments.delete')
  async delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
