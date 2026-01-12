import path from 'path';

/**
 * Resolves a file path relative to the 'data' directory.
 * If the path is already absolute, it is returned as is.
 * If the path starts with 'data' component, it is resolved relative to CWD.
 * Otherwise, it is resolved relative to the 'data' subdirectory of CWD.
 */
export function resolveDataPath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
        return filePath;
    }

    const parts = filePath.split(/[\\/]/);
    if (parts[0] === 'data') {
        return path.resolve(process.cwd(), filePath);
    }

    return path.resolve(process.cwd(), 'data', filePath);
}
