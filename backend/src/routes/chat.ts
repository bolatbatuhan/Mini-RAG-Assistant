import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { RagService } from '../services/rag.js';

const chatRequestSchema = z.object({
  question: z.string().trim().min(1, 'Question must not be empty').max(2000, 'Question is too long'),
});

export interface ChatRouterDeps {
  getRagService: () => RagService;
}

export function createChatRouter(deps: ChatRouterDeps): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      res.status(400).json({ error: message || 'Invalid request payload' });
      return;
    }

    try {
      const ragService = deps.getRagService();
      const result = await ragService.answerQuestion(userId, parsed.data.question);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to generate answer',
      });
    }
  });

  return router;
}
