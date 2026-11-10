import { Global, Module } from '@nestjs/common';
import { WorkTimeService } from './work-time.service';

@Global()
@Module({
  providers: [WorkTimeService],
  exports: [WorkTimeService],
})
export class WorkTimeModule {}
