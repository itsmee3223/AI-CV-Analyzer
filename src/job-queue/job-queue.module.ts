import { AiPipelineModule } from '../common/ai-pipeline/ai-pipeline.module';

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { JobQueueProducer } from './job-queue.producer.service';
import { JobQueueConsumer } from './job-queue.consumer.service';

@Module({
  imports: [
    AiPipelineModule,

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
        },
      }),
    }),
    BullModule.registerQueue({
      name: 'evaluation-queue',
    }),
  ],
  providers: [JobQueueProducer, JobQueueConsumer],
  exports: [JobQueueProducer],
})
export class JobQueueModule {}
