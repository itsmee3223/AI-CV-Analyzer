import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { AiPipelineService } from './ai-pipeline.service';
import { Evaluation } from 'src/evaluation/evaluation.entity';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([Evaluation]), StorageModule],
  providers: [AiPipelineService],
  exports: [AiPipelineService],
})
export class AiPipelineModule {}
