# Question Object JSON Structure

The standard JSON format for a question object used in this project (matching `saa.json` / `sap.json` schema).

```json
{
  "id": "245f0fc61331404e9b8ee1edc2b1cd4b",
  "questionNumber": 1,
  "type": "single",
  "content": "<p>Question #1</p><p>Question text content...</p>",
  "options": [
    {
      "label": "A",
      "content": "Option A text..."
    },
    {
      "label": "B",
      "content": "Option B text..."
    }
  ],
  "correctAnswer": "A",
  "explanation": "<p>Explanation text...</p>",
  "subQuestions": null,
  "caseId": null,
  "caseOrder": null,
  "case": null,
  "caseContent": null,
  "bookmarked": false,
  "hasNote": false
}
```

## Fields

- **id** (`string`): Unique identifier (UUID).
- **questionNumber** (`number`): The question number (e.g., 1, 2, 3).
- **type** (`string`): Question type (e.g., "single", "multiple").
- **content** (`string`): The question text, formatted as HTML (e.g., wrapped in `<p>` tags).
- **options** (`Array<{ label: string, content: string }>`): List of answer options.
  - `label`: The option letter (e.g., "A").
  - `content`: The option text.
- **correctAnswer** (`string`): The correct answer key (e.g., "A" or "AD").
- **explanation** (`string` | `null`): Explanation for the answer (HTML).
- **subQuestions**, **caseId**, **caseOrder**, **case**, **caseContent**: Related to case studies or sub-questions (usually null).
- **bookmarked** (`boolean`): UI state flag.
- **hasNote** (`boolean`): UI state flag.
