import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { StorageService } from '../common/storage/storage.service';
import { FileUploadDto } from './dto/file-upload.dto';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  constructor(private readonly storageService: StorageService) {}

  async saveFiles(
    files: FileUploadDto,
  ): Promise<{ cvUrl: string; projectReportUrl: string }> {
    this.logger.log('Starting upload process');
    if (!files.cv || !files.projectReport) {
      throw new BadRequestException('CV and project report files are required');
    }

    const cvFile = files.cv[0];
    const projectReportFile = files.projectReport[0];
    const MAX_FILE_SIZE_MB = 5;
    const ALLOWED_MIME_TYPES = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (cvFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new BadRequestException(
        `CV file size cannot exceed ${MAX_FILE_SIZE_MB}MB`,
      );
    }
    if (projectReportFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new BadRequestException(
        `Project report file size cannot exceed ${MAX_FILE_SIZE_MB}MB`,
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(cvFile.mimetype)) {
      throw new BadRequestException('CV must be a PDF or DOCX file');
    }
    if (!ALLOWED_MIME_TYPES.includes(projectReportFile.mimetype)) {
      throw new BadRequestException(
        'Project report must be a PDF or DOCX file',
      );
    }

    const [cvUrl, projectReportUrl] = await Promise.all([
      this.storageService.uploadFile(cvFile),
      this.storageService.uploadFile(projectReportFile),
    ]);

    this.logger.log('Finished upload');
    return { cvUrl, projectReportUrl };
  }
}
