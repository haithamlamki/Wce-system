// ============================================================================
//  Browser-side PDF text extraction.
//
//  Runs entirely in the tab: the certificate is never uploaded anywhere to be
//  read. Text items are regrouped into visual lines by their y position,
//  because certificate layouts only make sense read left-to-right by row —
//  pdf.js emits them in drawing order, which interleaves table columns.
// ============================================================================
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Items sharing a y position within this many units are one visual line. */
const ROW_TOLERANCE = 2;

interface TextItemLike { str: string; transform: number[] }

function toLines(items: TextItemLike[]): string {
  const rows = new Map<number, { x: number; s: string }[]>();
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.transform[5]);
    const key = [...rows.keys()].find((k) => Math.abs(k - y) <= ROW_TOLERANCE) ?? y;
    const row = rows.get(key) ?? [];
    row.push({ x: it.transform[4], s: it.str });
    rows.set(key, row);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row
      .sort((a, b) => a.x - b.x)
      .map((i) => i.s)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Extracts one text string per page. An empty string means that page carries no
 * text layer — i.e. it is a scan, and OCR would be required to read it.
 */
export async function readPdfPages(file: File): Promise<string[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  try {
    const pages: string[] = [];
    // Sequential: pdf.js shares one worker, so parallelism buys nothing here.
    for (let p = 1; p <= doc.numPages; p += 1) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      pages.push(toLines(content.items as TextItemLike[]));
      page.cleanup();
    }
    return pages;
  } finally {
    // Frees the worker's page cache; the document is not reused after this.
    await doc.cleanup();
  }
}
