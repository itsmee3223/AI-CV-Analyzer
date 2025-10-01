import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Evaluation, EvaluationStatus } from 'src/evaluation/evaluation.entity';
import OpenAI from 'openai';
import { CohereClient } from 'cohere-ai';
import { ChromaClient, EmbeddingFunction } from 'chromadb';
import { StorageService } from '../storage/storage.service';
import { ConfigService } from '@nestjs/config';

class CohereEmbeddingFunction implements EmbeddingFunction {
  constructor(
    private readonly cohere: CohereClient,
    private readonly inputType:
      | 'search_query'
      | 'search_document' = 'search_query',
  ) {}

  public async generate(texts: string[]): Promise<number[][]> {
    const response = await this.cohere.embed({
      texts: texts,
      model: 'embed-english-v3.0',
      inputType: this.inputType,
    });
    return response.embeddings as number[][];
  }
}

export interface InternalScores {
  technicalSkills: number;
  experienceLevel: number;
  relevantAchievements: number;
  culturalFit: number;
  correctness: number;
  codeQuality: number;
  resilience: number;
  documentation: number;
  creativity: number;
}

export interface IEvaluationResult {
  cv_match_rate: number;
  cv_feedback: string;
  project_score: number;
  project_feedback: string;
  overall_summary: string;
  internal_scores?: InternalScores;
}

interface ILLMResponse {
  internal_scores: InternalScores;
  cv_feedback?: string;
  project_feedback?: string;
  overall_summary?: string;
}

@Injectable()
export class AiPipelineService {
  private readonly logger = new Logger(AiPipelineService.name);
  private readonly openrouter: OpenAI;
  private readonly chroma: ChromaClient;
  private readonly cohere: CohereClient;
  private readonly cohereEmbedder: CohereEmbeddingFunction;

  constructor(
    @InjectRepository(Evaluation)
    private readonly evaluationRepository: Repository<Evaluation>,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {
    this.openrouter = new OpenAI({
      apiKey: this.configService.get<string>('OPENROUTER_API_KEY'),
      baseURL: 'https://openrouter.ai/api/v1/',
    });

    this.cohere = new CohereClient({
      token: this.configService.get<string>('COHERE_API_KEY'),
    });

    this.chroma = new ChromaClient({
      host: this.configService.get<string>('CHROMA_HOST'),
      port: this.configService.get<number>('CHROMA_PORT'),
      ssl: false,
    });

    this.cohereEmbedder = new CohereEmbeddingFunction(this.cohere);
  }

  async runEvaluationJob(payload: {
    evaluationId: string;
    cvUrl: string;
    projectReportUrl: string;
  }): Promise<Evaluation> {
    const { evaluationId, cvUrl, projectReportUrl } = payload;
    this.logger.log(`Starting AI evaluation for id=${evaluationId}`);

    const evaluation = await this.evaluationRepository.findOneBy({
      id: evaluationId,
    });
    if (!evaluation)
      throw new Error(`Evaluation with ID ${evaluationId} not found`);

    evaluation.status = EvaluationStatus.PROCESSING;
    await this.evaluationRepository.save(evaluation);

    try {
      const cvText = await this.storageService.getFileAsText(
        this.storageService.extractObjectNameFromUrl(cvUrl),
      );
      const projectText = await this.storageService.getFileAsText(
        this.storageService.extractObjectNameFromUrl(projectReportUrl),
      );

      await this.saveToChroma(evaluationId, cvText, projectText);

      const cvInfo = await this.extractCVInfo(cvText);
      const jobContext = await this.retrieveJobContext();

      const cvEval = await this.evaluateCV(cvInfo, jobContext);
      const projectEval = await this.evaluateProject(projectText, jobContext);

      const final: IEvaluationResult = aggregateScores(cvEval, projectEval);

      evaluation.status = EvaluationStatus.COMPLETED;
      evaluation.result = final;
      await this.evaluationRepository.save(evaluation);

      return evaluation;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error evaluating ${evaluationId}: ${msg}`);

      evaluation.status = EvaluationStatus.FAILED;
      evaluation.result = {
        cv_match_rate: 0,
        cv_feedback: 'Evaluation failed',
        project_score: 0,
        project_feedback: 'Evaluation failed',
        overall_summary: `Evaluation failed: ${msg}`,
      };

      this.logger.log(`Finish AI evaluation for id=${evaluationId}`);
      return this.evaluationRepository.save(evaluation);
    }
  }

  /** STEP 1: Extract CV Info */
  private async extractCVInfo(cvText: string): Promise<any> {
    const systemPrompt = `Extract structured information from the CV as JSON:
    {
      "skills": [string],
      "experiences": [ { "years": number, "description": string } ],
      "achievements": [string]
    }`;
    return this.callLLM(systemPrompt, cvText, true);
  }

  /** STEP 2: Retrieve job description & rubric from Chroma */
  private async retrieveJobContext(): Promise<string> {
    const collection = await this.chroma.getOrCreateCollection({
      name: 'job-rubric',
      embeddingFunction: this.cohereEmbedder,
    });

    const results = await collection.query({
      queryTexts: ['job description backend role', 'scoring rubric'],
      nResults: 3,
    });

    return results.documents.flat().join('\n');
  }

  /** STEP 3: Evaluate CV */
  private async evaluateCV(
    cvInfo: any,
    jobContext: string,
  ): Promise<ILLMResponse> {
    const systemPrompt = `Evaluate CV against job description.
    Return JSON with:
    {
      "internal_scores": {
        "technicalSkills": int(1..5),
        "experienceLevel": int(1..5),
        "relevantAchievements": int(1..5),
        "culturalFit": int(1..5)
      },
      "cv_feedback": "string",
      "overall_summary": "string"
    }`;
    return this.callLLM(
      systemPrompt,
      JSON.stringify({ cvInfo, jobContext }),
      true,
    );
  }

  /** STEP 4: Evaluate Project */
  private async evaluateProject(
    projectText: string,
    jobContext: string,
  ): Promise<ILLMResponse> {
    const systemPrompt = `Evaluate Project against rubric.
    Return JSON with:
    {
      "internal_scores": {
        "correctness": int(1..5),
        "codeQuality": int(1..5),
        "resilience": int(1..5),
        "documentation": int(1..5),
        "creativity": int(1..5)
      },
      "project_feedback": "string",
      "overall_summary": "string"
    }`;
    return this.callLLM(
      systemPrompt,
      JSON.stringify({ projectText, jobContext }),
      true,
    );
  }

  /** Common LLM Call with retry/backoff */
  private async callLLM(
    systemPrompt: string,
    userPrompt: string,
    parseJson = false,
  ): Promise<any> {
    let retries = 3;
    let delay = 1000;
    while (retries > 0) {
      try {
        const response = await this.openrouter.chat.completions.create({
          model: 'openai/gpt-4o-mini',
          temperature: 0.2,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });
        const raw = response.choices?.[0]?.message?.content;
        this.logger.debug(`LLM response: ${raw}`);
        if (!raw) throw new Error('Empty response from LLM');

        if (parseJson) {
          const jsonMatch = raw.match(/{[\s\S]*}/);
          if (!jsonMatch) {
            throw new Error('Valid JSON object not found in LLM response');
          }

          const jsonString = jsonMatch[0];
          return JSON.parse(jsonString);
        }

        return raw;
      } catch (err) {
        this.logger.warn(
          `LLM call failed, retries left=${retries - 1}: ${(err as Error).message}`,
        );
        retries--;
        if (retries === 0) throw err;
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }

  /** Save CV & Project embeddings */
  private async saveToChroma(
    evaluationId: string,
    cvText: string,
    projectText: string,
  ) {
    this.logger.log(
      `Saving embeddings to Chroma for evaluationId=${evaluationId}`,
    );
    const docEmbedder = new CohereEmbeddingFunction(
      this.cohere,
      'search_document',
    );

    const collection = await this.chroma.getOrCreateCollection({
      name: 'evaluations',
      embeddingFunction: docEmbedder,
    });

    await collection.add({
      ids: [`${evaluationId}-cv`, `${evaluationId}-project`],
      documents: [cvText, projectText],
      metadatas: [
        { type: 'cv', evaluationId },
        { type: 'project', evaluationId },
      ],
    });

    this.logger.log(`Embeddings saved for evaluationId=${evaluationId}`);
  }
}

function aggregateScores(
  cvEval: ILLMResponse,
  projectEval: ILLMResponse,
): IEvaluationResult {
  const s = { ...cvEval.internal_scores, ...projectEval.internal_scores };
  const cvWeighted =
    (s.technicalSkills * 0.4 +
      s.experienceLevel * 0.25 +
      s.relevantAchievements * 0.2 +
      s.culturalFit * 0.15) /
    5;

  const projectWeighted =
    (s.correctness * 0.3 +
      s.codeQuality * 0.25 +
      s.resilience * 0.2 +
      s.documentation * 0.15 +
      s.creativity * 0.1) *
    2;

  return {
    cv_match_rate: Math.round(cvWeighted * 100) / 100,
    cv_feedback: cvEval.cv_feedback ?? '',
    project_score: Math.round(projectWeighted * 10) / 10,
    project_feedback: projectEval.project_feedback ?? '',
    overall_summary:
      `${cvEval.overall_summary ?? ''} ${projectEval.overall_summary ?? ''}`.trim(),
  };
}
