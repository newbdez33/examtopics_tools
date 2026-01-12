import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

export type ParsedQuestion = {
  questionNo: number;
  text: string;
  options: string[];
  answer: string;
};

export async function parsePdfToQuestions(inputPath: string, outputPath: string): Promise<void> {
  const absoluteInput = path.resolve(inputPath);
  const absoluteOutput = path.resolve(outputPath);

  console.log(`Reading PDF from ${absoluteInput}...`);
  const dataBuffer = await fs.readFile(absoluteInput);
  const data = await pdf(dataBuffer);

  const text = data.text;
  
  // Save raw text for debugging if needed (optional, maybe controlled by a flag, but good for now)
  // await fs.writeFile(absoluteInput + '.txt', text, 'utf-8');

  const questions: ParsedQuestion[] = [];
  
  // Split by "Question #"
  // Example pattern: "Question #1"
  // We need to be careful not to split on "Question #1" inside text, but usually it's at start of line
  const questionBlocks = text.split(/Question #(\d+)/g);

  // split results in [preamble, "1", content, "2", content...]
  // So we iterate from index 1, taking 2 items at a time
  
  for (let i = 1; i < questionBlocks.length; i += 2) {
    const qNumStr = questionBlocks[i];
    const content = questionBlocks[i + 1];
    
    if (!qNumStr || !content) continue;

    const questionNo = parseInt(qNumStr, 10);
    
    // Parse content
    // content usually contains:
    // Topic 1
    // Actual text
    // A. Option A
    // B. Option B
    // ...
    // Correct Answer: A
    // Community vote distribution... (maybe)
    
    // 1. Extract Answer
    const answerMatch = content.match(/Correct Answer:\s*([A-Z]+)/);
    const answer = answerMatch ? answerMatch[1] : '';

    // 2. Extract Options
    // Heuristic: Options start with "A. ", "B. ", etc.
    // Usually "A." is the first one. We look for the FIRST occurrence of "A. " to split text and options.
    // We use a regex that matches "A. " at the start of a line or after a newline.
    
    const optionsStartIndex = content.search(/(^|\n)A\.\s/);
    
    let questionText = '';
    const options: string[] = [];

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
        
        // Add the prefix (e.g. "A. ") for clarity or just the text?
        // The previous output had "A. Text", so let's keep that format or just text?
        // Previous output: "A. Turn on..."
        // My logic above extracts "Turn on..." (without A.)
        // But the previous implementation included the letter in the substring because I sliced from match index.
        // Let's reconstruct it to be safe: Letter + ". " + content
        const letter = match[2];
        options.push(`${letter}. ${optionContent}`);
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
    
    // Clean up "VP\nC" type artifacts in text if possible?
    // If we split at "A.", "VP\nC" appearing before "A." will be part of text.
    // "500 G\nB. Each site..." appearing before "A." will be part of text.
    // This solves the issue of misinterpreting "B." or "C." in text as options, 
    // PROVIDED that "A." always starts the options list.

    questions.push({
      questionNo,
      text: questionText,
      options,
      answer
    });
  }

  console.log(`Parsed ${questions.length} questions.`);
  
  const result = {
    questions
  };

  await fs.writeFile(absoluteOutput, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`Saved JSON to ${absoluteOutput}`);
}
