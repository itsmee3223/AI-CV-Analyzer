import { IsNotEmpty, IsUrl, IsUUID } from 'class-validator';

export class EvaluationJobPayloadDto {
  @IsUUID()
  @IsNotEmpty()
  evaluationId: string;

  @IsUrl()
  @IsNotEmpty()
  cvUrl: string;

  @IsUrl()
  @IsNotEmpty()
  projectReportUrl: string;
}
