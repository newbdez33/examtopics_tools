import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

export type ParsedQuestion = {
  questionId: number;
  question: string;
  options: string[];
  answer: string;
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
    // Heuristic: Options start with "A. ", "B. ", etc.
    // Usually "A." is the first one. We look for the FIRST occurrence of "A. " to split text and options.
    // We use a regex that matches "A. " at the start of a line or after a newline.
    
    const optionsStartIndex = content.search(/(^|\n)A\.\s/);
    
    let questionText = '';
    const questionOptions: string[] = [];

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
        questionOptions.push(`${letter}. ${optionContent}`);
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
    
    questions.push({
      questionId,
      question: questionText,
      options: questionOptions,
      answer
    });
  }

  const result = {
    questions
  };

  await fs.writeFile(outputAbsolute, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`Saved JSON to ${outputAbsolute}`);
  console.log(`Parsed ${questions.length} questions.`);
}
