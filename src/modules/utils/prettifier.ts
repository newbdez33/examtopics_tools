import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

/**
 * Reads a JSON file and writes it back with pretty formatting (2 space indentation).
 * @param filePath Path to the JSON file
 * @param outputSuffix Suffix to append to the filename (default: "_pretty")
 */
export async function prettifyJsonFile(filePath: string, outputSuffix: string = '_pretty'): Promise<void> {
    try {
        const absolutePath = path.resolve(filePath);
        const parsedPath = path.parse(absolutePath);
        const newFileName = `${parsedPath.name}${outputSuffix}${parsedPath.ext}`;
        const outputPath = path.join(parsedPath.dir, newFileName);

        const data = await fs.readFile(absolutePath, 'utf-8');
        
        // Parse to ensure it's valid JSON
        const json = JSON.parse(data);
        
        // Stringify with indentation
        const prettyJson = JSON.stringify(json, null, 2);
        
        // Write to new file
        await fs.writeFile(outputPath, prettyJson, 'utf-8');
        
        console.log(`Successfully prettified: ${absolutePath} -> ${outputPath}`);
    } catch (error) {

        if (error instanceof Error) {
            throw new Error(`Failed to prettify JSON file: ${error.message}`);
        }
        throw error;
    }
}

export type LocalizeImagesOptions = {
    inputPath: string;
    outputPath?: string;
};

type DownloadedImage = {
    absolutePath: string;
    relativePath: string;
};

function toPosixPath(p: string): string {
    return p.split(path.sep).join(path.posix.sep);
}

function isHttpUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
}

function parseDataImage(dataUri: string): { mime: string; buffer: Buffer } | null {
    const match = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return null;
    const mime = match[1] ?? '';
    const b64 = match[2] ?? '';
    return { mime, buffer: Buffer.from(b64, 'base64') };
}

function extFromMime(mime: string): string {
    const m = mime.toLowerCase().trim();
    if (m === 'image/png') return 'png';
    if (m === 'image/jpeg') return 'jpg';
    if (m === 'image/jpg') return 'jpg';
    if (m === 'image/gif') return 'gif';
    if (m === 'image/webp') return 'webp';
    if (m === 'image/svg+xml') return 'svg';
    return 'bin';
}

function extFromUrl(url: string): string | null {
    try {
        const u = new URL(url);
        const pathname = u.pathname;
        const ext = path.extname(pathname).replace('.', '').toLowerCase();
        return ext || null;
    } catch {
        return null;
    }
}

async function ensureDownloadedImage(
    url: string,
    imagesDirAbsolute: string,
    imagesDirRelative: string,
    cache: Map<string, DownloadedImage>,
): Promise<DownloadedImage> {
    const cached = cache.get(url);
    if (cached) return cached;

    await fs.mkdir(imagesDirAbsolute, { recursive: true });
    const hash = createHash('sha1').update(url).digest('hex');

    let buffer: Buffer;
    let ext: string | null = null;

    if (url.startsWith('data:image/')) {
        const parsed = parseDataImage(url);
        if (!parsed) throw new Error(`Unsupported data image URI`);
        buffer = parsed.buffer;
        ext = extFromMime(parsed.mime);
    } else if (isHttpUrl(url)) {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to download ${url} (${res.status} ${res.statusText})`);
        }
        const arrayBuffer = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
        ext = extFromUrl(url);
        if (!ext) {
            const contentType = res.headers.get('content-type') ?? '';
            if (contentType.startsWith('image/')) ext = extFromMime(contentType.split(';')[0] ?? '');
        }
        if (!ext) ext = 'bin';
    } else {
        buffer = Buffer.alloc(0);
        ext = 'bin';
    }

    const fileName = `${hash}.${ext}`;
    const absolutePath = path.join(imagesDirAbsolute, fileName);
    const relativePath = toPosixPath(path.posix.join(imagesDirRelative, fileName));

    try {
        await fs.access(absolutePath);
    } catch {
        await fs.writeFile(absolutePath, buffer);
    }

    const downloaded = { absolutePath, relativePath };
    cache.set(url, downloaded);
    return downloaded;
}

function rewriteImagesInString(
    value: string,
    imagesDirAbsolute: string,
    imagesDirRelative: string,
    cache: Map<string, DownloadedImage>,
    enqueue: (task: Promise<void>) => void,
): string {
    const imgTagRegex = /<img\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/gi;
    let changed = false;

    const updated = value.replace(imgTagRegex, (tag: string, quote: string, src: string) => {
        if (!src) return tag;
        if (src.startsWith('images/')) return tag;
        if (!(isHttpUrl(src) || src.startsWith('data:image/'))) return tag;

        changed = true;
        enqueue(
            (async () => {
                const downloaded = await ensureDownloadedImage(src, imagesDirAbsolute, imagesDirRelative, cache);
                cache.set(src, downloaded);
            })(),
        );
        return tag;
    });

    if (!changed) return value;
    return updated;
}

function applyRewritesToString(value: string, cache: Map<string, DownloadedImage>): string {
    const imgSrcRegex = /(<img\b[^>]*\bsrc=)(["'])(.*?)(\2)([^>]*>)/gi;
    return value.replace(imgSrcRegex, (full: string, prefix: string, quote: string, src: string, q2: string, suffix: string) => {
        const replacement = cache.get(src);
        if (!replacement) return full;
        return `${prefix}${quote}${replacement.relativePath}${quote}${suffix}`;
    });
}

function walkAndRewrite(
    node: unknown,
    imagesDirAbsolute: string,
    imagesDirRelative: string,
    cache: Map<string, DownloadedImage>,
    enqueue: (task: Promise<void>) => void,
): void {
    if (typeof node === 'string') return;
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (const item of node) walkAndRewrite(item, imagesDirAbsolute, imagesDirRelative, cache, enqueue);
        return;
    }

    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
        const v = obj[key];
        if (typeof v === 'string') {
            obj[key] = rewriteImagesInString(v, imagesDirAbsolute, imagesDirRelative, cache, enqueue);
        } else {
            walkAndRewrite(v, imagesDirAbsolute, imagesDirRelative, cache, enqueue);
        }
    }
}

function walkAndApply(node: unknown, cache: Map<string, DownloadedImage>): void {
    if (typeof node === 'string') return;
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (const item of node) walkAndApply(item, cache);
        return;
    }

    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
        const v = obj[key];
        if (typeof v === 'string') {
            obj[key] = applyRewritesToString(v, cache);
        } else {
            walkAndApply(v, cache);
        }
    }
}

export async function localizeImagesInJsonFile(options: LocalizeImagesOptions): Promise<void> {
    const inputAbsolute = path.resolve(options.inputPath);
    const outputAbsolute = path.resolve(options.outputPath ?? options.inputPath);

    const raw = await fs.readFile(inputAbsolute, 'utf-8');
    const json = JSON.parse(raw) as unknown;

    const baseName = path.basename(outputAbsolute, path.extname(outputAbsolute));
    const outDir = path.dirname(outputAbsolute);
    const imagesDirAbsolute = path.join(outDir, 'images', baseName);
    const imagesDirRelative = path.posix.join('images', baseName);

    const cache = new Map<string, DownloadedImage>();
    const tasks: Promise<void>[] = [];
    const enqueue = (task: Promise<void>) => {
        tasks.push(task);
    };

    walkAndRewrite(json, imagesDirAbsolute, imagesDirRelative, cache, enqueue);
    await Promise.all(tasks);

    walkAndApply(json, cache);

    await fs.writeFile(outputAbsolute, JSON.stringify(json, null, 2), 'utf-8');
    console.log(`Saved JSON to ${outputAbsolute}`);
    console.log(`Downloaded images: ${cache.size}`);
}
