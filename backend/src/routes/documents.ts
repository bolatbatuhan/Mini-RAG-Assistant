import { Router, type NextFunction, type Request, type Response } from 'express';
import multer, { MulterError } from 'multer';
import type { DocumentRepository } from '../repositories/documentRepo.js';
import { IngestionError, type IngestionService } from '../services/ingestion.js';

class InvalidFileTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFileTypeError';
  }
}

export interface DocumentsRouterDeps {
  getDocumentRepo: () => DocumentRepository;
  getIngestionService: () => IngestionService;
  maxUploadSizeMb?: number;
}

function isPdfMagicHeader(buffer: Buffer): boolean {
  if (buffer.length < 5) {
    return false;
  }
  return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

export function createDocumentsRouter(deps: DocumentsRouterDeps): Router {
  const router = Router();
  const maxUploadSizeMb = deps.maxUploadSizeMb ?? Number(process.env.MAX_UPLOAD_SIZE_MB ?? 10);
  const maxBytes = Math.max(1, Math.floor(maxUploadSizeMb * 1024 * 1024));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxBytes,
    },
    fileFilter: (_req, file, cb) => {
      const isPdfMime = file.mimetype === 'application/pdf';
      const isPdfExt = file.originalname.toLowerCase().endsWith('.pdf');
      if (!isPdfMime || !isPdfExt) {
        cb(new InvalidFileTypeError('Only PDF files are allowed'));
        return;
      }
      cb(null, true);
    },
  });

  const handleUploadMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    upload.single('file')(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          error: `File size exceeds maximum limit of ${maxUploadSizeMb} MB`,
        });
        return;
      }
      if (err instanceof InvalidFileTypeError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof Error) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(400).json({ error: 'Invalid file upload request' });
    });
  };

  router.post('/', handleUploadMiddleware, async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'PDF file is required' });
      return;
    }

    if (!isPdfMagicHeader(req.file.buffer)) {
      res.status(400).json({ error: 'Invalid PDF file content' });
      return;
    }

    try {
      const ingestionService = deps.getIngestionService();
      const result = await ingestionService.ingestPdf({
        userId,
        filename: req.file.originalname,
        buffer: req.file.buffer,
      });

      res.status(201).json({
        document: result.document,
        chunkCount: result.chunkCount,
      });
    } catch (err) {
      if (err instanceof IngestionError) {
        res.status(422).json({
          error: err.message,
          documentId: err.documentId,
        });
        return;
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to process document',
      });
    }
  });

  router.get('/', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const repo = deps.getDocumentRepo();
      const documents = await repo.listDocuments(userId);
      res.status(200).json({ documents });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list documents',
      });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const documentId = String(req.params.id ?? '');

    try {
      const repo = deps.getDocumentRepo();
      const document = await repo.getDocumentById(documentId, userId);
      if (!document) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      res.status(200).json({ document });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to fetch document details',
      });
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const documentId = String(req.params.id ?? '');

    try {
      const repo = deps.getDocumentRepo();
      const deleted = await repo.deleteDocument(documentId, userId);
      if (!deleted) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      res.status(200).json({ deleted: true });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to delete document',
      });
    }
  });

  return router;
}
