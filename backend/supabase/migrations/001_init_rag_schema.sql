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

-- Least-privilege grants: only backend service_role accesses tables and RPC
grant usage on schema public to service_role;
grant all on table public.documents to service_role;
grant all on table public.document_chunks to service_role;
grant execute on function public.match_document_chunks(vector(768), uuid, float, int) to service_role;

