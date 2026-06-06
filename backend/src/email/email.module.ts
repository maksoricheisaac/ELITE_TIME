import { Module } from '@nestjs/common';
import { ScheduledEmailService } from './scheduled-email.service';

@Module({
  providers: [ScheduledEmailService],
  exports: [ScheduledEmailService],
})
export class EmailModule {}
