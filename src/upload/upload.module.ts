// src/upload/upload.module.ts
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { memoryStorage } from 'multer';
import { StorageModule } from '../common/storage/storage.module';
import { EvaluationModule } from '../evaluation/evaluation.module';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
    StorageModule,
    EvaluationModule,
  ],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
