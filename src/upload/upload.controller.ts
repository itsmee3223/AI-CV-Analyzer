import {
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { FileUploadDto } from './dto/file-upload.dto';
import { EvaluationService } from 'src/evaluation/evaluation.service';

@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly evaluationService: EvaluationService,
  ) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'cv', maxCount: 1 },
      { name: 'projectReport', maxCount: 1 },
    ]),
  )
  async uploadFiles(
    @UploadedFiles()
    files: FileUploadDto,
  ) {
    const urls = await this.uploadService.saveFiles(files);
    const evaluation =
      await this.evaluationService.createInitialEvaluation(urls);

    return {
      id: evaluation.id,
      status: evaluation.status,
      cvUrl: evaluation.cvUrl,
      projectReportUrl: evaluation.projectReportUrl,
    };
  }
}
