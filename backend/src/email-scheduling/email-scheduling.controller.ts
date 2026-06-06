import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EmailSchedulingService } from './email-scheduling.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('email-scheduling')
@UseGuards(AuthGuard, PermissionsGuard)
export class EmailSchedulingController {
  constructor(private readonly service: EmailSchedulingService) {}

  @Get()
  @RequirePermissions('emails.view')
  async get() {
    return this.service.get();
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('emails.configure')
  async update(
    @Body()
    body: {
      type: 'DAILY_REPORT' | 'WEEKLY_REPORT' | 'MONTHLY_REPORT';
      enabled: boolean;
      hour: number;
      minute: number;
      weekday?: number;
      weekStartDay?: number;
      monthlySendDay?: number;
      includePdf?: boolean;
      includeExcel?: boolean;
      includeCsv?: boolean;
      recipientUserIds?: string[];
      recipientEmails?: string[];
    },
  ) {
    return this.service.update(body);
  }
}
