import { Controller, Post, Param, ParseUUIDPipe, Get } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { EvaluationStatus } from './evaluation.entity';

@Controller('evaluation')
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  @Get(':id')
  async getResult(@Param('id', ParseUUIDPipe) id: string) {
    const evaluation = await this.evaluationService.getEvaluationResult(id);
    if (
      evaluation.status === EvaluationStatus.COMPLETED ||
      EvaluationStatus.FAILED
    ) {
      return {
        id: evaluation.id,
        status: evaluation.status,
        result: evaluation.result,
      };
    } else {
      return {
        id: evaluation.id,
        status: evaluation.status,
      };
    }
  }

  // todo bisa kirim prompt lewat file text atau req body
  @Post(':id')
  async startEvaluation(@Param('id', ParseUUIDPipe) id: string) {
    const evaluation = await this.evaluationService.startEvaluation(id);

    return {
      id: evaluation.id,
      status: evaluation.status,
    };
  }
}
