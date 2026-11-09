import { Module } from '@nestjs/common';
import { BreaksController } from './breaks.controller';
import { BreaksService } from './breaks.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [BreaksController],
  providers: [BreaksService],
  exports: [BreaksService],
})
export class BreaksModule {}
