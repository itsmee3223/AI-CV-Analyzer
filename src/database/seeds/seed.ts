// src/database/seeds/seed.ts
import 'dotenv/config';
import { ChromaClient, EmbeddingFunction } from 'chromadb'; // Impor EmbeddingFunction
import { CohereClient } from 'cohere-ai';
import { EmbedResponse } from 'cohere-ai/api';
import * as fs from 'fs/promises';
import * as path from 'path';

class MyCohereEmbeddingFunction implements EmbeddingFunction {
  private cohere: CohereClient;

  constructor(cohereClient: CohereClient) {
    this.cohere = cohereClient;
  }

  public async generate(texts: string[]): Promise<number[][]> {
    const response: EmbedResponse = await this.cohere.embed({
      texts: texts,
      model: 'embed-english-v3.0',
      inputType: 'search_document',
    });
    return response.embeddings as number[][];
  }
}

const CHROMA_HOST = 'http://localhost';
const CHROMA_PORT = 8000;
const COHERE_API_KEY = process.env.COHERE_API_KEY || 'YOUR_COHERE_API_KEY';
const COLLECTION_NAME = 'job-rubric';
const JOB_DESC_PATH = path.join(__dirname, 'data', 'backend-job-desc.txt');
const RUBRIC_PATH = path.join(__dirname, 'data', 'backend-rubric.txt');

async function main() {
  if (!COHERE_API_KEY || COHERE_API_KEY === 'YOUR_COHERE_API_KEY') {
    console.error('Error: Pastikan Anda sudah mengatur COHERE_API_KEY.');
    return;
  }

  console.log('Memulai proses seeding...');
  const chroma = new ChromaClient({
    host: CHROMA_HOST,
    port: CHROMA_PORT,
    ssl: false,
  });

  const cohere = new CohereClient({ token: COHERE_API_KEY });
  const embedder = new MyCohereEmbeddingFunction(cohere);
  console.log(`Mengakses koleksi: ${COLLECTION_NAME}`);
  const collection = await chroma.getOrCreateCollection({
    name: COLLECTION_NAME,
    embeddingFunction: embedder,
  });

  console.log('Membaca file deskripsi pekerjaan dan rubrik...');
  const jobDescriptionText = await fs.readFile(JOB_DESC_PATH, 'utf-8');
  const rubricText = await fs.readFile(RUBRIC_PATH, 'utf-8');
  const documents = [jobDescriptionText, rubricText];

  console.log('Membuat embeddings menggunakan Cohere...');
  const embeddings = await embedder.generate(documents);

  console.log('Menyimpan dokumen dan embeddings ke ChromaDB...');
  await collection.upsert({
    ids: ['backend-job-desc-01', 'backend-rubric-01'],
    documents: documents,
    embeddings: embeddings,
    metadatas: [
      { type: 'job_description', role: 'backend_engineer' },
      { type: 'scoring_rubric', role: 'backend_engineer' },
    ],
  });

  console.log('✅ Seeding selesai!');
  const count = await collection.count();
  console.log(`Jumlah dokumen di koleksi '${COLLECTION_NAME}': ${count}`);
}

main().catch(console.error);
