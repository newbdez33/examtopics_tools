# Question Object JSON Structure

The standard JSON format for a question object used in this project.

```json
{
  "questionId": 1,
  "question": "The question text content...",
  "options": [
    "A. Option A text...",
    "B. Option B text..."
  ],
  "answer": "A"
}
```

## Fields

- **questionId** (`number`): Unique identifier for the question (within the context of the exam/source).
- **question** (`string`): The main text of the question.
- **options** (`string[]`): An array of possible answer options, typically prefixed with "A.", "B.", etc.
- **answer** (`string`): The correct answer key (e.g., "A", "B", "AD").
