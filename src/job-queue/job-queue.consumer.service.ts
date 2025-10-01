import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AiPipelineService } from 'src/common/ai-pipeline/ai-pipeline.service';
import { EvaluationJobPayloadDto } from './dto/evaluation-queue.dto';

@Processor('evaluation-queue')
export class JobQueueConsumer extends WorkerHost {
  constructor(private readonly aiPipelineService: AiPipelineService) {
    super();
  }

  async process(job: Job<EvaluationJobPayloadDto, any, string>): Promise<any> {
    const { evaluationId, cvUrl, projectReportUrl } = job.data;

    return this.aiPipelineService.runEvaluationJob({
      evaluationId,
      cvUrl,
      projectReportUrl,
    });
  }
}
