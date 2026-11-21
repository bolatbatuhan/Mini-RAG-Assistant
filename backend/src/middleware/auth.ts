import type { NextFunction, Request, Response } from 'express';
import { getSupabaseAuthClient } from '../lib/supabase.js';

export interface AuthUser {
  id: string;
  email?: string;
}

export type TokenVerifier = (token: string) => Promise<AuthUser | null>;

export const defaultTokenVerifier: TokenVerifier = async (token) => {
  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }
  return { id: data.user.id, email: data.user.email ?? undefined };
};

export function createAuthMiddleware(verifyToken: TokenVerifier = defaultTokenVerifier) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({ error: 'Empty bearer token' });
      return;
    }

    try {
      const user = await verifyToken(token);
      if (!user) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: 'Token verification failed' });
    }
  };
}
