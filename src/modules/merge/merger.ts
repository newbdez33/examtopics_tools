import fs from 'fs/promises';
import path from 'path';

type MergeOptions = {
  inputDir: string;
  outputFile: string;
};

// Re-using the logic from questions-fetcher.ts but keeping it self-contained here
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
          : typeof rec['id'] === 'string'
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

export async function mergeQuestionsFromDir(options: MergeOptions): Promise<void> {
  const inputDir = path.resolve(options.inputDir);
  const outputFile = path.resolve(options.outputFile);

  const files = await fs.readdir(inputDir);
  // Filter for .json files
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  // Sort numerically if possible (1.json, 2.json, 10.json)
  jsonFiles.sort((a, b) => {
    const na = parseInt(path.parse(a).name, 10);
    const nb = parseInt(path.parse(b).name, 10);
    if (!isNaN(na) && !isNaN(nb)) {
      return na - nb;
    }
    return a.localeCompare(b);
  });

  let allQuestions: unknown[] = [];
  let baseTemplate: unknown = null;
  let baseRequest: unknown = null;

  console.log(`Found ${jsonFiles.length} JSON files in ${inputDir}`);

  for (const file of jsonFiles) {
    const filePath = path.join(inputDir, file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      if (!data || typeof data !== 'object') continue;

      // Capture template/request from the first valid file
      if (!baseTemplate && data.template) baseTemplate = data.template;
      if (!baseRequest && data.request) baseRequest = data.request;

      if (Array.isArray(data.questions)) {
        allQuestions = allQuestions.concat(data.questions);
      }
    } catch (err) {
      console.warn(`Skipping invalid file ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }

  const deduped = dedupeQuestions(allQuestions);
  console.log(`Merged ${allQuestions.length} questions into ${deduped.length} unique questions.`);

  const result = {
    questions: deduped
  };

  await fs.writeFile(outputFile, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`Saved merged output to ${outputFile}`);
}
