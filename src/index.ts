import { Command } from 'commander';
import { localizeImagesInJsonFile, prettifyJsonFile } from './modules/utils/prettifier.js';
import { fetchAllQuestionsFromCurlScript } from './modules/fetch/fetcher.js';
import { mergeQuestionsFromDir } from './modules/merge/merger.js';
import { resolveDataPath } from './modules/utils/path-helper.js';
import { extractPdfImagesIntoQuestions, parsePdfQuestions } from './modules/pdf/pdf-parser.js';

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
  .command('localize-images')
  .description('Download remote images and rewrite image src to local')
  .requiredOption('-i, --input <file>', 'Input JSON file path')
  .option('-o, --output <file>', 'Output JSON file path (default: overwrite input)')
  .action(async (options) => {
    try {
      const resolvedInput = resolveDataPath(options.input);
      if (options.output) {
        await localizeImagesInJsonFile({
          inputPath: resolvedInput,
          outputPath: resolveDataPath(options.output),
        });
      } else {
        await localizeImagesInJsonFile({
          inputPath: resolvedInput,
        });
      }
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

program
  .command('extract-pdf-images')
  .description('Extract PDF images and inject references into question content')
  .requiredOption('-p, --pdf <file>', 'Input PDF file path')
  .requiredOption('-j, --json <file>', 'Input JSON file path')
  .requiredOption('-o, --output <file>', 'Output JSON file path')
  .option('--min-width <number>', 'Minimum image width', (v) => Number(v), 80)
  .option('--min-height <number>', 'Minimum image height', (v) => Number(v), 80)
  .action(async (options) => {
    try {
      await extractPdfImagesIntoQuestions({
        pdfPath: resolveDataPath(options.pdf),
        inputJsonPath: resolveDataPath(options.json),
        outputJsonPath: resolveDataPath(options.output),
        minWidth: options.minWidth,
        minHeight: options.minHeight,
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
