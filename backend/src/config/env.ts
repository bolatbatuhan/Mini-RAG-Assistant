import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  ALLOWED_ORIGIN: z.string().trim().default('http://localhost:5173'),
  CORS_ORIGIN: z.string().trim().optional(),
  SUPABASE_URL: z.string().trim().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().trim().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .trim()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  GEMINI_API_KEY: z.string().trim().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_EMBEDDING_MODEL: z.string().trim().default('gemini-embedding-001'),
  GEMINI_CHAT_MODEL: z.string().trim().default('gemini-3.8-flash'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(rawEnv: NodeJS.ProcessEnv = process.env): Env {
  if (cachedEnv && rawEnv === process.env) {
    return cachedEnv;
  }

  const fallbackAnonKey =
    rawEnv.SUPABASE_ANON_KEY?.trim() || rawEnv.SUPABASE_SERVICE_ROLE_KEY?.trim();

  const normalizedEnv = {
    ...rawEnv,
    ALLOWED_ORIGIN:
      rawEnv.ALLOWED_ORIGIN?.trim() ||
      rawEnv.CORS_ORIGIN?.trim() ||
      'http://localhost:5173',
    SUPABASE_ANON_KEY: fallbackAnonKey,
  };

  const parsed = envSchema.safeParse(normalizedEnv);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  if (rawEnv === process.env) {
    cachedEnv = parsed.data;
  }
  return parsed.data;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}
