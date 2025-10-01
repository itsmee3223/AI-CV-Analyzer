import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';
import { JobQueueModule } from '../job-queue/job-queue.module';
import { Evaluation } from './evaluation.entity';
import { StorageService } from 'src/common/storage/storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([Evaluation]), JobQueueModule],
  controllers: [EvaluationController],
  providers: [EvaluationService, StorageService],
  exports: [EvaluationService],
})
export class EvaluationModule {}
