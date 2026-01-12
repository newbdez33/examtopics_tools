import { Command } from 'commander';
import { prettifyJsonFile } from './modules/utils/prettifier.js';
import { fetchAllQuestionsFromCurlScript } from './modules/fetch/fetcher.js';
import { mergeQuestionsFromDir } from './modules/merge/merger.js';
import { resolveDataPath } from './modules/utils/path-helper.js';
import { parsePdfQuestions } from './modules/pdf/pdf-parser.js';

const program = new Command();

program
  .name('examtopics-tools')
  .description('CLI tools for ExamTopics')
  .version('1.0.0');

program
  .command('prettify')
  .description('Prettify a JSON file')
  .argument('<file>', 'Path to the JSON file')
  .option('-s, --suffix <string>', 'Suffix to append to the output filename', '_pretty')
  .action(async (file, options) => {
    try {
      await prettifyJsonFile(resolveDataPath(file), options.suffix);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('fetch-questions')
  .description('Fetch all exam questions using a captured curl script')
  .requiredOption('-i, --input <file>', 'Path to curl_payload.sh')
  .requiredOption('-o, --output <file>', 'Output JSON file path')
  .option('--start <number>', 'Start offset (overrides curl payload)', (v) => Number(v))
  .option('--limit <number>', 'Page size (overrides curl payload)', (v) => Number(v))
  .option('--max-pages <number>', 'Max pages to fetch', (v) => Number(v), 200)
  .option('--target-offset <number>', 'targetQuestionId = start + targetOffset', (v) => Number(v), 0)
  .option('--delay <number>', 'Delay between requests in ms', (v) => Number(v), 0)
  .option('--split', 'Split output into separate files per page (output path becomes directory)', false)
  .action(async (options) => {
    try {
      await fetchAllQuestionsFromCurlScript({
        inputPath: resolveDataPath(options.input),
        outputPath: resolveDataPath(options.output),
        start: options.start,
        limit: options.limit,
        maxPages: options.maxPages,
        targetOffset: options.targetOffset,
        delay: options.delay,
        splitOutput: options.split,
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('merge-questions')
  .description('Merge all JSON files from a directory into a single file')
  .requiredOption('-i, --input <dir>', 'Directory containing JSON files')
  .requiredOption('-o, --output <file>', 'Output merged JSON file path')
  .action(async (options) => {
    try {
      await mergeQuestionsFromDir({
        inputDir: resolveDataPath(options.input),
        outputFile: resolveDataPath(options.output),
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('parse-pdf')
  .description('Parse questions from a PDF file')
  .requiredOption('-i, --input <file>', 'Input PDF file path')
  .requiredOption('-o, --output <file>', 'Output JSON file path')
  .action(async (options) => {
    try {
      await parsePdfQuestions({
        inputPath: resolveDataPath(options.input),
        outputPath: resolveDataPath(options.output),
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
