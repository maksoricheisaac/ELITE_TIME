import { Module } from '@nestjs/common';
import { PointagesController } from './pointages.controller';
import { PointagesService } from './pointages.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PointagesController],
  providers: [PointagesService],
  exports: [PointagesService],
})
export class PointagesModule {}
