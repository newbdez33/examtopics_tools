import fs from 'fs/promises';
import path from 'path';

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
