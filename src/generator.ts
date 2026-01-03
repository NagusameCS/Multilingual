/**
 * i18n Generator - Creates and manages translation files
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    MultilingualConfig,
    ExtractedString,
    SupportedLanguage,
    GenerationResult,
    DEFAULT_CONFIG,
} from './types';
import { TranslationManager } from './translation';

interface TranslationData {
    [key: string]: string | TranslationData;
}

export class I18nGenerator {
    private config: MultilingualConfig;
    private translationManager: TranslationManager;

    constructor(
        config: Partial<MultilingualConfig> = {},
        translationManager?: TranslationManager
    ) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.translationManager = translationManager || new TranslationManager(config);
    }

    /**
     * Generate i18n files from extracted strings
     */
    async generate(
        strings: ExtractedString[],
        onProgress?: (message: string, completed: number, total: number) => void
    ): Promise<GenerationResult> {
        const outputDir = path.resolve(this.config.projectRoot, this.config.outputDir);

        // Ensure output directory exists
        this.ensureDirectoryExists(outputDir);

        const outputFiles: string[] = [];
        let newKeys = 0;
        let removedKeys = 0;
        let unchangedKeys = 0;

        // Generate source language file first
        const sourceData = this.stringsToObject(strings);
        const sourceFile = this.getOutputFilePath(outputDir, this.config.sourceLanguage);

        // Check for existing translations
        const existingSource = this.loadExistingTranslations(sourceFile);
        const mergeResult = this.mergeTranslations(existingSource, sourceData);

        newKeys += mergeResult.newKeys;
        removedKeys += mergeResult.removedKeys;
        unchangedKeys += mergeResult.unchangedKeys;

        // Write source language file
        this.writeTranslationFile(sourceFile, mergeResult.data);
        outputFiles.push(sourceFile);

        onProgress?.('Generated source language file', 1, this.config.targetLanguages.length + 1);

        // Generate target language files
        for (let i = 0; i < this.config.targetLanguages.length; i++) {
            const targetLang = this.config.targetLanguages[i];
            const targetFile = this.getOutputFilePath(outputDir, targetLang);

            // Load existing translations for this language
            const existingTarget = this.loadExistingTranslations(targetFile);

            // Translate missing keys
            const translatedData = await this.translateMissingKeys(
                mergeResult.data,
                existingTarget,
                targetLang,
                (completed, total) => {
                    onProgress?.(
                        `Translating to ${targetLang}`,
                        i + 1 + (completed / total),
                        this.config.targetLanguages.length + 1
                    );
                }
            );

            // Write target language file
            this.writeTranslationFile(targetFile, translatedData);
            outputFiles.push(targetFile);

            onProgress?.(`Completed ${targetLang}`, i + 2, this.config.targetLanguages.length + 1);
        }

        // Generate index file if using JS/TS output
        if (this.config.outputFormat === 'js' || this.config.outputFormat === 'ts') {
            const indexFile = this.generateIndexFile(outputDir);
            outputFiles.push(indexFile);
        }

        // Generate TypeScript type definitions
        if (this.config.outputFormat === 'ts' || this.config.outputFormat === 'json') {
            const typesFile = this.generateTypeDefinitions(outputDir, sourceData);
            outputFiles.push(typesFile);
        }

        return {
            success: true,
            outputFiles,
            stats: {
                totalKeys: Object.keys(this.flattenObject(sourceData)).length,
                newKeys,
                removedKeys,
                unchangedKeys,
            },
        };
    }

    /**
     * Convert extracted strings to translation object
     */
    private stringsToObject(strings: ExtractedString[]): TranslationData {
        const data: TranslationData = {};

        for (const str of strings) {
            if (this.config.keyStyle === 'flat' || this.config.flatKeys) {
                data[str.key] = str.value;
            } else {
                // Use nested structure based on file path
                const parts = this.getKeyParts(str);
                this.setNestedValue(data, parts, str.value);
            }
        }

        // Sort keys if configured
        if (this.config.sortKeys) {
            return this.sortObjectKeys(data);
        }

        return data;
    }

    /**
     * Get key parts for nested structure
     */
    private getKeyParts(str: ExtractedString): string[] {
        // Create namespace from file path
        const filePath = str.file.replace(/\\/g, '/');
        const parts = filePath.split('/');

        // Remove file extension from last part
        const fileName = parts[parts.length - 1];
        parts[parts.length - 1] = fileName.replace(/\.[^.]+$/, '');

        // Add the actual key
        parts.push(str.key);

        // Clean up parts
        return parts
            .filter(p => p && !['src', 'app', 'components', 'pages', 'views'].includes(p))
            .map(p => p.replace(/[^a-zA-Z0-9]/g, '_'));
    }

    /**
     * Set a nested value in an object
     */
    private setNestedValue(obj: TranslationData, keys: string[], value: string): void {
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!current[key] || typeof current[key] === 'string') {
                current[key] = {};
            }
            current = current[key] as TranslationData;
        }

        current[keys[keys.length - 1]] = value;
    }

    /**
     * Flatten a nested object
     */
    private flattenObject(obj: TranslationData, prefix = ''): Record<string, string> {
        const result: Record<string, string> = {};

        for (const [key, value] of Object.entries(obj)) {
            const newKey = prefix ? `${prefix}.${key}` : key;

            if (typeof value === 'string') {
                result[newKey] = value;
            } else {
                Object.assign(result, this.flattenObject(value, newKey));
            }
        }

        return result;
    }

    /**
     * Unflatten a flat object to nested
     */
    private unflattenObject(obj: Record<string, string>): TranslationData {
        const result: TranslationData = {};

        for (const [key, value] of Object.entries(obj)) {
            const keys = key.split('.');
            this.setNestedValue(result, keys, value);
        }

        return result;
    }

    /**
     * Sort object keys recursively
     */
    private sortObjectKeys(obj: TranslationData): TranslationData {
        const sorted: TranslationData = {};
        const keys = Object.keys(obj).sort();

        for (const key of keys) {
            const value = obj[key];
            if (typeof value === 'string') {
                sorted[key] = value;
            } else {
                sorted[key] = this.sortObjectKeys(value);
            }
        }

        return sorted;
    }

    /**
     * Merge new translations with existing ones
     */
    private mergeTranslations(
        existing: TranslationData,
        newData: TranslationData
    ): { data: TranslationData; newKeys: number; removedKeys: number; unchangedKeys: number } {
        const flatExisting = this.flattenObject(existing);
        const flatNew = this.flattenObject(newData);

        let newKeys = 0;
        let removedKeys = 0;
        let unchangedKeys = 0;

        const merged: Record<string, string> = {};

        // Add all new keys
        for (const [key, value] of Object.entries(flatNew)) {
            if (flatExisting[key]) {
                if (this.config.preserveExisting) {
                    merged[key] = flatExisting[key];
                } else {
                    merged[key] = value;
                }
                unchangedKeys++;
            } else {
                merged[key] = value;
                newKeys++;
            }
        }

        // Count removed keys
        for (const key of Object.keys(flatExisting)) {
            if (!flatNew[key]) {
                removedKeys++;
                // Optionally preserve removed keys
                if (this.config.preserveExisting) {
                    merged[key] = flatExisting[key];
                }
            }
        }

        const data = this.config.flatKeys ? merged : this.unflattenObject(merged);

        return {
            data: this.config.sortKeys ? this.sortObjectKeys(data) : data,
            newKeys,
            removedKeys,
            unchangedKeys,
        };
    }

    /**
     * Translate missing keys
     */
    private async translateMissingKeys(
        sourceData: TranslationData,
        existingTarget: TranslationData,
        targetLang: SupportedLanguage,
        onProgress?: (completed: number, total: number) => void
    ): Promise<TranslationData> {
        const flatSource = this.flattenObject(sourceData);
        const flatTarget = this.flattenObject(existingTarget);
        const result: Record<string, string> = { ...flatTarget };

        // Find keys that need translation
        const keysToTranslate: { key: string; value: string }[] = [];

        for (const [key, value] of Object.entries(flatSource)) {
            if (!flatTarget[key] || flatTarget[key] === value) {
                keysToTranslate.push({ key, value });
            }
        }

        if (keysToTranslate.length === 0) {
            return existingTarget;
        }

        // Batch translate
        if (this.config.translationService !== 'none') {
            const textsToTranslate = keysToTranslate.map(k => k.value);
            const translations = await this.translationManager.translateBatch(
                textsToTranslate,
                targetLang,
                this.config.sourceLanguage,
                onProgress
            );

            // Apply translations
            for (const { key, value } of keysToTranslate) {
                const translation = translations.get(value);
                if (translation?.success && translation.text) {
                    result[key] = translation.text;
                } else {
                    // Keep source value if translation failed
                    result[key] = value;
                }
            }
        } else {
            // No translation service, just copy source values
            for (const { key, value } of keysToTranslate) {
                result[key] = value;
            }
        }

        const data = this.config.flatKeys ? result : this.unflattenObject(result);
        return this.config.sortKeys ? this.sortObjectKeys(data) : data;
    }

    /**
     * Load existing translations from file
     */
    private loadExistingTranslations(filePath: string): TranslationData {
        try {
            if (!fs.existsSync(filePath)) {
                return {};
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const ext = path.extname(filePath).toLowerCase();

            switch (ext) {
                case '.json':
                    return JSON.parse(content);
                case '.js':
                case '.ts':
                    // Try to extract object from export
                    const match = content.match(/export\s+(default\s+)?(\{[\s\S]*\})/);
                    if (match) {
                        return JSON.parse(match[2].replace(/'/g, '"'));
                    }
                    return {};
                default:
                    return {};
            }
        } catch (error) {
            console.error(`Error loading translations from ${filePath}:`, error);
            return {};
        }
    }

    /**
     * Write translation file
     */
    private writeTranslationFile(filePath: string, data: TranslationData): void {
        const ext = this.config.outputFormat;
        let content: string;

        switch (ext) {
            case 'json':
                content = JSON.stringify(data, null, 2);
                break;
            case 'js':
                content = `// Auto-generated by multilingual-auto-i18n\nexport default ${JSON.stringify(data, null, 2)};\n`;
                break;
            case 'ts':
                content = `// Auto-generated by multilingual-auto-i18n\nexport default ${JSON.stringify(data, null, 2)} as const;\n`;
                break;
            default:
                content = JSON.stringify(data, null, 2);
        }

        fs.writeFileSync(filePath, content, 'utf-8');
    }

    /**
     * Get output file path for a language
     */
    private getOutputFilePath(outputDir: string, language: SupportedLanguage): string {
        const ext = this.config.outputFormat === 'yaml' ? 'yml' : this.config.outputFormat;
        return path.join(outputDir, `${language}.${ext}`);
    }

    /**
     * Generate index file for JS/TS exports
     */
    private generateIndexFile(outputDir: string): string {
        const ext = this.config.outputFormat;
        const indexPath = path.join(outputDir, `index.${ext}`);

        const allLanguages = [this.config.sourceLanguage, ...this.config.targetLanguages];

        let content = '// Auto-generated by multilingual-auto-i18n\n\n';

        // Import all language files
        for (const lang of allLanguages) {
            content += `import ${lang.replace('-', '_')} from './${lang}';\n`;
        }

        content += '\n';

        // Export object
        content += 'export const translations = {\n';
        for (const lang of allLanguages) {
            content += `  '${lang}': ${lang.replace('-', '_')},\n`;
        }
        content += '};\n\n';

        // Export individual languages
        content += 'export {\n';
        for (const lang of allLanguages) {
            content += `  ${lang.replace('-', '_')},\n`;
        }
        content += '};\n\n';

        // Export type for available languages
        if (ext === 'ts') {
            content += `export type AvailableLanguage = ${allLanguages.map(l => `'${l}'`).join(' | ')};\n`;
            content += `export const availableLanguages: AvailableLanguage[] = [${allLanguages.map(l => `'${l}'`).join(', ')}];\n`;
        } else {
            content += `export const availableLanguages = [${allLanguages.map(l => `'${l}'`).join(', ')}];\n`;
        }

        content += '\nexport default translations;\n';

        fs.writeFileSync(indexPath, content, 'utf-8');
        return indexPath;
    }

    /**
     * Generate TypeScript type definitions
     */
    private generateTypeDefinitions(outputDir: string, sourceData: TranslationData): string {
        const typesPath = path.join(outputDir, 'types.d.ts');

        const flatKeys = Object.keys(this.flattenObject(sourceData));

        let content = '// Auto-generated by multilingual-auto-i18n\n\n';
        content += '// Translation key type - all valid translation keys\n';
        content += `export type TranslationKey = ${flatKeys.map(k => `'${k}'`).join(' | ') || 'string'};\n\n`;

        content += '// Available languages\n';
        const allLanguages = [this.config.sourceLanguage, ...this.config.targetLanguages];
        content += `export type AvailableLanguage = ${allLanguages.map(l => `'${l}'`).join(' | ')};\n\n`;

        content += '// Translation function type\n';
        content += 'export type TranslateFunction = (key: TranslationKey, params?: Record<string, string | number>) => string;\n\n';

        content += '// Translation record type\n';
        content += 'export type TranslationRecord = Record<TranslationKey, string>;\n\n';

        content += '// Translations object type\n';
        content += 'export type Translations = Record<AvailableLanguage, TranslationRecord>;\n';

        fs.writeFileSync(typesPath, content, 'utf-8');
        return typesPath;
    }

    /**
     * Ensure a directory exists
     */
    private ensureDirectoryExists(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * Clean output directory
     */
    cleanOutputDirectory(): void {
        const outputDir = path.resolve(this.config.projectRoot, this.config.outputDir);

        if (fs.existsSync(outputDir)) {
            const files = fs.readdirSync(outputDir);
            for (const file of files) {
                const filePath = path.join(outputDir, file);
                if (fs.statSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                }
            }
        }
    }
}
