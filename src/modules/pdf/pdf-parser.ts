import { createRequire } from 'module';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { PNG } from 'pngjs';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

export type ParsedQuestionOption = {
  label: string;
  content: string;
};

export type ParsedQuestion = {
  id: string;
  questionNumber: number;
  type: string;
  content: string;
  options: ParsedQuestionOption[];
  correctAnswer: string;
  explanation: string;
  subQuestions: null;
  caseId: null;
  caseOrder: null;
  case: null;
  caseContent: null;
  bookmarked: boolean;
  hasNote: boolean;
};

export type ParsePdfOptions = {
  inputPath: string;
  outputPath: string;
};

export async function parsePdfQuestions(options: ParsePdfOptions): Promise<void> {
  const inputAbsolute = path.resolve(options.inputPath);
  const outputAbsolute = path.resolve(options.outputPath);

  console.log(`Reading PDF from ${inputAbsolute}...`);
  const dataBuffer = await fs.readFile(inputAbsolute);

  const data = await pdf(dataBuffer);
  const fullText = data.text;

  // Split by "Question #"
  // The format is usually "Question #1", "Question #2", etc.
  const questionsRaw = fullText.split(/Question #(\d+)/);
  
  const questions: ParsedQuestion[] = [];

  // The split result will be: [preamble, "1", " content...", "2", " content...", ...]
  // So we iterate with step 2
  for (let i = 1; i < questionsRaw.length; i += 2) {
    const questionNoStr = questionsRaw[i];
    const content = questionsRaw[i + 1];
    const questionId = parseInt(questionNoStr, 10);
    
    // Process content to extract Question Text, Options, Answer
    
    // 1. Extract Answer
    const answerMatch = content.match(/Correct Answer:\s*([A-Z]+)/);
    const answer = answerMatch ? answerMatch[1] : '';

    // 2. Extract Options
    const optionsStartIndex = content.search(/(^|\n)A\.\s/);
    
    let questionText = '';
    const questionOptions: ParsedQuestionOption[] = [];

    if (optionsStartIndex !== -1) {
      // Everything before "A. " is the question text
      questionText = content.substring(0, optionsStartIndex).trim();
      
      // Clean up "Topic X" from start
      questionText = questionText.replace(/^Topic \d+\s*/, '').trim();

      // The rest is options + answer + extra info
      // We want to stop at "Correct Answer:"
      const contentAfterA = content.substring(optionsStartIndex);
      const endOfOptions = contentAfterA.indexOf('Correct Answer:');
      const optionsBlock = endOfOptions !== -1 ? contentAfterA.substring(0, endOfOptions) : contentAfterA;

      // Now split optionsBlock by "A. ", "B. ", etc.
      // We can use a regex to match all option starts
      const optionMatches = [...optionsBlock.matchAll(/(^|\n)([A-Z])\.\s/g)];
      
      for (let j = 0; j < optionMatches.length; j++) {
        const match = optionMatches[j];
        const start = match.index! + match[0].length; // start of option text
        const nextMatch = optionMatches[j + 1];
        let end = nextMatch ? nextMatch.index! : optionsBlock.length;
        
        let optionContent = optionsBlock.substring(start, end).trim();
        
        // Remove "Most Voted" if present
        optionContent = optionContent.replace(/Most Voted/g, '').trim();
        
        const letter = match[2];
        questionOptions.push({
          label: letter,
          content: optionContent
        });
      }
    } else {
      // Fallback: No "A. " found. Maybe text only or weird formatting.
      if (answerMatch) {
        questionText = content.substring(0, answerMatch.index).trim();
      } else {
        questionText = content.trim();
      }
      questionText = questionText.replace(/^Topic \d+\s*/, '').trim();
    }
    
    // Format content as HTML paragraph(s)
    // Simple approach: split by double newlines and wrap in <p>
    const contentHtml = questionText
      .split(/\n\s*\n/)
      .map(p => `<p>${p.replace(/\n/g, ' ').trim()}</p>`)
      .join('');

    questions.push({
      id: randomUUID(),
      questionNumber: questionId,
      type: answer.length > 1 ? 'multiple' : 'single',
      content: contentHtml || `<p>${questionText}</p>`,
      options: questionOptions,
      correctAnswer: answer,
      explanation: '', // PDF parsing doesn't robustly extract explanation yet
      subQuestions: null,
      caseId: null,
      caseOrder: null,
      case: null,
      caseContent: null,
      bookmarked: false,
      hasNote: false
    });
  }

  const result = {
    questions
  };

  await fs.writeFile(outputAbsolute, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`Saved JSON to ${outputAbsolute}`);
  console.log(`Parsed ${questions.length} questions.`);
}

export type ExtractPdfImagesOptions = {
  pdfPath: string;
  inputJsonPath: string;
  outputJsonPath: string;
  minWidth?: number;
  minHeight?: number;
};

async function getPdfObject(objs: any, id: string): Promise<any> {
  return await new Promise((resolve, reject) => {
    try {
      objs.get(id, (obj: any) => resolve(obj));
    } catch (error) {
      reject(error);
    }
  });
}

function rgbaToPngBuffer(image: any): Buffer | null {
  if (!image || typeof image.width !== 'number' || typeof image.height !== 'number' || !image.data) return null;
  const width: number = image.width;
  const height: number = image.height;
  const raw = image.data as Uint8Array | Uint8ClampedArray | Buffer;
  const rawBuf = Buffer.from(raw as any);

  let rgba: Buffer;
  if (rawBuf.length === width * height * 4) {
    rgba = rawBuf;
  } else if (rawBuf.length === width * height * 3) {
    rgba = Buffer.alloc(width * height * 4);
    for (let i = 0, j = 0; i < rawBuf.length; i += 3, j += 4) {
      rgba[j] = rawBuf[i]!;
      rgba[j + 1] = rawBuf[i + 1]!;
      rgba[j + 2] = rawBuf[i + 2]!;
      rgba[j + 3] = 255;
    }
  } else {
    return null;
  }

  const png = new PNG({ width, height });
  png.data = rgba;
  return PNG.sync.write(png);
}

type Matrix = [number, number, number, number, number, number];

type QuestionAnchor = {
  questionNumber: number;
  y: number;
};

type QuestionAnchorLine = {
  questionNumber: number;
  y: number;
  lineIndex: number;
};

type ExtractedPageImage = {
  pngBuffer: Buffer;
  width: number;
  height: number;
  x: number;
  y: number;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function multiplyMatrix(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function groupTextIntoLines(items: any[]): { y: number; text: string }[] {
  const rows = new Map<number, { y: number; parts: { x: number; str: string }[] }>();

  for (const item of items) {
    const str = String(item?.str ?? '').trim();
    if (!str) continue;
    const transform = item?.transform as number[] | undefined;
    const x = typeof transform?.[4] === 'number' ? transform[4] : 0;
    const y = typeof transform?.[5] === 'number' ? transform[5] : 0;
    const yKey = Math.round(y / 2) * 2;
    const row = rows.get(yKey) ?? { y, parts: [] };
    row.parts.push({ x, str });
    rows.set(yKey, row);
  }

  return [...rows.values()]
    .map((row) => ({
      y: row.y,
      text: row.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    }))
    .filter((l) => l.text.length > 0)
    .sort((a, b) => b.y - a.y);
}

function isOptionLine(text: string): boolean {
  return /^\s*[A-H][.)]\s+/.test(text);
}

function isNoiseLine(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^Question\s*#\s*\d+/i.test(t)) return true;
  if (/^Topic\s*\d+/i.test(t)) return true;
  if (/^Most\s*Voted/i.test(t)) return true;
  if (/^Correct\s*Answer:/i.test(t)) return true;
  return false;
}

function extractQuestionAnchorsFromLines(lines: { y: number; text: string }[]): QuestionAnchorLine[] {
  const anchors: QuestionAnchorLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = line.text.match(/Question\s*#\s*(\d+)/i);
    if (!match) continue;
    const qn = Number(match[1]);
    if (!Number.isFinite(qn)) continue;
    anchors.push({ questionNumber: qn, y: line.y, lineIndex: i });
  }
  return anchors.sort((a, b) => b.y - a.y);
}

function extractQuestionAnchorsFromTextItems(items: any[]): QuestionAnchor[] {
  const lines = groupTextIntoLines(items);
  const anchors: QuestionAnchor[] = [];
  for (const line of lines) {
    const match = line.text.match(/Question\s*#\s*(\d+)/i);
    if (!match) continue;
    const qn = Number(match[1]);
    if (!Number.isFinite(qn)) continue;
    anchors.push({ questionNumber: qn, y: line.y });
  }
  return anchors.sort((a, b) => b.y - a.y);
}

function findBestAnchorForImage(anchors: QuestionAnchor[], imageY: number): QuestionAnchor | null {
  if (anchors.length === 0) return null;
  let best: { anchor: QuestionAnchor; score: number } | null = null;

  for (const anchor of anchors) {
    const score = anchor.y >= imageY ? anchor.y - imageY : 10_000 + (imageY - anchor.y);
    if (!best || score < best.score) best = { anchor, score };
  }

  return best?.anchor ?? null;
}

function buildStemParagraphs(
  lines: { y: number; text: string }[],
  startIndex: number,
  endIndexExclusive: number,
): { y: number; text: string }[] {
  const result: { y: number; text: string }[] = [];
  const threshold = 18;
  let current: { y: number; parts: string[] } | null = null;

  for (let i = startIndex; i < endIndexExclusive; i++) {
    const line = lines[i]!;
    if (isNoiseLine(line.text)) continue;
    if (isOptionLine(line.text)) break;

    if (!current) {
      current = { y: line.y, parts: [line.text] };
      continue;
    }

    const gap = current.y - line.y;
    if (gap > threshold) {
      const paragraphText = current.parts.join(' ').replace(/\s+/g, ' ').trim();
      if (paragraphText) result.push({ y: current.y, text: paragraphText });
      current = { y: line.y, parts: [line.text] };
    } else {
      current.parts.push(line.text);
    }
  }

  if (current) {
    const paragraphText = current.parts.join(' ').replace(/\s+/g, ' ').trim();
    if (paragraphText) result.push({ y: current.y, text: paragraphText });
  }

  return result;
}

type OrderedBlock =
  | { kind: 'text'; y: number; text: string }
  | { kind: 'image'; y: number; src: string; alt: string };

async function extractImagesFromPage(
  pdfjsLib: any,
  page: any,
  minWidth: number,
  minHeight: number,
): Promise<ExtractedPageImage[]> {
  const opList = await page.getOperatorList();
  const images: ExtractedPageImage[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fnId = opList.fnArray[i];
    const args = opList.argsArray[i] as any[];

    if (fnId === pdfjsLib.OPS.save) {
      stack.push(ctm);
      continue;
    }
    if (fnId === pdfjsLib.OPS.restore) {
      ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      continue;
    }
    if (fnId === pdfjsLib.OPS.transform || fnId === pdfjsLib.OPS.setTransform) {
      const m = args as number[];
      if (Array.isArray(m) && m.length >= 6) {
        ctm = multiplyMatrix(ctm, [m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!]);
      }
      continue;
    }

    if (
      fnId !== pdfjsLib.OPS.paintImageXObject &&
      fnId !== pdfjsLib.OPS.paintJpegXObject &&
      fnId !== pdfjsLib.OPS.paintInlineImageXObject
    ) {
      continue;
    }

    let imageObj: any | null = null;
    if (fnId === pdfjsLib.OPS.paintInlineImageXObject) {
      imageObj = args?.[0] ?? null;
    } else {
      const name = String(args?.[0] ?? '');
      if (name) {
        imageObj =
          (await getPdfObject((page as any).objs, name).catch(() => null)) ??
          (await getPdfObject((page as any).commonObjs, name).catch(() => null));
      }
    }

    const width = Number(imageObj?.width ?? 0);
    const height = Number(imageObj?.height ?? 0);
    if (!Number.isFinite(width) || !Number.isFinite(height)) continue;
    if (width < minWidth || height < minHeight) continue;

    const pngBuffer = rgbaToPngBuffer(imageObj);
    if (!pngBuffer) continue;

    images.push({
      pngBuffer,
      width,
      height,
      x: ctm[4],
      y: ctm[5],
    });
  }

  return images;
}

export async function extractPdfImagesIntoQuestions(options: ExtractPdfImagesOptions): Promise<void> {
  const pdfAbsolute = path.resolve(options.pdfPath);
  const inputJsonAbsolute = path.resolve(options.inputJsonPath);
  const outputJsonAbsolute = path.resolve(options.outputJsonPath);
  const minWidth = options.minWidth ?? 80;
  const minHeight = options.minHeight ?? 80;

  console.log(`Extracting images from ${pdfAbsolute}...`);

  const jsonRaw = await fs.readFile(inputJsonAbsolute, 'utf-8');
  const parsed = JSON.parse(jsonRaw) as { questions?: ParsedQuestion[] };
  if (!parsed.questions || !Array.isArray(parsed.questions)) {
    throw new Error(`Invalid JSON format: expected { "questions": [...] } in ${inputJsonAbsolute}`);
  }

  const questionsByNumber = new Map<number, ParsedQuestion>();
  for (const q of parsed.questions) questionsByNumber.set(q.questionNumber, q);

  const examName = path.basename(outputJsonAbsolute, path.extname(outputJsonAbsolute));
  const jsonDir = path.dirname(outputJsonAbsolute);
  const imagesDirAbsolute = path.join(jsonDir, 'images', examName);
  const imagesDirRelative = path.posix.join('images', examName);

  await fs.mkdir(imagesDirAbsolute, { recursive: true });

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfDataBuffer = await fs.readFile(pdfAbsolute);
  const pdfData = new Uint8Array(pdfDataBuffer.buffer, pdfDataBuffer.byteOffset, pdfDataBuffer.byteLength);
  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;

  const perQuestionCounts = new Map<number, number>();
  const updated = new Set<number>();
  let extractedImages = 0;
  let linkedImages = 0;

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
    try {
      console.log(`Processing page ${pageIndex}/${pdf.numPages}...`);
      const page = await pdf.getPage(pageIndex);
      const textContent = await page.getTextContent();
      const lines = groupTextIntoLines(textContent?.items ?? []);
      const anchors = extractQuestionAnchorsFromLines(lines);
      const pageImages = await extractImagesFromPage(pdfjsLib, page, minWidth, minHeight);

      for (let a = 0; a < anchors.length; a++) {
        const anchor = anchors[a]!;
        const nextAnchor = anchors[a + 1];
        const upperY = anchor.y;
        const lowerY = nextAnchor ? nextAnchor.y : Number.NEGATIVE_INFINITY;

        const question = questionsByNumber.get(anchor.questionNumber);
        if (!question) continue;

        const imagesInRegion = pageImages.filter((img) => img.y <= upperY && img.y > lowerY);
        if (imagesInRegion.length === 0) continue;

        const endLineIndexExclusive = nextAnchor ? nextAnchor.lineIndex : lines.length;
        const stemParagraphs = buildStemParagraphs(lines, anchor.lineIndex + 1, endLineIndexExclusive);

        const blocks: OrderedBlock[] = [];
        for (const p of stemParagraphs) blocks.push({ kind: 'text', y: p.y, text: p.text });

        const imagesSorted = [...imagesInRegion].sort((x, y) => y.y - x.y);
        for (const img of imagesSorted) {
          extractedImages += 1;
          const currentCount = perQuestionCounts.get(anchor.questionNumber) ?? 0;
          const nextCountValue = currentCount + 1;
          perQuestionCounts.set(anchor.questionNumber, nextCountValue);

          const filename = `q${anchor.questionNumber}_p${pageIndex}_${nextCountValue}.png`;
          const outputImageAbsolute = path.join(imagesDirAbsolute, filename);
          const outputImageRelative = path.posix.join(imagesDirRelative, filename);

          await fs.writeFile(outputImageAbsolute, img.pngBuffer);
          blocks.push({
            kind: 'image',
            y: img.y,
            src: outputImageRelative,
            alt: `Question ${anchor.questionNumber} image ${nextCountValue}`,
          });
          linkedImages += 1;
        }

        blocks.sort((x, y) => y.y - x.y);

        const html = blocks
          .map((b) => {
            if (b.kind === 'text') return `<p>${escapeHtml(b.text)}</p>`;
            return `<p><img src="${b.src}" alt="${escapeHtml(b.alt)}" /></p>`;
          })
          .join('');

        if (html) {
          question.content = html;
          updated.add(anchor.questionNumber);
        }
      }

      if (pageImages.length > 0) {
        await fs.writeFile(outputJsonAbsolute, JSON.stringify(parsed, null, 2), 'utf-8');
      }
    } catch (error) {
      console.error(`Failed processing page ${pageIndex}:`, error instanceof Error ? error.message : error);
    }
  }

  await fs.writeFile(outputJsonAbsolute, JSON.stringify(parsed, null, 2), 'utf-8');
  console.log(`Saved JSON to ${outputJsonAbsolute}`);
  console.log(`Extracted images: ${extractedImages}`);
  console.log(`Linked images: ${linkedImages}`);
  console.log(`Updated questions: ${[...updated].sort((a, b) => a - b).join(', ') || '(none)'}`);
}
