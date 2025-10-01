import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobQueueModule } from '../job-queue/job-queue.module';
import { Evaluation } from 'src/evaluation/evaluation.entity';
import { AiPipelineService } from 'src/common/ai-pipeline/ai-pipeline.service';
import { StorageService } from 'src/common/storage/storage.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [Evaluation],
        synchronize: false,
      }),
    }),
    JobQueueModule,
    TypeOrmModule.forFeature([Evaluation]),
  ],
  providers: [AiPipelineService, StorageService],
})
export class WorkerModule {}
