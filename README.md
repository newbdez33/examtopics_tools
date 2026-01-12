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
- `src/modules/utils/prettifier.ts`: JSON formatting utility.

## Notes
- **Security**: The `curl_payload.sh` contains your session cookie. Keep it private.
- **Rate Limiting**: Always use `--delay` (e.g., 5000ms or 10000ms) to avoid being blocked by the server.
