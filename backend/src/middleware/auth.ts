import type { NextFunction, Request, Response } from 'express';
import { getSupabaseAdminClient, getSupabaseAuthClient } from '../lib/supabase.js';

export interface AuthUser {
  id: string;
  email?: string;
}

export type TokenVerifier = (token: string) => Promise<AuthUser | null>;

export const defaultTokenVerifier: TokenVerifier = async (token) => {
  const authClient = getSupabaseAuthClient();
  const primaryResult = await authClient.auth.getUser(token);

  if (!primaryResult.error && primaryResult.data.user) {
    return {
      id: primaryResult.data.user.id,
      email: primaryResult.data.user.email ?? undefined,
    };
  }

  // Fallback to admin client (service_role) in case SUPABASE_ANON_KEY was misconfigured in production
  try {
    const adminClient = getSupabaseAdminClient();
    const fallbackResult = await adminClient.auth.getUser(token);
    if (!fallbackResult.error && fallbackResult.data.user) {
      return {
        id: fallbackResult.data.user.id,
        email: fallbackResult.data.user.email ?? undefined,
      };
    }
    console.error(
      '[AuthMiddleware] Supabase token verification failed:',
      fallbackResult.error?.message ?? primaryResult.error?.message ?? 'No user found for token'
    );
  } catch (fallbackErr) {
    console.error(
      '[AuthMiddleware] Supabase token verification error:',
      primaryResult.error?.message ??
        (fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr))
    );
  }

  return null;
};

export function createAuthMiddleware(verifyToken: TokenVerifier = defaultTokenVerifier) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header || !/^Bearer\s+/i.test(header)) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = header.replace(/^Bearer\s+/i, '').trim();
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[AuthMiddleware] Token verification failed:', errorMessage);
      res.status(401).json({ error: 'Token verification failed' });
    }
  };
}
