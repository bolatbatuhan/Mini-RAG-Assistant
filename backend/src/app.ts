import cors from 'cors';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createAuthMiddleware, defaultTokenVerifier, type TokenVerifier } from './middleware/auth.js';
import {
  createSupabaseDocumentRepository,
  type DocumentRepository,
} from './repositories/documentRepo.js';
import { createChatRouter } from './routes/chat.js';
import { createDocumentsRouter } from './routes/documents.js';
import { createGeminiAIService, type AIService } from './services/ai.js';
import { createIngestionService, type IngestionService } from './services/ingestion.js';
import { createRagService, type RagService } from './services/rag.js';

class CorsNotAllowedError extends Error {
  constructor(message = 'Not allowed by CORS') {
    super(message);
    this.name = 'CorsNotAllowedError';
  }
}

export interface AppDependencies {
  verifyToken?: TokenVerifier;
  documentRepo?: DocumentRepository;
  aiService?: AIService;
  ingestionService?: IngestionService;
  ragService?: RagService;
  maxUploadSizeMb?: number;
  allowedOrigin?: string;
  enableRateLimit?: boolean;
  rateLimitMax?: number;
}

function parseAllowedOrigins(rawOrigin: string): string[] {
  return rawOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function createApp(deps: AppDependencies = {}): Express {
  const app = express();

  const rawAllowedOrigin =
    deps.allowedOrigin ??
    process.env.ALLOWED_ORIGIN ??
    process.env.CORS_ORIGIN ??
    'http://localhost:5173';
  const allowedOrigins = parseAllowedOrigins(rawAllowedOrigin);

  app.use(helmet());
  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        if (!requestOrigin || allowedOrigins.includes(requestOrigin)) {
          callback(null, true);
          return;
        }
        callback(new CorsNotAllowedError('Not allowed by CORS'));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  let cachedRepo: DocumentRepository | undefined = deps.documentRepo;
  let cachedAI: AIService | undefined = deps.aiService;
  let cachedIngestion: IngestionService | undefined = deps.ingestionService;
  let cachedRag: RagService | undefined = deps.ragService;

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

  const getRagService = (): RagService => {
    if (!cachedRag) {
      cachedRag = createRagService({
        repo: getDocumentRepo(),
        ai: getAIService(),
      });
    }
    return cachedRag;
  };

  const shouldSkipRateLimit = () =>
    process.env.NODE_ENV === 'test' && !deps.enableRateLimit;

  const aiEndpointLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: deps.rateLimitMax ?? 20,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    skip: shouldSkipRateLimit,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
    message: {
      error: 'Too many requests. Please wait a minute before trying again.',
    },
  });

  const authMiddleware = createAuthMiddleware(deps.verifyToken ?? defaultTokenVerifier);

  app.use(
    '/api/documents',
    authMiddleware,
    createDocumentsRouter({
      getDocumentRepo,
      getIngestionService,
      maxUploadSizeMb: deps.maxUploadSizeMb,
      uploadRateLimiter: aiEndpointLimiter,
    })
  );

  app.use(
    '/api/chat',
    authMiddleware,
    aiEndpointLimiter,
    createChatRouter({
      getRagService,
    })
  );

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof CorsNotAllowedError) {
      res.status(403).json({ error: err.message });
      return;
    }
    next(err);
  });

  return app;
}
