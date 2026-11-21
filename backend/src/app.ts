import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { createAuthMiddleware, defaultTokenVerifier, type TokenVerifier } from './middleware/auth.js';
import {
  createSupabaseDocumentRepository,
  type DocumentRepository,
} from './repositories/documentRepo.js';
import { createDocumentsRouter } from './routes/documents.js';
import { createGeminiAIService, type AIService } from './services/ai.js';
import { createIngestionService, type IngestionService } from './services/ingestion.js';

export interface AppDependencies {
  verifyToken?: TokenVerifier;
  documentRepo?: DocumentRepository;
  aiService?: AIService;
  ingestionService?: IngestionService;
  maxUploadSizeMb?: number;
}

export function createApp(deps: AppDependencies = {}): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  let cachedRepo: DocumentRepository | undefined = deps.documentRepo;
  let cachedAI: AIService | undefined = deps.aiService;
  let cachedIngestion: IngestionService | undefined = deps.ingestionService;

  const getDocumentRepo = (): DocumentRepository => {
    if (!cachedRepo) {
      cachedRepo = createSupabaseDocumentRepository();
    }
    return cachedRepo;
  };

  const getAIService = (): AIService => {
    if (!cachedAI) {
      cachedAI = createGeminiAIService();
    }
    return cachedAI;
  };

  const getIngestionService = (): IngestionService => {
    if (!cachedIngestion) {
      cachedIngestion = createIngestionService({
        repo: getDocumentRepo(),
        ai: getAIService(),
      });
    }
    return cachedIngestion;
  };

  const authMiddleware = createAuthMiddleware(deps.verifyToken ?? defaultTokenVerifier);

  app.use(
    '/api/documents',
    authMiddleware,
    createDocumentsRouter({
      getDocumentRepo,
      getIngestionService,
      maxUploadSizeMb: deps.maxUploadSizeMb,
    })
  );

  return app;
}
