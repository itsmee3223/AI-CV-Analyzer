import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

@Injectable()
export class StorageService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly endpoint: string;
  private readonly port: number;
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly configService: ConfigService) {
    this.bucketName =
      this.configService.get<string>('MINIO_BUCKET') ?? 'cv-uploads';
    this.endpoint = this.configService.get<string>('MINIO_ENDPOINT') ?? 'minio';
    this.port = +(this.configService.get<number>('MINIO_PORT') ?? 9000);

    const accessKeyId =
      this.configService.get<string>('MINIO_ACCESS_KEY') ?? '';
    const secretAccessKey =
      this.configService.get<string>('MINIO_SECRET_KEY') ?? '';

    this.s3Client = new S3Client({
      region: 'us-east-1',
      endpoint: `http://${this.endpoint}:${this.port}`,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
    const fileName = `${uuidv4()}-${file.originalname}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    try {
      await this.s3Client.send(command);
    } catch (error) {
      this.logger.error('Error uploading file to MinIO', error);
      throw new Error('File upload failed');
    }

    // is it public URL?
    const publicPort = this.configService.get<number>('MINIO_PORT') ?? 9000;
    return `http://localhost:${publicPort}/${this.bucketName}/${fileName}`;
  }

  async getFileAsText(objectName: string): Promise<string> {
    this.logger.log('Starting getFileAsText for ' + objectName);
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: objectName,
    });

    const response = await this.s3Client.send(command);

    if (!response.Body) {
      throw new Error('Empty file stream from MinIO');
    }

    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk as Buffer));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', (err) => reject(err));
    });

    if (objectName.toLowerCase().endsWith('.pdf')) {
      return extractPdfText(buffer);
    }
    if (objectName.toLowerCase().endsWith('.docx')) {
      return extractDocxText(buffer);
    }

    this.logger.log('Returning file contents as text');
    return buffer.toString('utf-8');
  }

  async getPublicUrl(url: string): Promise<string> {
    this.logger.log(`Generating signed URL for: ${url}`);
    const objectName = this.extractObjectNameFromUrl(url);
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: objectName,
    });

    const expiresIn = 3600;
    try {
      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      this.logger.log(`Successfully generated signed URL for ${objectName}`);
      return signedUrl;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to generate signed URL for ${objectName}. Message: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          `An unknown error occurred while generating signed URL for ${objectName}`,
          String(error),
        );
      }
      throw new Error('Could not generate signed URL');
    }
  }

  extractObjectNameFromUrl(url: string): string {
    const parts = url.split('/');
    return parts[parts.length - 1];
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  return data.text;
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
