import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  createSamplePdfDocument,
  parsePageSelection,
  extractTextFromPdfBytes,
  executePdfStudioTool,
} from './pdfEngine';

test('createSamplePdfDocument creates a valid 4-page PDF buffer and extractTextFromPdfBytes extracts real text', async () => {
  const bytes = await createSamplePdfDocument('Unit Test Spec');
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.byteLength > 1000);
  const header = new TextDecoder().decode(bytes.slice(0, 8));
  assert.ok(header.startsWith('%PDF-'));

  const extracted = await extractTextFromPdfBytes(bytes);
  assert.ok(extracted.includes('Unit Test Spec'), 'Extracted text should include the document title');
  assert.ok(extracted.includes('Executive Summary'), 'Extracted text should include section headings');
});

test('parsePageSelection handles ranges, single pages, even, odd, all, and reverse keywords', () => {
  assert.deepEqual(parsePageSelection('1, 3-4', 4), [0, 2, 3]);
  assert.deepEqual(parsePageSelection('reverse', 4), [3, 2, 1, 0]);
  assert.deepEqual(parsePageSelection('even', 5), [1, 3]);
  assert.deepEqual(parsePageSelection('odd', 5), [0, 2, 4]);
  assert.deepEqual(parsePageSelection('all', 4), [0, 1, 2, 3]);
});

test('pdf-1-merge requires >= 2 files and merges all selected PDFs with A4 normalization', async () => {
  const doc1 = await createSamplePdfDocument('Doc One');
  const doc2 = await createSamplePdfDocument('Doc Two');

  await assert.rejects(
    async () => {
      await executePdfStudioTool('pdf-1-merge', [{ name: 'only-one.pdf', bytes: doc1 }], {});
    },
    /requires at least 2 PDF files/i
  );

  const merged = await executePdfStudioTool(
    'pdf-1-merge',
    [
      { name: 'first.pdf', bytes: doc1 },
      { name: 'second.pdf', bytes: doc2 },
    ],
    { normalizePageSize: true }
  );
  assert.equal(merged.pageCount, 8);
  assert.equal(merged.mimeType, 'application/pdf');
});

test('canonical conversion tools (#13, #14, #15, #20), #2 Split range/chunks, and #11 Booklet padding', async () => {
  const sample = await createSamplePdfDocument('Conversion Test');
  const files = [{ name: 'test.pdf', bytes: sample }];

  // #2 Split by range using catalog param pageRange
  const splitRange = await executePdfStudioTool('pdf-2-split', files, {
    splitMode: 'range',
    pageRange: '2-3',
  });
  assert.equal(splitRange.pageCount, 2);

  // #2 Split chunks ZIP
  const splitChunks = await executePdfStudioTool('pdf-2-split', files, {
    splitMode: 'chunks',
    chunkSize: 2,
  });
  assert.equal(splitChunks.mimeType, 'application/zip');
  assert.equal(splitChunks.outputBytes[0], 0x50);
  assert.equal(splitChunks.outputBytes[1], 0x4b);

  // #11 Booklet pads 3 pages to 4 pages (2 two-up spread pages)
  const threePageSplit = await executePdfStudioTool('pdf-2-split', files, {
    splitMode: 'range',
    pageRange: '1-3',
  });
  const booklet = await executePdfStudioTool(
    'pdf-11-booklet',
    [{ name: 'three.pdf', bytes: threePageSplit.outputBytes }],
    { bindingEdge: 'right', drawFoldGuide: true }
  );
  assert.equal(booklet.pageCount, 2);

  // Canonical OpenXML & CSV exports
  const docx = await executePdfStudioTool('pdf-13-to-word', files, {});
  assert.equal(docx.outputBytes[0], 0x50);
  assert.equal(docx.outputBytes[1], 0x4b);

  const xlsx = await executePdfStudioTool('pdf-14-to-excel', files, {});
  assert.equal(xlsx.outputBytes[0], 0x50);
  assert.equal(xlsx.outputBytes[1], 0x4b);

  const pptx = await executePdfStudioTool('pdf-15-to-ppt', files, {});
  assert.equal(pptx.outputBytes[0], 0x50);
  assert.equal(pptx.outputBytes[1], 0x4b);

  const csv = await executePdfStudioTool('pdf-20-to-csv', files, { delimiter: ',' });
  assert.equal(csv.mimeType, 'text/csv');
  assert.ok(csv.previewText?.includes('Page,Line'));
});

test('Convert-TO-PDF (#27-#30) works in direct input mode without uploaded files and paginates long Markdown', async () => {
  const longLines = Array.from(
    { length: 95 },
    (_, i) => `Line ${i + 1}: Smart quotes “test” — arrow → bullet • item`
  ).join('\n');

  const mdPdf = await executePdfStudioTool('pdf-29-markdown-to-pdf', [], {
    markdownText: longLines,
    pageSize: 'Letter',
  });
  assert.ok(mdPdf.pageCount >= 2, '95 lines should paginate onto at least 2 pages');
  assert.equal(mdPdf.mimeType, 'application/pdf');
});

test('Rotate (#6 preset & custom 45°), Certify (#37), Extract Text (#49), Flatten (#51), Metadata (#55), Header/Footer (#58), Background Tint (#59), and Encryption (#31 & #33)', async () => {
  const sample1 = await createSamplePdfDocument('Alpha Spec');
  const singleFile = [{ name: 'test.pdf', bytes: sample1 }];

  // #6 Rotate 90°
  const rotated90 = await executePdfStudioTool('pdf-6-rotate', singleFile, {
    angle: '90',
    targetPages: 'even',
  });
  assert.equal(rotated90.pageCount, 4);

  // #6 Custom non-90° angle (45°)
  const rotated45 = await executePdfStudioTool('pdf-6-rotate', singleFile, {
    angle: 'custom',
    customAngle: 45,
    targetPages: 'all',
  });
  assert.equal(rotated45.pageCount, 4);
  const loaded45 = await PDFDocument.load(rotated45.outputBytes);
  const firstPageSize = loaded45.getPages()[0].getSize();
  assert.ok(firstPageSize.width > 600, '45-degree rotated A4 canvas should expand width cleanly');

  // #37 Certify PDF
  const certified = await executePdfStudioTool('pdf-37-certify', singleFile, {
    authority: 'Forma Studio Trust Root CA',
    lockAfterCertify: true,
  });
  assert.equal(certified.mimeType, 'application/pdf');
  const certText = await extractTextFromPdfBytes(certified.outputBytes);
  assert.ok(certText.includes('CERTIFIED') || certified.summary.includes('Certified'));

  // #49 Extract Text
  const extracted = await executePdfStudioTool('pdf-49-extract-text', singleFile, {
    includeWordStats: true,
  });
  assert.equal(extracted.mimeType, 'text/plain');
  assert.ok(extracted.previewText?.includes('Words:'));

  // #51 Flatten PDF
  const flattened = await executePdfStudioTool('pdf-51-flatten', singleFile, {
    flattenForms: true,
  });
  assert.equal(flattened.mimeType, 'application/pdf');

  // #55 Metadata Changer
  const meta = await executePdfStudioTool('pdf-55-metadata', singleFile, {
    title: 'Custom Audit Spec',
    author: 'Engineering QA',
    subject: 'Verification',
    keywords: 'pdf,qa,forma',
  });
  const loadedMeta = await PDFDocument.load(meta.outputBytes);
  assert.equal(loadedMeta.getTitle(), 'Custom Audit Spec');
  assert.equal(loadedMeta.getAuthor(), 'Engineering QA');

  // #58 Header & Footer Stamping
  const hf = await executePdfStudioTool('pdf-58-header-footer', singleFile, {
    headerText: 'CONFIDENTIAL SPEC',
    footerText: 'Forma Studio Revision 2',
    fontSize: 10,
  });
  assert.equal(hf.pageCount, 4);

  // #59 Background Color / Page Tint
  const bg = await executePdfStudioTool('pdf-59-background-color', singleFile, {
    bgColor: '#FEF3C7',
    opacity: 40,
  });
  assert.equal(bg.pageCount, 4);

  // #31 & #33 Encryption
  const encrypted = await executePdfStudioTool('pdf-31-encrypt', singleFile, {
    userPassword: 'secretUser123',
    ownerPassword: 'secretOwner123',
  });
  const rawEncryptedText = new TextDecoder('latin1').decode(encrypted.outputBytes);
  assert.ok(rawEncryptedText.includes('/Encrypt'), 'Encrypted PDF must contain /Encrypt dictionary');

  const permissionsLocked = await executePdfStudioTool('pdf-33-permissions', singleFile, {
    ownerPassword: 'ownerLockPassword',
    allowPrinting: false,
    allowCopying: false,
  });
  const rawPermText = new TextDecoder('latin1').decode(permissionsLocked.outputBytes);
  assert.ok(rawPermText.includes('/Encrypt'), 'Permissions-locked PDF must contain /Encrypt dictionary');
});

test('Non-direct PDF tools reject empty file arrays instead of falling back to sample data', async () => {
  await assert.rejects(
    async () => {
      await executePdfStudioTool('pdf-6-rotate', [], { angle: '90' });
    },
    /requires.*input|upload/i
  );
});

test('Expanded PDF Studio Tools (#61 Insert Blank Pages, #62 Resize Pages, #63 TOC Builder, #64 Exhibit Sticker, #65 Dark Reader Theme, and #66 Standalone Invoice Builder) execute cleanly', async () => {
  const sample = await createSamplePdfDocument('Expanded PDF Spec');
  const files = [{ name: 'expanded.pdf', bytes: sample }];

  // #61 Insert Blank / Ruled / Grid Pages
  const inserted = await executePdfStudioTool('pdf-61-insert-blank-pages', files, {
    pageStyle: 'ruled',
    insertPosition: 'end',
    count: 2,
  });
  assert.equal(inserted.pageCount, 6);

  // #62 Scale & Resize Page Dimensions
  const resized = await executePdfStudioTool('pdf-62-resize-pages', files, {
    targetSize: 'LETTER',
    orientation: 'landscape',
    marginPt: 18,
  });
  assert.equal(resized.pageCount, 4);

  // #63 Table of Contents & Outline Builder
  const toc = await executePdfStudioTool('pdf-63-bookmarks-toc', files, {
    tocTitle: 'PROJECT SPECIFICATION INDEX',
    includeDotLeaders: true,
  });
  assert.equal(toc.pageCount, 5);
  assert.ok(toc.previewText?.includes('Page 2'));

  // #64 Legal Exhibit Sticker Stamping
  const exhibit = await executePdfStudioTool('pdf-64-exhibit-sticker', files, {
    exhibitLabel: 'EXHIBIT B',
    docketNumber: 'CASE 2026-CV-99',
    badgeColor: 'navy',
    stampScope: 'all',
  });
  assert.equal(exhibit.pageCount, 4);

  // #65 Dark-Mode / Invert PDF Reader Theme
  const darkPdf = await executePdfStudioTool('pdf-65-invert-dark-pdf', files, {
    readerTheme: 'dark-slate',
    intensity: 40,
  });
  assert.equal(darkPdf.pageCount, 4);

  // #66 Standalone PDF Invoice & Receipt Builder (works without uploaded files!)
  const invoice = await executePdfStudioTool('pdf-66-invoice-generator', [], {
    invoiceNumber: 'INV-2026-9001',
    vendorName: 'Forma Engineering',
    clientName: 'Global Client Corp',
    lineItemsText: 'Architecture Audit | 2 | 500\nSupport Plan | 1 | 250',
    taxPercent: 10,
    currencySymbol: '$',
  });
  assert.equal(invoice.pageCount, 1);
  assert.equal(invoice.mimeType, 'application/pdf');
  assert.ok(invoice.previewText?.includes('Total Due: $1375.00'));
});

