import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { EvaluationJobPayloadDto } from './dto/evaluation-queue.dto';

@Injectable()
export class JobQueueProducer {
  constructor(
    @InjectQueue('evaluation-queue') private evaluationQueue: Queue,
  ) {}

  async addEvaluationJob(data: EvaluationJobPayloadDto) {
    await this.evaluationQueue.add('evaluate-cv', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
  }
}
