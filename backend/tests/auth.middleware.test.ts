import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createAuthMiddleware, type TokenVerifier } from '../src/middleware/auth.js';

function buildProtectedTestApp(verifyToken: TokenVerifier) {
  const app = express();
  app.get('/protected', createAuthMiddleware(verifyToken), (req, res) => {
    res.status(200).json({ user: req.user });
  });
  return app;
}

describe('createAuthMiddleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const verifyToken = vi.fn<TokenVerifier>();
    const app = buildProtectedTestApp(verifyToken);

    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing or invalid Authorization header' });
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header does not start with Bearer ', async () => {
    const verifyToken = vi.fn<TokenVerifier>();
    const app = buildProtectedTestApp(verifyToken);

    const res = await request(app).get('/protected').set('Authorization', 'Basic abc123');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing or invalid Authorization header' });
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('returns 401 when token verification returns null', async () => {
    const verifyToken = vi.fn<TokenVerifier>().mockResolvedValue(null);
    const app = buildProtectedTestApp(verifyToken);

    const res = await request(app).get('/protected').set('Authorization', 'Bearer invalid-jwt');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
    expect(verifyToken).toHaveBeenCalledWith('invalid-jwt');
  });

  it('calls next() and attaches req.user when token is valid', async () => {
    const verifyToken = vi
      .fn<TokenVerifier>()
      .mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
    const app = buildProtectedTestApp(verifyToken);

    const res = await request(app).get('/protected').set('Authorization', 'Bearer valid-jwt');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: 'user-123', email: 'test@example.com' },
    });
    expect(verifyToken).toHaveBeenCalledWith('valid-jwt');
  });
});
