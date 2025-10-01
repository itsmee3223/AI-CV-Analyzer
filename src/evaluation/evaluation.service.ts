import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Evaluation, EvaluationStatus } from './evaluation.entity';
import { JobQueueProducer } from 'src/job-queue/job-queue.producer.service';
import { StorageService } from 'src/common/storage/storage.service';

@Injectable()
export class EvaluationService {
  constructor(
    @InjectRepository(Evaluation)
    private readonly evaluationRepository: Repository<Evaluation>,
    private readonly jobQueueProducer: JobQueueProducer,
    private readonly storageService: StorageService,
  ) {}

  async getEvaluationResult(id: string): Promise<Evaluation> {
    const evaluation = await this.evaluationRepository.findOneBy({ id });
    if (!evaluation) {
      throw new NotFoundException(`Evaluation with ID ${id} not found`);
    }
    return evaluation;
  }

  async createInitialEvaluation(urls: {
    cvUrl: string;
    projectReportUrl: string;
  }): Promise<Evaluation> {
    const newEvaluation = this.evaluationRepository.create({
      cvUrl: urls.cvUrl,
      projectReportUrl: urls.projectReportUrl,
      status: EvaluationStatus.UPLOADED,
    });
    const savedEvaluation = await this.evaluationRepository.save(newEvaluation);
    const [signedCvUrl, signedProjectReportUrl] = await Promise.all([
      this.storageService.getPublicUrl(savedEvaluation.cvUrl),
      this.storageService.getPublicUrl(savedEvaluation.projectReportUrl),
    ]);

    savedEvaluation.cvUrl = signedCvUrl;
    savedEvaluation.projectReportUrl = signedProjectReportUrl;
    return savedEvaluation;
  }

  async startEvaluation(id: string): Promise<Evaluation> {
    const evaluation = await this.evaluationRepository.findOneBy({ id });
    if (!evaluation) {
      throw new NotFoundException(`Evaluation with ID ${id} not found`);
    }

    if (evaluation.status !== EvaluationStatus.UPLOADED) {
      return evaluation;
    }

    evaluation.status = EvaluationStatus.QUEUED;
    const updatedEvaluation = await this.evaluationRepository.save(evaluation);
    await this.jobQueueProducer.addEvaluationJob({
      evaluationId: updatedEvaluation.id,
      cvUrl: updatedEvaluation.cvUrl,
      projectReportUrl: updatedEvaluation.projectReportUrl,
    });

    return updatedEvaluation;
  }
}
