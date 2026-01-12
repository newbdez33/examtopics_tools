export type CurlRequestTemplate = {
  url: string;
  headers: Record<string, string>;
  cookie?: string;
  bodyText?: string;
};

function unquoteSingleQuoted(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseHeaderLine(raw: string): { key: string; value: string } | null {
  const idx = raw.indexOf(':');
  if (idx <= 0) return null;
  const key = raw.slice(0, idx).trim().toLowerCase();
  const value = raw.slice(idx + 1).trim();
  if (!key) return null;
  return { key, value };
}

export function parseFirstCurlRequestFromScript(scriptText: string): CurlRequestTemplate {
  const curlIndex = scriptText.indexOf('curl ');
  if (curlIndex < 0) {
    throw new Error('No curl command found in script');
  }

  const slice = scriptText.slice(curlIndex);
  const urlMatch = slice.match(/^curl\s+'([^']+)'/m);
  if (!urlMatch?.[1]) {
    throw new Error('Failed to parse curl URL');
  }

  const headers: Record<string, string> = {};
  const headerRegex = /-H\s+'([^']+)'/g;
  for (const match of slice.matchAll(headerRegex)) {
    const raw = match[1];
    if (!raw) continue;
    const parsed = parseHeaderLine(raw);
    if (!parsed) continue;
    headers[parsed.key] = parsed.value;
  }

  const cookieMatch = slice.match(/-b\s+'([^']*)'/m);
  const cookie = cookieMatch?.[1] ? unquoteSingleQuoted(`'${cookieMatch[1]}'`) : undefined;

  const dataMatch =
    slice.match(/--data-raw\s+'([^']*)'/m) ??
    slice.match(/--data\s+'([^']*)'/m) ??
    slice.match(/--data-binary\s+'([^']*)'/m);
  const bodyText = dataMatch?.[1] ? unquoteSingleQuoted(`'${dataMatch[1]}'`) : undefined;

  return {
    url: urlMatch[1],
    headers,
    ...(cookie ? { cookie } : {}),
    ...(bodyText ? { bodyText } : {}),
  };
}
