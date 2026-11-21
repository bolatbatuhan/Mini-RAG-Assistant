import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export interface TextChunk {
  chunkIndex: number;
  content: string;
}

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

export async function splitTextIntoChunks(
  text: string,
  options: ChunkOptions = {}
): Promise<TextChunk[]> {
  const cleaned = text.trim();
  if (!cleaned) {
    return [];
  }

  const chunkSize = options.chunkSize ?? 1000;
  const chunkOverlap = options.chunkOverlap ?? 200;

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
  });

  const rawChunks = await splitter.splitText(cleaned);

  return rawChunks
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((content, chunkIndex) => ({
      chunkIndex,
      content,
    }));
}
