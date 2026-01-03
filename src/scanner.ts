/**
 * Content Scanner - Detects user-facing strings in source files
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import {
    MultilingualConfig,
    ExtractedString,
    ScanResult,
    DEFAULT_CONFIG
} from './types';

export class ContentScanner {
    private config: MultilingualConfig;
    private extractedStrings: ExtractedString[] = [];
    private processedFiles: string[] = [];

    constructor(config: Partial<MultilingualConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Scan the project for user-facing strings
     */
    async scan(): Promise<ScanResult> {
        this.extractedStrings = [];
        this.processedFiles = [];

        const files = await this.findFiles();

        for (const file of files) {
            await this.scanFile(file);
        }

        // Deduplicate strings
        this.extractedStrings = this.deduplicateStrings(this.extractedStrings);

        return {
            strings: this.extractedStrings,
            files: this.processedFiles,
            stats: this.generateStats(),
        };
    }

    /**
     * Find all files matching the configuration
     */
    private async findFiles(): Promise<string[]> {
        const allFiles: string[] = [];

        for (const pattern of this.config.include) {
            const matches = await glob(pattern, {
                cwd: this.config.projectRoot,
                ignore: this.config.exclude,
                absolute: true,
                nodir: true,
            });

            allFiles.push(...matches);
        }

        // Filter by file types
        return allFiles.filter(file =>
            this.config.fileTypes.some(ext => file.endsWith(ext))
        );
    }

    /**
     * Scan a single file for strings
     */
    private async scanFile(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const ext = path.extname(filePath).toLowerCase();

            this.processedFiles.push(filePath);

            switch (ext) {
                case '.js':
                case '.jsx':
                case '.ts':
                case '.tsx':
                    this.scanJavaScript(content, filePath);
                    break;
                case '.vue':
                    this.scanVue(content, filePath);
                    break;
                case '.svelte':
                    this.scanSvelte(content, filePath);
                    break;
                case '.html':
                case '.htm':
                    this.scanHTML(content, filePath);
                    break;
                case '.php':
                    this.scanPHP(content, filePath);
                    break;
                case '.py':
                    this.scanPython(content, filePath);
                    break;
                case '.rb':
                    this.scanRuby(content, filePath);
                    break;
                case '.go':
                    this.scanGo(content, filePath);
                    break;
                case '.java':
                    this.scanJava(content, filePath);
                    break;
                default:
                    // Generic string extraction
                    this.scanGeneric(content, filePath);
            }
        } catch (error) {
            console.error(`Error scanning file ${filePath}:`, error);
        }
    }

    /**
     * Scan JavaScript/TypeScript/JSX/TSX files
     */
    private scanJavaScript(content: string, filePath: string): void {
        const lines = content.split('\n');

        // Match string literals (single, double, and template)
        const patterns = [
            // Double-quoted strings
            /"([^"\\]*(\\.[^"\\]*)*)"/g,
            // Single-quoted strings
            /'([^'\\]*(\\.[^'\\]*)*)'/g,
            // Template literals (simple)
            /`([^`\\]*(\\.[^`\\]*)*)`/g,
        ];

        // JSX text content
        const jsxTextPattern = />([^<>{}`]+)</g;

        // Common i18n function patterns to avoid re-extracting
        const i18nPatterns = [
            /t\(['"`]([^'"`]+)['"`]\)/g,
            /i18n\.t\(['"`]([^'"`]+)['"`]\)/g,
            /\$t\(['"`]([^'"`]+)['"`]\)/g,
            /formatMessage\(\s*\{\s*id:\s*['"`]([^'"`]+)['"`]/g,
            /intl\.formatMessage/g,
        ];

        lines.forEach((line, lineIndex) => {
            // Skip comments
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
                return;
            }

            // Skip import/export statements
            if (line.includes('import ') || line.includes('export ') || line.includes('require(')) {
                return;
            }

            // Check if already using i18n
            for (const i18nPattern of i18nPatterns) {
                if (i18nPattern.test(line)) {
                    return;
                }
            }

            // Extract strings
            for (const pattern of patterns) {
                let match;
                const regex = new RegExp(pattern.source, pattern.flags);
                while ((match = regex.exec(line)) !== null) {
                    const value = match[1];
                    if (this.isValidString(value)) {
                        this.addString(value, filePath, lineIndex + 1, match.index, 'text');
                    }
                }
            }

            // Extract JSX text
            let jsxMatch;
            const jsxRegex = new RegExp(jsxTextPattern.source, jsxTextPattern.flags);
            while ((jsxMatch = jsxRegex.exec(line)) !== null) {
                const value = jsxMatch[1].trim();
                if (this.isValidString(value)) {
                    this.addString(value, filePath, lineIndex + 1, jsxMatch.index, 'jsx');
                }
            }
        });

        // Extract JSX attributes (title, placeholder, alt, aria-label, etc.)
        this.extractJSXAttributes(content, filePath);
    }

    /**
     * Extract strings from JSX attributes
     */
    private extractJSXAttributes(content: string, filePath: string): void {
        const attributePatterns = [
            /title=["']([^"']+)["']/g,
            /placeholder=["']([^"']+)["']/g,
            /alt=["']([^"']+)["']/g,
            /aria-label=["']([^"']+)["']/g,
            /aria-labelledby=["']([^"']+)["']/g,
            /aria-describedby=["']([^"']+)["']/g,
            /label=["']([^"']+)["']/g,
            /errorMessage=["']([^"']+)["']/g,
            /helperText=["']([^"']+)["']/g,
            /tooltip=["']([^"']+)["']/g,
            /description=["']([^"']+)["']/g,
        ];

        const lines = content.split('\n');

        for (const pattern of attributePatterns) {
            lines.forEach((line, lineIndex) => {
                let match;
                const regex = new RegExp(pattern.source, pattern.flags);
                while ((match = regex.exec(line)) !== null) {
                    const value = match[1];
                    if (this.isValidString(value)) {
                        this.addString(value, filePath, lineIndex + 1, match.index, 'attribute');
                    }
                }
            });
        }
    }

    /**
     * Scan Vue.js files
     */
    private scanVue(content: string, filePath: string): void {
        // Extract template section
        const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
        if (templateMatch) {
            this.scanHTML(templateMatch[1], filePath);
        }

        // Extract script section
        const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
        if (scriptMatch) {
            this.scanJavaScript(scriptMatch[1], filePath);
        }
    }

    /**
     * Scan Svelte files
     */
    private scanSvelte(content: string, filePath: string): void {
        // Extract script section
        const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
        if (scriptMatch) {
            this.scanJavaScript(scriptMatch[1], filePath);
        }

        // Rest is template-like
        let templateContent = content
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

        this.scanHTML(templateContent, filePath);
    }

    /**
     * Scan HTML files
     */
    private scanHTML(content: string, filePath: string): void {
        const lines = content.split('\n');

        // Text content between tags
        const textPattern = />([^<>{}]+)</g;

        // HTML attributes
        const attrPatterns = [
            /title="([^"]+)"/g,
            /title='([^']+)'/g,
            /placeholder="([^"]+)"/g,
            /placeholder='([^']+)'/g,
            /alt="([^"]+)"/g,
            /alt='([^']+)'/g,
            /aria-label="([^"]+)"/g,
            /aria-label='([^']+)'/g,
            /value="([^"]+)"/g,
            /content="([^"]+)"/g,
            /label="([^"]+)"/g,
        ];

        lines.forEach((line, lineIndex) => {
            // Skip style and script tags content
            if (/<style|<script/i.test(line)) {
                return;
            }

            // Extract text content
            let match;
            const regex = new RegExp(textPattern.source, textPattern.flags);
            while ((match = regex.exec(line)) !== null) {
                const value = match[1].trim();
                if (this.isValidString(value)) {
                    this.addString(value, filePath, lineIndex + 1, match.index, 'text');
                }
            }

            // Extract attributes
            for (const pattern of attrPatterns) {
                const attrRegex = new RegExp(pattern.source, pattern.flags);
                while ((match = attrRegex.exec(line)) !== null) {
                    const value = match[1];
                    if (this.isValidString(value)) {
                        this.addString(value, filePath, lineIndex + 1, match.index, 'attribute');
                    }
                }
            }
        });
    }

    /**
     * Scan PHP files
     */
    private scanPHP(content: string, filePath: string): void {
        const lines = content.split('\n');

        // PHP strings
        const patterns = [
            /"([^"\\]*(\\.[^"\\]*)*)"/g,
            /'([^'\\]*(\\.[^'\\]*)*)'/g,
        ];

        // Skip translation functions
        const skipPatterns = [
            /__\(/,
            /_e\(/,
            /_x\(/,
            /_n\(/,
            /trans\(/,
            /Lang::/,
        ];

        lines.forEach((line, lineIndex) => {
            // Skip comments
            if (line.trim().startsWith('//') || line.trim().startsWith('#') || line.trim().startsWith('*')) {
                return;
            }

            // Skip if already translated
            if (skipPatterns.some(p => p.test(line))) {
                return;
            }

            for (const pattern of patterns) {
                let match;
                const regex = new RegExp(pattern.source, pattern.flags);
                while ((match = regex.exec(line)) !== null) {
                    const value = match[1];
                    if (this.isValidString(value)) {
                        this.addString(value, filePath, lineIndex + 1, match.index, 'text');
                    }
                }
            }
        });

        // Also scan HTML parts in PHP
        this.scanHTML(content, filePath);
    }

    /**
     * Scan Python files
     */
    private scanPython(content: string, filePath: string): void {
        const lines = content.split('\n');

        const patterns = [
            /"([^"\\]*(\\.[^"\\]*)*)"/g,
            /'([^'\\]*(\\.[^'\\]*)*)'/g,
            /"""([\s\S]*?)"""/g,
            /'''([\s\S]*?)'''/g,
        ];

        // Skip translation functions
        const skipPatterns = [
            /_\(/,
            /gettext\(/,
            /ngettext\(/,
            /pgettext\(/,
        ];

        lines.forEach((line, lineIndex) => {
            // Skip comments
            if (line.trim().startsWith('#')) {
                return;
            }

            // Skip imports
            if (line.includes('import ') || line.includes('from ')) {
                return;
            }

            // Skip if already translated
            if (skipPatterns.some(p => p.test(line))) {
                return;
            }

            for (const pattern of patterns) {
                let match;
                const regex = new RegExp(pattern.source, pattern.flags);
                while ((match = regex.exec(line)) !== null) {
                    const value = match[1];
                    if (this.isValidString(value)) {
                        this.addString(value, filePath, lineIndex + 1, match.index, 'text');
                    }
                }
            }
        });
    }

    /**
     * Scan Ruby files
     */
    private scanRuby(content: string, filePath: string): void {
        const lines = content.split('\n');

        const patterns = [
            /"([^"\\]*(\\.[^"\\]*)*)"/g,
            /'([^'\\]*(\\.[^'\\]*)*)'/g,
        ];

        // Skip translation functions
        const skipPatterns = [
            /I18n\.t/,
            /t\s*\(/,
            /t\s*'/,
            /t\s*"/,
        ];

        lines.forEach((line, lineIndex) => {
            // Skip comments
            if (line.trim().startsWith('#')) {
                return;
            }

            // Skip requires
            if (line.includes('require ')) {
                return;
            }

            // Skip if already translated
            if (skipPatterns.some(p => p.test(line))) {
                return;
            }

            for (const pattern of patterns) {
                let match;
                const regex = new RegExp(pattern.source, pattern.flags);
                while ((match = regex.exec(line)) !== null) {
                    const value = match[1];
                    if (this.isValidString(value)) {
                        this.addString(value, filePath, lineIndex + 1, match.index, 'text');
                    }
                }
            }
        });
    }

    /**
     * Scan Go files
     */
    private scanGo(content: string, filePath: string): void {
        const lines = content.split('\n');

        const patterns = [
            /"([^"\\]*(\\.[^"\\]*)*)"/g,
            /`([^`]*)`/g,
        ];

        lines.forEach((line, lineIndex) => {
            // Skip comments
            if (line.trim().startsWith('//')) {
                return;
            }

            // Skip imports
            if (line.includes('import ')) {
                return;
            }

            for (const pattern of patterns) {
                let match;
                const regex = new RegExp(pattern.source, pattern.flags);
                while ((match = regex.exec(line)) !== null) {
                    const value = match[1];
                    if (this.isValidString(value)) {
                        this.addString(value, filePath, lineIndex + 1, match.index, 'text');
                    }
                }
            }
        });
    }

    /**
     * Scan Java files
     */
    private scanJava(content: string, filePath: string): void {
        const lines = content.split('\n');

        const patterns = [
            /"([^"\\]*(\\.[^"\\]*)*)"/g,
        ];

        // Skip ResourceBundle patterns
        const skipPatterns = [
            /getString\(/,
            /getMessage\(/,
            /ResourceBundle/,
        ];

        lines.forEach((line, lineIndex) => {
            // Skip comments
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
                return;
            }

            // Skip imports
            if (line.includes('import ')) {
                return;
            }

            // Skip if already translated
            if (skipPatterns.some(p => p.test(line))) {
                return;
            }

            for (const pattern of patterns) {
                let match;
                const regex = new RegExp(pattern.source, pattern.flags);
                while ((match = regex.exec(line)) !== null) {
                    const value = match[1];
                    if (this.isValidString(value)) {
                        this.addString(value, filePath, lineIndex + 1, match.index, 'text');
                    }
                }
            }
        });
    }

    /**
     * Generic string scanner for unknown file types
     */
    private scanGeneric(content: string, filePath: string): void {
        const lines = content.split('\n');

        const patterns = [
            /"([^"\\]*(\\.[^"\\]*)*)"/g,
            /'([^'\\]*(\\.[^'\\]*)*)'/g,
        ];

        lines.forEach((line, lineIndex) => {
            for (const pattern of patterns) {
                let match;
                const regex = new RegExp(pattern.source, pattern.flags);
                while ((match = regex.exec(line)) !== null) {
                    const value = match[1];
                    if (this.isValidString(value)) {
                        this.addString(value, filePath, lineIndex + 1, match.index, 'text');
                    }
                }
            }
        });
    }

    /**
     * Check if a string is valid for translation
     */
    private isValidString(value: string): boolean {
        if (!value || typeof value !== 'string') {
            return false;
        }

        const trimmed = value.trim();

        // Check length
        if (trimmed.length < this.config.minStringLength ||
            trimmed.length > this.config.maxStringLength) {
            return false;
        }

        // Check against ignore patterns
        for (const pattern of this.config.ignorePatterns) {
            if (new RegExp(pattern).test(trimmed)) {
                return false;
            }
        }

        // Additional filters
        const filters = [
            // File paths
            /^[.\/\\]?[a-zA-Z0-9_\-./\\]+\.[a-z]{2,4}$/i,
            // CSS classes
            /^[a-z\-_]+$/i,
            // JSON/object keys
            /^[a-zA-Z_][a-zA-Z0-9_]*$/,
            // Color codes
            /^#[0-9a-fA-F]{3,8}$/,
            // Empty or whitespace
            /^\s*$/,
            // Just punctuation
            /^[.,;:!?'"()\[\]{}]+$/,
            // Emoji only
            /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u,
        ];

        for (const filter of filters) {
            if (filter.test(trimmed)) {
                return false;
            }
        }

        // Must contain at least one letter
        if (!/[a-zA-Z]/.test(trimmed)) {
            return false;
        }

        // Should look like natural language (has spaces or is short enough)
        if (trimmed.length > 20 && !trimmed.includes(' ')) {
            return false;
        }

        return true;
    }

    /**
     * Add a string to the extraction list
     */
    private addString(
        value: string,
        file: string,
        line: number,
        column: number,
        type: ExtractedString['type']
    ): void {
        const key = this.generateKey(value);

        this.extractedStrings.push({
            key,
            value: value.trim(),
            file: path.relative(this.config.projectRoot, file),
            line,
            column,
            type,
        });
    }

    /**
     * Generate a translation key from string value
     */
    private generateKey(value: string): string {
        // Normalize the string for key generation
        let key = value
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s]/gi, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);

        // Handle empty keys
        if (!key) {
            key = `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        }

        return key;
    }

    /**
     * Remove duplicate strings
     */
    private deduplicateStrings(strings: ExtractedString[]): ExtractedString[] {
        const seen = new Map<string, ExtractedString>();

        for (const str of strings) {
            const existing = seen.get(str.value);
            if (!existing) {
                seen.set(str.value, str);
            }
        }

        return Array.from(seen.values());
    }

    /**
     * Generate scanning statistics
     */
    private generateStats(): ScanResult['stats'] {
        const byType: Record<string, number> = {};
        const byFile: Record<string, number> = {};

        for (const str of this.extractedStrings) {
            byType[str.type] = (byType[str.type] || 0) + 1;
            byFile[str.file] = (byFile[str.file] || 0) + 1;
        }

        return {
            totalFiles: this.processedFiles.length,
            totalStrings: this.extractedStrings.length,
            byType,
            byFile,
        };
    }
}
