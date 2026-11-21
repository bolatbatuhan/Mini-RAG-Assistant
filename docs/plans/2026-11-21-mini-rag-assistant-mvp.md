# Mini RAG — Document Assistant MVP Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Build an end-to-end Mini RAG Document Assistant where authenticated users upload PDF documents, have them synchronously extracted, chunked, embedded, and stored in Supabase PostgreSQL (`pgvector`), and ask natural-language questions answered strictly from their own documents with source citations.

**Architecture:** A two-folder monorepo with an Express + TypeScript REST API (`backend/`) and a React + Vite + TypeScript SPA (`frontend/`). Supabase Auth issues JWTs that the frontend attaches as `Bearer` tokens and the backend validates on every request before scoping all PostgreSQL/`pgvector` reads and writes to `req.user.id`. LangChain.js handles text splitting, embedding generation, and grounded LLM answer synthesis.

**Tech Stack:**
- **Backend:** Node.js 24, Express 5, TypeScript, `@supabase/supabase-js`, `multer`, `pdf-parse`, `@langchain/textsplitters`, `@langchain/google-genai`, `zod`, `cors`, `helmet`, `dotenv`, `vitest`, `supertest`, `eslint`
- **Frontend:** React 19, TypeScript, Vite, `@supabase/supabase-js`, `eslint`
- **Database & Auth:** Supabase PostgreSQL + `pgvector` extension + Supabase Auth
- **CI & Deployment:** GitHub Actions, Vercel (frontend), Render (backend)

> **Provider Note:** This plan uses Google Gemini (`text-embedding-004` with 768 dimensions + `gemini-2.5-flash`) via `@langchain/google-genai`. Because AI calls are isolated in `backend/src/services/ai.ts`, swapping providers only requires updating that service and the vector dimension in the SQL migration.

---

## Phase 1: Project Setup (Backend & Frontend Scaffolds)

### Task 1: Repository Initialization & Environment Templates

**Files:**
- Create: `.gitignore`
- Create: `backend/.env.example`
- Create: `frontend/.env.example`

**Step 1: Initialize Git repository**

Run: `git init`
Expected: `Initialized empty Git repository in .../mini-rag-assistant/.git/`

**Step 2: Create root `.gitignore`**

```gitignore
# Dependencies
node_modules/

# Build outputs
dist/
build/

# Environment variables
.env
.env.local
.env.*.local

# Logs & OS files
*.log
.DS_Store
Thumbs.db

# Coverage
coverage/
```

**Step 3: Create `backend/.env.example`**

```env
PORT=4000
CORS_ORIGIN=http://localhost:5173
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GEMINI_EMBEDDING_MODEL=text-embedding-004
GEMINI_CHAT_MODEL=gemini-2.5-flash
MAX_UPLOAD_SIZE_MB=10
```

**Step 4: Create `frontend/.env.example`**

```env
VITE_API_BASE_URL=http://localhost:4000
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

**Step 5: Verify git status and commit**

Run: `git add .gitignore backend/.env.example frontend/.env.example && git commit -m "chore: initialize repository and env templates"`
Expected: Clean commit on initial branch.

---

### Task 2: Backend Project Scaffold (Node.js + Express + TypeScript + Vitest + ESLint)

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/eslint.config.js`
- Create: `backend/src/app.ts`
- Create: `backend/src/server.ts`
- Test: `backend/tests/health.test.ts`

**Step 1: Initialize `backend/package.json`**

```json
{
  "name": "mini-rag-backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src tests",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@langchain/core": "^0.3.42",
    "@langchain/google-genai": "^0.2.0",
    "@langchain/textsplitters": "^0.1.0",
    "@supabase/supabase-js": "^2.49.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^5.0.1",
    "helmet": "^8.0.0",
    "multer": "^1.4.5-lts.1",
    "pdf-parse": "^1.1.1",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@eslint/js": "^9.22.0",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/multer": "^1.4.12",
    "@types/node": "^22.13.10",
    "@types/pdf-parse": "^1.1.4",
    "@types/supertest": "^6.0.2",
    "eslint": "^9.22.0",
    "supertest": "^7.0.0",
    "tsx": "^4.19.3",
    "typescript": "^5.8.2",
    "typescript-eslint": "^8.26.1",
    "vitest": "^3.0.8"
  }
}
```

**Step 2: Install backend dependencies**

Run: `cd backend && npm install`
Expected: `added ... packages` with exit code 0.

**Step 3: Create `backend/tsconfig.json`, `backend/vitest.config.ts`, and `backend/eslint.config.js`**

`backend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

`backend/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    clearMocks: true,
  },
});
```

`backend/eslint.config.js`:
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**'],
  }
);
```

**Step 4: Write the failing health check test (`backend/tests/health.test.ts`)**

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('GET /health', () => {
  it('returns 200 and status ok', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

**Step 5: Run test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module '../src/app.js'`.

**Step 6: Create minimal `backend/src/app.ts` and `backend/src/server.ts`**

`backend/src/app.ts`:
```ts
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

export function createApp(): Express {
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

  return app;
}
```

`backend/src/server.ts`:
```ts
import 'dotenv/config';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
```

**Step 7: Run tests, typecheck, and lint**

Run: `cd backend && npm test && npm run typecheck && npm run lint`
Expected: 1 test passing, 0 TypeScript errors, 0 ESLint errors.

**Step 8: Commit**

Run: `git add backend/ && git commit -m "chore(backend): scaffold Express TypeScript server with Vitest and ESLint"`
Expected: Clean commit.

---

### Task 3: Frontend Project Scaffold (React + Vite + TypeScript + ESLint)

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/eslint.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/vite-env.d.ts`

**Step 1: Create `frontend/package.json`**

```json
{
  "name": "mini-rag-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.22.0",
    "@types/react": "^19.0.8",
    "@types/react-dom": "^19.0.4",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^9.22.0",
    "eslint-plugin-react-hooks": "^5.2.0",
    "globals": "^16.0.0",
    "typescript": "^5.8.2",
    "typescript-eslint": "^8.26.1",
    "vite": "^6.2.1"
  }
}
```

**Step 2: Install frontend dependencies**

Run: `cd frontend && npm install`
Expected: `added ... packages` with exit code 0.

**Step 3: Create config and entry files**

- `frontend/tsconfig.json` (strict React + Vite TS config with `"jsx": "react-jsx"`, `"noEmit": true`).
- `frontend/vite.config.ts` (standard `@vitejs/plugin-react` config).
- `frontend/eslint.config.js` (`@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`).
- `frontend/index.html`, `frontend/src/vite-env.d.ts`, `frontend/src/main.tsx`, `frontend/src/index.css`, and minimal `frontend/src/App.tsx` rendering `"Mini RAG — Document Assistant"`.

**Step 4: Verify typecheck, lint, and build**

Run: `cd frontend && npm run typecheck && npm run lint && npm run build`
Expected: 0 errors and `dist/` built cleanly.

**Step 5: Commit**

Run: `git add frontend/ && git commit -m "chore(frontend): scaffold React Vite TypeScript app"`
Expected: Clean commit.

---

## Phase 2: Database Schema & Auth Middleware

### Task 4: Supabase PostgreSQL + pgvector Schema & Similarity Search RPC

**Files:**
- Create: `backend/supabase/migrations/001_init_rag_schema.sql`

**Step 1: Write `backend/supabase/migrations/001_init_rag_schema.sql`**

```sql
-- Enable pgvector extension
create extension if not exists vector;

-- Documents table
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  status text not null check (status in ('processing', 'completed', 'failed')) default 'processing',
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_documents_user_id on public.documents(user_id);

-- Document chunks table (768 dims for Gemini text-embedding-004)
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  embedding vector(768) not null,
  chunk_index integer not null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_document_chunks_document_id on public.document_chunks(document_id);
create index if not exists idx_document_chunks_user_id on public.document_chunks(user_id);

-- Row Level Security (defense in depth)
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

create policy "Users can manage own documents"
  on public.documents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own document chunks"
  on public.document_chunks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Similarity search RPC strictly scoped by p_user_id
create or replace function public.match_document_chunks(
  query_embedding vector(768),
  p_user_id uuid,
  match_threshold float default 0.3,
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  filename text,
  content text,
  chunk_index integer,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  select
    dc.id,
    dc.document_id,
    d.filename,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where dc.user_id = p_user_id
    and d.status = 'completed'
    and 1 - (dc.embedding <=> query_embedding) >= match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
```

**Step 2: Commit migration file**

Run: `git add backend/supabase/migrations/001_init_rag_schema.sql && git commit -m "feat(db): add documents, document_chunks, RLS policies, and match_document_chunks RPC"`
Expected: Clean commit. (User will run this SQL once in Supabase SQL Editor when connecting their Supabase project.)

---

### Task 5: Backend Configuration & Supabase Clients

**Files:**
- Create: `backend/src/config/env.ts`
- Create: `backend/src/lib/supabase.ts`
- Create: `backend/src/types/express.d.ts`

**Step 1: Create `backend/src/config/env.ts` with Zod validation**

Validate required env vars lazily via `getEnv()` so unit tests that mock services do not crash on import, while production startup fails fast with clear error messages if `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `GEMINI_API_KEY` are missing.

**Step 2: Create `backend/src/lib/supabase.ts`**

Export two clients:
- `getSupabaseAuthClient()`: uses `SUPABASE_ANON_KEY` (verifies incoming user JWTs via `auth.getUser(token)`).
- `getSupabaseAdminClient()`: uses `SUPABASE_SERVICE_ROLE_KEY` (performs server-side DB operations with explicit `user_id` scoping; never exposed to frontend).

**Step 3: Augment Express `Request` type (`backend/src/types/express.d.ts`)**

Add `user?: { id: string; email?: string }` on `Express.Request`.

**Step 4: Typecheck and commit**

Run: `cd backend && npm run typecheck && git add backend/src/ && git commit -m "feat(backend): add typed env config and Supabase clients"`
Expected: 0 TypeScript errors, clean commit.

---

### Task 6: Authentication Middleware (`auth.ts`) — TDD

**Files:**
- Create: `backend/src/middleware/auth.ts`
- Test: `backend/tests/auth.middleware.test.ts`

**Step 1: Write failing tests (`backend/tests/auth.middleware.test.ts`)**

Test cases:
1. Returns `401` when `Authorization` header is missing.
2. Returns `401` when header does not start with `Bearer `.
3. Returns `401` when `verifyToken` rejects / returns null.
4. Calls `next()` and attaches `req.user = { id, email }` when token is valid.

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/auth.middleware.test.ts`
Expected: FAIL — `Cannot find module '../src/middleware/auth.js'`.

**Step 3: Implement `backend/src/middleware/auth.ts`**

Accept an injectable `verifyToken` function (defaulting to Supabase `auth.getUser(token)`) so integration tests can test protected routes deterministically without live network calls.

```ts
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
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/auth.middleware.test.ts`
Expected: PASS (4/4).

**Step 5: Commit**

Run: `git add backend/src/middleware/auth.ts backend/tests/auth.middleware.test.ts && git commit -m "feat(auth): add Supabase JWT verification middleware with tests"`
Expected: Clean commit.

---

## Phase 3 & 4: Ingestion Pipeline (PDF Extraction, Chunking, Embeddings, Storage)

### Task 7: PDF Text Extraction & Text Chunking Service — TDD

**Files:**
- Create: `backend/src/services/pdf.ts`
- Create: `backend/src/services/chunker.ts`
- Test: `backend/tests/chunker.test.ts`

**Step 1: Write failing tests (`backend/tests/chunker.test.ts`)**

Test cases:
1. Splits long text into overlapping chunks using `RecursiveCharacterTextSplitter` (`chunkSize: 1000`, `chunkOverlap: 200`).
2. Preserves sequential `chunkIndex` (0, 1, 2, ...) and trims empty whitespace.
3. Returns empty array for whitespace-only input.

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/chunker.test.ts`
Expected: FAIL — `Cannot find module '../src/services/chunker.js'`.

**Step 3: Implement `backend/src/services/chunker.ts` and `backend/src/services/pdf.ts`**

- `chunker.ts`: uses `@langchain/textsplitters` (`RecursiveCharacterTextSplitter`).
- `pdf.ts`: wraps `pdf-parse` to extract clean text and page count from a `Buffer`, throwing a descriptive error if the PDF has no extractable text (e.g., scanned image-only PDF).

**Step 4: Run tests to verify pass**

Run: `cd backend && npx vitest run tests/chunker.test.ts`
Expected: PASS (3/3).

**Step 5: Commit**

Run: `git add backend/src/services/pdf.ts backend/src/services/chunker.ts backend/tests/chunker.test.ts && git commit -m "feat(ingestion): add PDF text extraction and LangChain text chunking"`
Expected: Clean commit.

---

### Task 8: Embedding & Grounded LLM Service (`ai.ts`) — TDD

**Files:**
- Create: `backend/src/services/ai.ts`
- Test: `backend/tests/ai.test.ts`

**Step 1: Write failing tests (`backend/tests/ai.test.ts`)**

Test cases:
1. `buildRagPrompt(question, chunks)` includes each chunk's filename, chunk index, and content, plus explicit instructions to answer ONLY from context and say so when context is insufficient.
2. `buildRagPrompt` handles multiple chunks cleanly without leaking raw system prompt syntax.

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/ai.test.ts`
Expected: FAIL.

**Step 3: Implement `backend/src/services/ai.ts`**

Define clean `AIService` interface:
- `embedDocuments(texts: string[]): Promise<number[][]>` (using `GoogleGenerativeAIEmbeddings` with `text-embedding-004`)
- `embedQuery(text: string): Promise<number[]>`
- `generateAnswer(question: string, contextChunks: RetrievedChunk[]): Promise<string>` (using `ChatGoogleGenerativeAI` with `gemini-2.5-flash`, `temperature: 0.1`, grounded system prompt).

Export `buildRagPrompt` as a pure function and `createGeminiAIService()` factory.

**Step 4: Run tests to verify pass**

Run: `cd backend && npx vitest run tests/ai.test.ts`
Expected: PASS.

**Step 5: Commit**

Run: `git add backend/src/services/ai.ts backend/tests/ai.test.ts && git commit -m "feat(ai): add LangChain OpenAI embedding and grounded answer service"`
Expected: Clean commit.

---

### Task 9: Document Repository & Synchronous Ingestion Service — TDD

**Files:**
- Create: `backend/src/repositories/documentRepo.ts`
- Create: `backend/src/services/ingestion.ts`
- Test: `backend/tests/ingestion.test.ts`

**Step 1: Write failing tests (`backend/tests/ingestion.test.ts`)**

Test cases (with mocked `DocumentRepository`, `extractPdfText`, and `AIService`):
1. Happy path: creates document with `status: 'processing'` -> extracts text -> chunks -> embeds -> inserts chunks -> updates status to `'completed'` -> returns completed document + `chunkCount`.
2. Failure path (e.g., empty PDF or embedding error): updates document status to `'failed'` with `error_message` and rethrows a clean `IngestionError`.

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/ingestion.test.ts`
Expected: FAIL.

**Step 3: Implement `backend/src/repositories/documentRepo.ts` and `backend/src/services/ingestion.ts`**

`DocumentRepository` interface methods (all taking `userId` to enforce ownership):
- `createDocument(userId, filename)`
- `updateDocumentStatus(documentId, userId, status, errorMessage?)`
- `insertChunks(chunks)`
- `listDocuments(userId)`
- `getDocumentById(documentId, userId)` (includes `chunk_count`)
- `deleteDocument(documentId, userId)` (returns `boolean` — `false` if not found/not owned)
- `matchChunks(queryEmbedding, userId, matchThreshold, matchCount)` (calls `match_document_chunks` RPC)

Implement `SupabaseDocumentRepository` using `getSupabaseAdminClient()`.

**Step 4: Run tests to verify pass**

Run: `cd backend && npx vitest run tests/ingestion.test.ts`
Expected: PASS (2/2).

**Step 5: Commit**

Run: `git add backend/src/repositories/documentRepo.ts backend/src/services/ingestion.ts backend/tests/ingestion.test.ts && git commit -m "feat(ingestion): add document repository and sync ingestion pipeline"`
Expected: Clean commit.

---

### Task 10: Documents REST API (`POST/GET/DELETE /api/documents`) — TDD

**Files:**
- Create: `backend/src/routes/documents.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/documents.routes.test.ts`

**Step 1: Write failing integration tests (`backend/tests/documents.routes.test.ts`)**

Test cases (using `supertest` against `createApp(deps)` with in-memory fake repo & token verifier):
1. Unauthenticated `GET /api/documents` returns `401`.
2. `POST /api/documents` rejects missing file with `400`.
3. `POST /api/documents` rejects non-PDF file (`.txt`, `text/plain`) with `400`.
4. `POST /api/documents` rejects oversized file (> `MAX_UPLOAD_SIZE_MB`) with `413` or `400`.
5. `POST /api/documents` accepts valid PDF, runs ingestion, returns `201` with document metadata & `status: 'completed'`.
6. `GET /api/documents` returns only the authenticated user's documents.
7. **Ownership isolation:** User B calling `GET /api/documents/:id` or `DELETE /api/documents/:id` for User A's document receives `404`.
8. User A calling `DELETE /api/documents/:id` deletes the document and returns `204` (or `200` with `{ deleted: true }`).

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/documents.routes.test.ts`
Expected: FAIL.

**Step 3: Implement `backend/src/routes/documents.ts` and wire into `backend/src/app.ts`**

- Configure `multer` with `memoryStorage()`, `limits: { fileSize: maxMb * 1024 * 1024 }`, and PDF MIME/extension check (`application/pdf` + `.pdf` + `%PDF-` magic header check).
- Add centralized error handler in `app.ts` so `MulterError` (`LIMIT_FILE_SIZE`) returns clean JSON `400/413` responses.
- Wire `createApp(deps?)` with dependency injection defaults so production uses real Supabase/OpenAI while tests inject fakes.

**Step 4: Run tests, typecheck, and lint**

Run: `cd backend && npm test && npm run typecheck && npm run lint`
Expected: All tests pass, 0 errors.

**Step 5: Commit**

Run: `git add backend/src/routes/documents.ts backend/src/app.ts backend/tests/documents.routes.test.ts && git commit -m "feat(api): add protected documents CRUD and PDF upload endpoints"`
Expected: Clean commit.

---

## Phase 5: RAG Query Pipeline & Chat API

### Task 11: RAG Retrieval Service & `POST /api/chat` Endpoint — TDD

**Files:**
- Create: `backend/src/services/rag.ts`
- Create: `backend/src/routes/chat.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/chat.routes.test.ts`

**Step 1: Write failing tests (`backend/tests/chat.routes.test.ts`)**

Test cases:
1. Unauthenticated `POST /api/chat` returns `401`.
2. Empty/missing `question` returns `400` (Zod validation).
3. When `matchChunks` returns relevant chunks for `req.user.id`:
   - Calls `generateAnswer` with those chunks
   - Returns `200` with `{ answer, sources: [{ documentId, filename, chunkIndex, content, similarity }] }`
   - Verifies `matchChunks` was called with `req.user.id` (never another user's chunks).
4. When `matchChunks` returns empty array (no relevant content found):
   - Does NOT hallucinate or call LLM unnecessarily
   - Returns `200` with clear message stating no relevant information was found in uploaded documents and `sources: []`.

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/chat.routes.test.ts`
Expected: FAIL.

**Step 3: Implement `backend/src/services/rag.ts`, `backend/src/routes/chat.ts`, and register in `backend/src/app.ts`**

`rag.ts`:
- `answerQuestion(userId, question)` -> `embedQuery(question)` -> `repo.matchChunks(embedding, userId, 0.3, 5)` -> if 0 chunks return fallback message + `sources: []` -> else `ai.generateAnswer(question, chunks)` -> return `{ answer, sources }`.

**Step 4: Run full backend test suite, typecheck, and lint**

Run: `cd backend && npm test && npm run typecheck && npm run lint`
Expected: All backend tests pass, 0 TypeScript errors, 0 ESLint errors.

**Step 5: Commit**

Run: `git add backend/src/services/rag.ts backend/src/routes/chat.ts backend/src/app.ts backend/tests/chat.routes.test.ts && git commit -m "feat(rag): add similarity retrieval service and POST /api/chat endpoint"`
Expected: Clean commit.

---

## Phase 6: Frontend Integration (Auth, Documents, Chat + Citations)

### Task 12: Frontend Auth Flow (Supabase Client, AuthContext, Login/Register UI)

**Files:**
- Create: `frontend/src/lib/supabase.ts`
- Create: `frontend/src/context/AuthContext.tsx`
- Create: `frontend/src/components/AuthForm.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Create `frontend/src/lib/supabase.ts`**

Initialize Supabase browser client using `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY` (never service-role key).

**Step 2: Create `frontend/src/context/AuthContext.tsx`**

Manage `session`, `user`, `loading`, `signIn(email, password)`, `signUp(email, password)`, `signOut()` via `supabase.auth.getSession()` and `supabase.auth.onAuthStateChange()`.

**Step 3: Create `frontend/src/components/AuthForm.tsx`**

Clean Login / Register toggle form with email & password validation, loading state, inline error banner, and signup confirmation feedback.

**Step 4: Wire auth gate into `frontend/src/App.tsx`**

Show loading spinner while session initializes, `<AuthForm />` when logged out, and main workspace header (user email + Logout button) when authenticated.

**Step 5: Verify typecheck, lint, and build**

Run: `cd frontend && npm run typecheck && npm run lint && npm run build`
Expected: 0 errors.

**Step 6: Commit**

Run: `git add frontend/src/ && git commit -m "feat(frontend): add Supabase Auth context and login/register screen"`
Expected: Clean commit.

---

### Task 13: Frontend API Client, Documents Panel, and RAG Chat Panel

**Files:**
- Create: `frontend/src/types/api.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/components/DocumentsPanel.tsx`
- Create: `frontend/src/components/ChatPanel.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Create `frontend/src/types/api.ts` and `frontend/src/lib/api.ts`**

Typed API helper that reads the current Supabase session access token and attaches `Authorization: Bearer <token>`:
- `fetchDocuments()` -> `GET /api/documents`
- `fetchDocument(id)` -> `GET /api/documents/:id`
- `uploadDocument(file)` -> `POST /api/documents` (`FormData`)
- `deleteDocument(id)` -> `DELETE /api/documents/:id`
- `askQuestion(question)` -> `POST /api/chat`

**Step 2: Create `frontend/src/components/DocumentsPanel.tsx`**

Features:
- PDF file picker with client-side `.pdf` & size (10 MB) validation
- Uploading indicator while synchronous ingestion runs
- Document list with status badges (`processing`, `completed`, `failed`), creation timestamp, clickable detail modal/drawer (showing chunk count / error message), and delete button with confirmation
- Loading, empty ("No documents uploaded yet"), and error states

**Step 3: Create `frontend/src/components/ChatPanel.tsx`**

Features:
- Question input form with submit button (disabled when no completed documents or while waiting for response)
- Conversation message list (user question + assistant answer)
- Expandable/visible **Sources** list under each assistant answer showing `filename`, `Chunk #N`, similarity percentage, and text excerpt
- Loading ("Searching documents and generating answer..."), empty state with example prompt, and error state

**Step 4: Compose 2-column responsive layout in `frontend/src/App.tsx` and polish `frontend/src/index.css`**

Left column: Documents Panel; Right column: RAG Chat Panel.

**Step 5: Verify typecheck, lint, and build**

Run: `cd frontend && npm run typecheck && npm run lint && npm run build`
Expected: 0 errors and clean Vite production bundle.

**Step 6: Commit**

Run: `git add frontend/src/ && git commit -m "feat(frontend): add document upload/management and RAG chat UI with citations"`
Expected: Clean commit.

---

## Phase 7: CI, Documentation & Deployment Readiness

### Task 14: GitHub Actions CI & Comprehensive README

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `README.md`

**Step 1: Create `.github/workflows/ci.yml`**

Run on `push` and `pull_request`:
- Backend job: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
- Frontend job: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`

**Step 2: Create `README.md`**

Include:
- Project overview & architecture diagram (Ingestion + Query pipelines)
- Tech stack summary
- Local setup instructions (Supabase SQL migration, backend `.env`, frontend `.env`, dev servers)
- Environment variables reference table
- API endpoints table
- Deployment guide for Vercel (frontend), Render (backend), and Supabase (DB + Auth)

**Step 3: Run full verification across backend and frontend**

Run: `cd backend && npm run lint && npm run typecheck && npm test && npm run build`
Run: `cd frontend && npm run lint && npm run typecheck && npm run build`
Expected: All checks pass with exit code 0.

**Step 4: Commit**

Run: `git add .github/workflows/ci.yml README.md && git commit -m "docs: add GitHub Actions CI workflow and project README"`
Expected: Clean commit.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-11-21-mini-rag-assistant-mvp.md`.
Next step: run `.agent/workflows/execute-plan.md` to execute this plan task-by-task in single-flow mode.
