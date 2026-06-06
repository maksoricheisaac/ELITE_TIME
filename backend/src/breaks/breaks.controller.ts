import {
  Controller,
  Get,
  Post,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { BreaksService } from './breaks.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';

@Controller('breaks')
@UseGuards(AuthGuard)
export class BreaksController {
  constructor(
    private readonly service: BreaksService,
    private readonly prisma: PrismaService,
  ) {}

  private async canViewOtherBreaks(user: AuthenticatedUser): Promise<boolean> {
    if (['admin', 'manager', 'team_lead'].includes(user.role)) return true;
    const perms = await this.prisma.userPermission.findMany({
      where: { userId: user.id },
      include: { permission: { select: { name: true } } },
    });
    const names = new Set(perms.map((p) => p.permission.name));
    return (
      names.has('breaks.view_team') ||
      names.has('breaks.view_all') ||
      names.has('reports.view_team') ||
      names.has('reports.view_all')
    );
  }

  @Get('today')
  async today(
    @CurrentUser() user: AuthenticatedUser,
    @Query('userId') userId?: string,
  ) {
    const canViewOther = await this.canViewOtherBreaks(user);
    const targetId = userId && canViewOther ? userId : user.id;
    return this.service.getTodayBreaks(targetId);
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  async start(@CurrentUser() user: AuthenticatedUser) {
    return this.service.start(user.id);
  }

  @Post('end')
  @HttpCode(HttpStatus.OK)
  async end(@CurrentUser() user: AuthenticatedUser) {
    return this.service.end(user.id);
  }
}
