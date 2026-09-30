import { extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export async function parseResume({ name, base64 }) {
  if (
    typeof name !== 'string' ||
    typeof base64 !== 'string' ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  )
    throw new Error('Choose a valid résumé file.');
  const data = Buffer.from(base64, 'base64');
  if (!data.length || data.length > 5 * 1024 * 1024)
    throw new Error('Choose a résumé smaller than 5 MB.');
  const ext = extname(name).toLowerCase();
  let text, mime;
  if (ext === '.txt') {
    text = data.toString('utf8');
    mime = 'text/plain';
  } else if (ext === '.pdf') {
    if (!data.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new Error('This file is not a PDF.');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({
      data: new Uint8Array(data),
      isEvalSupported: false,
      useSystemFonts: false,
      standardFontDataUrl: fileURLToPath(
        new URL('../../standard_fonts/', import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs')),
      ),
    });
    try {
      const doc = await task.promise;
      if (doc.numPages > 20) throw new Error('Use a résumé with at most 20 pages.');
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++)
        pages.push(
          (await (await doc.getPage(i)).getTextContent()).items.map((i) => i.str || '').join(' '),
        );
      text = pages.join('\n');
      mime = 'application/pdf';
    } finally {
      await task.destroy();
    }
  } else if (ext === '.docx') {
    const { default: mammoth } = await import('mammoth');
    // Check expanded size before handing the archive to the document parser.
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(data);
    if (
      Object.keys(zip.files).length > 500 ||
      Object.values(zip.files).reduce((n, f) => n + (f._data?.uncompressedSize || 0), 0) >
        20_000_000
    )
      throw new Error('This Word document is too large to process.');
    text = (await mammoth.extractRawText({ buffer: data }, { externalFileAccess: false })).value;
    mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else throw new Error('Upload a PDF, DOCX, or TXT résumé.');
  text = text.replace(/\u0000/g, '').trim();
  if (text.length < 60)
    throw new Error('No readable résumé text found. Export a text-based PDF, DOCX, or TXT file.');
  if (text.length > 60000) throw new Error('Résumé text is too long. Use a shorter document.');
  return {
    name: basename(name)
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .slice(-160),
    mime,
    text,
    data,
    hash: createHash('sha256').update(data).digest('hex'),
    uploadedAt: new Date().toISOString(),
  };
}
