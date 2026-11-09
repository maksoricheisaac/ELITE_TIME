import { Module } from '@nestjs/common';
import { EmailSchedulingController } from './email-scheduling.controller';
import { EmailSchedulingService } from './email-scheduling.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [EmailSchedulingController],
  providers: [EmailSchedulingService],
  exports: [EmailSchedulingService],
})
export class EmailSchedulingModule {}
