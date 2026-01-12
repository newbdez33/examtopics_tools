import fs from 'fs/promises';
import path from 'path';
import { parseFirstCurlRequestFromScript, type CurlRequestTemplate } from './curl-parser.js';

type FetchAllQuestionsOptions = {
  inputPath: string;
  outputPath: string;
  start?: number;
  limit?: number;
  maxPages: number;
  targetOffset: number;
  delay?: number;
  splitOutput?: boolean;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type FetchResult = {
  template: {
    url: string;
    headers: Record<string, string>;
    hasCookie: boolean;
  };
  request: {
    examId?: string;
    mode?: string;
    includeStatus?: boolean;
    includeUserStatus?: boolean;
    limit?: number;
  };
  pages: Array<{
    start: number;
    limit: number;
    targetQuestionId: number;
    requestId: string;
    itemCount: number | null;
  }>;
  questions: unknown[];
};

function assertNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected ${name} to be a finite number`);
  }
  return value;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function extractArrayCandidates(root: unknown, maxDepth: number): unknown[][] {
  const results: unknown[][] = [];
  const visited = new Set<unknown>();

  const walk = (node: unknown, depth: number) => {
    if (depth > maxDepth) return;
    if (node === null || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      results.push(node);
      for (const item of node) walk(item, depth + 1);
      return;
    }

    for (const value of Object.values(node as Record<string, unknown>)) {
      walk(value, depth + 1);
    }
  };

  walk(root, 0);
  return results;
}

function pickQuestionsArray(parsed: unknown): unknown[] | null {
  if (parsed === null || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  const direct = obj['questions'];
  if (Array.isArray(direct)) return direct;

  const data = obj['data'];
  if (data && typeof data === 'object') {
    const inner = (data as Record<string, unknown>)['questions'];
    if (Array.isArray(inner)) return inner;
  }

  const candidates = extractArrayCandidates(parsed, 4);
  const ranked = candidates
    .map((arr): { arr: unknown[]; score: number } => {
      const score = arr.reduce<number>((acc, item) => {
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          if (typeof rec['question'] === 'string') return acc + 3;
          if (typeof rec['questionId'] === 'number') return acc + 2;
          if (typeof rec['id'] === 'number') return acc + 1;
        }
        return acc;
      }, 0);
      return { arr, score };
    })
    .filter((x) => x.arr.length > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.arr ?? null;
}

function buildRequest(template: CurlRequestTemplate, body: unknown, requestId: string): RequestInit {
  const headers = new Headers();
  for (const [k, v] of Object.entries(template.headers)) {
    headers.set(k, v);
  }

  if (template.cookie) {
    headers.set('cookie', template.cookie);
  }

  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  headers.set('x-request-id', requestId);

  return {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  };
}

function normalizeStartLimit(payload: Record<string, unknown>, options: { start: number | undefined; limit: number | undefined }) {
  if (typeof options.start === 'number') payload['start'] = options.start;
  if (typeof options.limit === 'number') payload['limit'] = options.limit;
}

function setRequestIds(payload: Record<string, unknown>, requestId: string) {
  payload['requestId'] = requestId;
}

function setTarget(payload: Record<string, unknown>, start: number, targetOffset: number) {
  payload['targetQuestionId'] = start + targetOffset;
}

function safeExtractRequestSummary(payload: Record<string, unknown>): FetchResult['request'] {
  const out: FetchResult['request'] = {};
  if (typeof payload['examId'] === 'string') out.examId = payload['examId'];
  if (typeof payload['mode'] === 'string') out.mode = payload['mode'];
  if (typeof payload['includeStatus'] === 'boolean') out.includeStatus = payload['includeStatus'];
  if (typeof payload['includeUserStatus'] === 'boolean') out.includeUserStatus = payload['includeUserStatus'];
  if (typeof payload['limit'] === 'number') out.limit = payload['limit'];
  return out;
}

function dedupeQuestions(items: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      out.push(item);
      continue;
    }
    const rec = item as Record<string, unknown>;
    const key =
      typeof rec['questionId'] === 'number'
        ? `questionId:${rec['questionId']}`
        : typeof rec['id'] === 'number'
          ? `id:${rec['id']}`
          : null;
    if (!key) {
      out.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

export async function fetchAllQuestionsFromCurlScript(options: FetchAllQuestionsOptions): Promise<void> {
  const inputAbsolute = path.resolve(options.inputPath);
  const outputAbsolute = path.resolve(options.outputPath);

  const scriptText = await fs.readFile(inputAbsolute, 'utf-8');
  const template = parseFirstCurlRequestFromScript(scriptText);
  if (!template.bodyText) throw new Error('Curl script did not include a request body');

  const parsedBody = safeJsonParse(template.bodyText);
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
    throw new Error('Curl body is not a JSON object');
  }

  const payload = parsedBody as Record<string, unknown>;
  normalizeStartLimit(payload, { start: options.start, limit: options.limit });

  const baseStart = typeof payload['start'] === 'number' ? payload['start'] : 0;
  const baseLimit = typeof payload['limit'] === 'number' ? payload['limit'] : 20;

  const start0 = assertNumber(baseStart, 'start');
  const limit = assertNumber(baseLimit, 'limit');

  const pages: FetchResult['pages'] = [];
  let allQuestions: unknown[] = [];

  // Create output directory if in split mode
  if (options.splitOutput) {
    try {
        await fs.mkdir(outputAbsolute, { recursive: true });
    } catch {
        // ignore if exists
    }
  }

  for (let pageIndex = 0; pageIndex < options.maxPages; pageIndex++) {
    if (pageIndex > 0 && options.delay && options.delay > 0) {
      console.log(`Waiting ${options.delay}ms...`);
      await sleep(options.delay);
    }

    const start = start0 + pageIndex * limit;
    payload['start'] = start;
    payload['limit'] = limit;

    setTarget(payload, start, options.targetOffset);
    const requestId = String(Date.now());

    setRequestIds(payload, requestId);
    const request = buildRequest(template, payload, requestId);

    const response = await fetch(template.url, request);
    const responseText = await response.text();
    const responseJson = safeJsonParse(responseText);
    if (!response.ok) {
      const suffix = responseText.length > 800 ? `${responseText.slice(0, 800)}...` : responseText;
      throw new Error(`Request failed: ${response.status} ${response.statusText}\n${suffix}`);
    }

    const questionsArray = responseJson ? pickQuestionsArray(responseJson) : null;
    const itemCount = questionsArray ? questionsArray.length : null;

    pages.push({
      start,
      limit,
      targetQuestionId: start + options.targetOffset,
      requestId,
      itemCount,
    });

    if (!questionsArray) {
      throw new Error('Failed to locate questions array in response; cannot continue');
    }

    if (questionsArray.length === 0) break;

    if (options.splitOutput) {
        const pageResult: FetchResult = {
            template: {
                url: template.url,
                headers: Object.fromEntries(Object.entries(template.headers).filter(([k]) => k !== 'cookie')),
                hasCookie: Boolean(template.cookie),
            },
            request: safeExtractRequestSummary(payload),
            pages: [{
                start,
                limit,
                targetQuestionId: start + options.targetOffset,
                requestId,
                itemCount,
            }],
            questions: dedupeQuestions(questionsArray),
        };
        const pageFile = path.join(outputAbsolute, `${pageIndex + 1}.json`);
        await fs.writeFile(pageFile, JSON.stringify(pageResult, null, 2), 'utf-8');
        console.log(`Saved page ${pageIndex + 1} to ${pageFile}`);
    } else {
        pages.push({
            start,
            limit,
            targetQuestionId: start + options.targetOffset,
            requestId,
            itemCount,
        });
        allQuestions = allQuestions.concat(questionsArray);
    }
  }

  if (!options.splitOutput) {
      const result: FetchResult = {
        template: {
          url: template.url,
          headers: Object.fromEntries(Object.entries(template.headers).filter(([k]) => k !== 'cookie')),
          hasCookie: Boolean(template.cookie),
        },
        request: safeExtractRequestSummary(payload),
        pages,
        questions: dedupeQuestions(allQuestions),
      };

      await fs.writeFile(outputAbsolute, JSON.stringify(result, null, 2), 'utf-8');
  }
}
