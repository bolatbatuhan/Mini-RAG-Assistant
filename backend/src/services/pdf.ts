import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export interface ExtractedPdf {
  text: string;
  pageCount: number;
}

export type PdfTextExtractor = (buffer: Buffer) => Promise<ExtractedPdf>;

export const extractPdfText: PdfTextExtractor = async (buffer: Buffer): Promise<ExtractedPdf> => {
  if (!buffer || buffer.length === 0) {
    throw new Error('PDF file buffer is empty');
  }

  const parsed = await pdfParse(buffer);
  const text = (parsed.text ?? '').replace(/\0/g, '').trim();

  if (!text) {
    throw new Error('No extractable text found in PDF');
  }

  return {
    text,
    pageCount: parsed.numpages ?? 0,
  };
};
