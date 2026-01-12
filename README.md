# ExamTopics Tools

A toolkit for fetching, processing, and merging exam questions from ExamTopics.

## Installation

```bash
pnpm install
pnpm build
```

## Features

- **Fetch Questions**: Replay captured curl requests to fetch questions with pagination support.
- **Split Output**: Save each page as a separate file to handle large datasets and resume interruptions.
- **Merge**: Combine multiple page files into a single, clean JSON dataset.
- **Deduplication**: Automatically removes duplicate questions during merging.
- **Parse PDF**: Parse questions from ExamTopics PDF dumps into JSON.
- **Extract PDF Images**: Extract screenshots/figures from PDFs and insert `<img>` references into question content.
- **Localize Remote Images**: Download remote `<img src="https://...">` to local `images/<exam>/` and rewrite JSON to use relative paths.

## Usage

### 1. Fetch Questions (`fetch-questions`)

This command parses a `curl` script (captured from browser network tab) and executes it repeatedly with modified parameters (start, limit, requestId) to fetch all questions.

**Prerequisites:**
1. Log in to ExamTopics in your browser.
2. Open Developer Tools (F12) -> Network tab.
3. Navigate to the questions page or click "Next".
4. Find the XHR request to `.../api/exams/questions`.
5. Right-click -> Copy -> Copy as cURL (bash).
6. Save the content to a file (e.g., `curl_payload.sh`).

**Basic Command:**
```bash
pnpm start -- fetch-questions -i curl_payload.sh -o output.json
```

**Advanced Usage (Recommended):**
Use split output mode (`--split`) and delay (`--delay`) to safely fetch large exams without rate limiting or memory issues.

```bash
# Fetch to directory "saa/"
# Start from offset 0, 100 questions per page, 10s delay between requests
pnpm start -- fetch-questions -i curl_payload.sh -o saa --split --start 0 --limit 100 --delay 10000
```

**Options:**
- `-i, --input <file>`: Path to curl script (Required).
- `-o, --output <path>`: Output file path (or directory if `--split` is used) (Required).
- `--split`: Save each page as a separate JSON file (e.g., `1.json`, `2.json`) in the output directory.
- `--start <number>`: Starting offset (default: from curl payload).
- `--limit <number>`: Questions per page (default: from curl payload).
- `--delay <number>`: Delay in milliseconds between requests (default: 0).
- `--max-pages <number>`: Safety cap on number of pages to fetch (default: 200).

### 2. Merge Questions (`merge-questions`)

Merges all JSON files from a directory into a single JSON file. This is typically used after a split fetch.

```bash
pnpm start -- merge-questions -i saa -o saa.json
```

**What it does:**
- Reads all `.json` files in the input directory.
- Sorts them numerically (1.json, 2.json, ...).
- Dedupes questions based on `questionId` or `id`.
- Outputs a clean JSON file with the structure:
  ```json
  {
    "questions": [ ... ]
  }
  ```

### 3. Prettify JSON (`prettify`)

Formats a JSON file with 2-space indentation.

```bash
pnpm start -- prettify saa.json
```

### 4. Parse Questions from PDF (`parse-pdf`)

If you have an ExamTopics PDF (for example, CloudOps SOA-C03 without discussion), you can parse questions into the internal JSON format:

```bash
pnpm start -- parse-pdf \
  -i "data/AWS Certified CloudOps Engineer - Associate SOA-C03_without_discussion.pdf" \
  -o data/SOA-C03_tmp.json
```

This generates a file shaped like:

```json
{
  "questions": [
    {
      "id": "uuid",
      "questionNumber": 1,
      "type": "single",
      "content": "<p>...</p>",
      "options": [...],
      "correctAnswer": "A",
      "explanation": "",
      "subQuestions": null,
      "caseId": null,
      "caseOrder": null,
      "case": null,
      "caseContent": null,
      "bookmarked": false,
      "hasNote": false
    }
  ]
}
```

Notes:
- Only question stem, options, and correct answer are extracted.
- Explanations are left empty for now.

### 5. Extract PDF Images into Question Content (`extract-pdf-images`)

For exams where the PDF contains diagrams or JSON snippets as images, you can extract those images and insert `<img>` tags into the question content.

Example (SOA-C03):

```bash
pnpm start -- extract-pdf-images \
  -p "data/AWS Certified CloudOps Engineer - Associate SOA-C03_without_discussion.pdf" \
  -j data/SOA-C03_tmp.json \
  -o data/SOA-C03.json \
  --min-width 80 \
  --min-height 80
```

What this does:
- Scans each PDF page with `pdfjs-dist`.
- Groups text lines on the page, finds `Question #N` anchors.
- For each question region, interleaves text paragraphs and images according to their vertical position:
  - The stem is rebuilt as a sequence of `<p>text</p>` and `<p><img .../></p>` blocks.
  - Example result for Question #1:
    ```html
    <p>A CloudOps engineer is examining the following AWS CloudFormation template:</p>
    <p><img src="images/SOA-C03/q1_p1_1.png" alt="Question 1 image 1" /></p>
    <p>Why will the stack creation fail?</p>
    ```
- Saves images to:
  - `data/images/SOA-C03/`
  - Filenames: `q<questionNumber>_p<pageIndex>_<index>.png`
- Updates `data/SOA-C03.json` question content to reference those images with relative paths: `images/SOA-C03/...`.

Options:
- `-p, --pdf <file>`: Input PDF file path.
- `-j, --json <file>`: Input JSON (from `parse-pdf`).
- `-o, --output <file>`: Output JSON with updated `content`.
- `--min-width <number>` / `--min-height <number>`: Ignore very small images (noise).

Notes:
- This flow does **not** use OCR; it only extracts raw images and uses PDF text layout to approximate positions.
- If you want to re-run with improved positioning logic, regenerate the `*_tmp.json` with `parse-pdf` and then run `extract-pdf-images` again.

### 6. Localize Remote Images in JSON (`localize-images`)

Some merged JSON files (for example `saa.json` / `sap.json`) contain remote images in explanations or question content:

```html
<img src="https://up.zaixiankaoshi.com/5240831/question/....png" />
```

To download these images and convert them to local relative paths:

```bash
pnpm start -- localize-images -i data/saa.json
pnpm start -- localize-images -i data/sap.json
```

What this does:
- Scans all string fields in the JSON for `<img src="...">` tags.
- For each remote or `data:image/...` src:
  - Downloads the image.
  - Saves it under:
    - `data/images/saa/<sha1>.png` for `saa.json`
    - `data/images/sap/<sha1>.png` for `sap.json`
  - Rewrites the HTML to use relative paths, for example:
    ```html
    <img src="images/saa/a7dce5f3afe1412c097756f9a0e5beb756846e47.png" ... />
    ```
- De-duplicates downloads by URL (same URL → same local file).

The command overwrites the input file by default:
- `-i, --input <file>`: Input JSON file.
- `-o, --output <file>`: Optional; if provided, writes to a separate output file instead.

## API & Implementation Details

### How Fetching Works
The tool emulates the browser session using the cookies from your captured curl script. It iterates through pages by updating the `start` parameter:
`start = initial_start + (page_index * limit)`

It also regenerates the `requestId` and `x-request-id` headers for each request to mimic legitimate traffic.

### File Structure
- `src/index.ts`: CLI entry point using `commander`.
- `src/modules/fetch/curl-parser.ts`: Parses curl commands to extract URL, headers, and body.
- `src/modules/fetch/fetcher.ts`: Handles the pagination loop, API requests, and response parsing.
- `src/modules/merge/merger.ts`: Handles reading directory files, merging, and deduplication.
- `src/modules/pdf/pdf-parser.ts`:
  - `parsePdfQuestions`: Extracts questions from PDFs into JSON (without images).
  - `extractPdfImagesIntoQuestions`: Extracts images from PDFs and rebuilds question content with `<img>` blocks in reading order.
- `src/modules/utils/prettifier.ts`:
  - `prettifyJsonFile`: JSON formatting utility.
  - `localizeImagesInJsonFile`: Downloads remote images used in HTML fields and rewrites to local `images/<exam>/` paths.

## Notes
- **Security**: The `curl_payload.sh` contains your session cookie. Keep it private.
- **Rate Limiting**: Always use `--delay` (e.g., 5000ms or 10000ms) to avoid being blocked by the server.
- **Images & OCR**:
  - PDF images are extracted as-is and referenced with `<img>` tags.
  - OCR (Tesseract, `eng.traineddata`, etc.) has been removed from the toolchain to keep the pipeline simple and deterministic.
