/**
 * Translation Manager - Multi-service translation with free options
 * Supports: DeepL, Google, LibreTranslate, Lingva, MyMemory, Mock/Pseudo
 */

import axios, { AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import {
    MultilingualConfig,
    TranslationService,
    SupportedLanguage,
    TranslationResult,
    DEFAULT_CONFIG,
} from './types';

interface TranslationCache {
    [key: string]: {
        [targetLang: string]: string;
    };
}

interface TranslationMemoryEntry {
    source: string;
    target: string;
    sourceLang: string;
    targetLang: string;
    service: string;
    timestamp: number;
    context?: string;
}

interface TranslationMemory {
    version: string;
    entries: TranslationMemoryEntry[];
}

interface QualityReport {
    score: number;
    issues: string[];
    suggestions: string[];
}

// Extended translation service types
export type ExtendedTranslationService = TranslationService | 'libretranslate' | 'lingva' | 'mymemory' | 'argos' | 'pseudo';

export class TranslationManager {
    private config: MultilingualConfig;
    private cache: TranslationCache = {};
    private rateLimitDelay = 100; // ms between requests
    private translationMemory: TranslationMemory = { version: '1.0', entries: [] };
    private tmPath: string;
    private extendedService: ExtendedTranslationService;

    // Public LibreTranslate instances (no API key required)
    // Note: Public instances may be rate-limited or unavailable. Consider using Lingva as alternative.
    private libreTranslateInstances = [
        'https://libretranslate.de',
        'https://translate.terraprint.co',
        'https://trans.zillyhuhn.com',
        'https://libretranslate.pussthecat.org',
    ];

    // Lingva Translate instances (no API key required)
    private lingvaInstances = [
        'https://lingva.ml',
        'https://translate.plausibility.cloud',
        'https://lingva.lunar.icu',
    ];

    constructor(config: Partial<MultilingualConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.tmPath = path.join(this.config.projectRoot || process.cwd(), '.multilingual', 'translation-memory.json');
        this.extendedService = this.config.translationService as ExtendedTranslationService;
        this.loadTranslationMemory();
    }

    /**
     * Set extended translation service
     */
    setExtendedService(service: ExtendedTranslationService): void {
        this.extendedService = service;
        // Also update the base service if it's a standard one
        if (['deepl', 'google', 'none'].includes(service)) {
            this.config.translationService = service as TranslationService;
        }
    }

    /**
     * Load translation memory from disk
     */
    private loadTranslationMemory(): void {
        try {
            if (fs.existsSync(this.tmPath)) {
                const data = fs.readFileSync(this.tmPath, 'utf-8');
                this.translationMemory = JSON.parse(data);
            }
        } catch {
            this.translationMemory = { version: '1.0', entries: [] };
        }
    }

    /**
     * Save translation memory to disk
     */
    saveTranslationMemory(): void {
        try {
            const dir = path.dirname(this.tmPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.tmPath, JSON.stringify(this.translationMemory, null, 2));
        } catch {
            // Silently fail
        }
    }

    /**
     * Look up translation in memory with fuzzy matching
     */
    private lookupInMemory(
        text: string,
        targetLang: string,
        sourceLang: string,
        fuzzyThreshold = 0.85
    ): { translation: string; similarity: number } | null {
        const normalizedText = text.toLowerCase().trim();

        for (const entry of this.translationMemory.entries) {
            if (entry.sourceLang === sourceLang && entry.targetLang === targetLang) {
                const normalizedSource = entry.source.toLowerCase().trim();
                
                // Exact match
                if (normalizedSource === normalizedText) {
                    return { translation: entry.target, similarity: 1.0 };
                }

                // Fuzzy match
                const similarity = this.calculateSimilarity(normalizedText, normalizedSource);
                if (similarity >= fuzzyThreshold) {
                    return { translation: entry.target, similarity };
                }
            }
        }

        return null;
    }

    /**
     * Calculate string similarity (Levenshtein-based)
     */
    private calculateSimilarity(a: string, b: string): number {
        if (a === b) return 1;
        if (a.length === 0 || b.length === 0) return 0;

        const matrix: number[][] = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        const maxLen = Math.max(a.length, b.length);
        return 1 - matrix[b.length][a.length] / maxLen;
    }

    /**
     * Add entry to translation memory
     */
    private addToMemory(
        source: string,
        target: string,
        sourceLang: string,
        targetLang: string,
        service: string
    ): void {
        // Check for duplicates
        const exists = this.translationMemory.entries.some(
            e => e.source === source && e.targetLang === targetLang && e.sourceLang === sourceLang
        );

        if (!exists) {
            this.translationMemory.entries.push({
                source,
                target,
                sourceLang,
                targetLang,
                service,
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Translate a single string
     */
    async translate(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage?: SupportedLanguage
    ): Promise<TranslationResult> {
        const source = sourceLanguage || this.config.sourceLanguage;

        // Check cache
        const cacheKey = `${source}:${text}`;
        if (this.cache[cacheKey]?.[targetLanguage]) {
            return {
                success: true,
                text: this.cache[cacheKey][targetLanguage],
                service: this.config.translationService,
                cached: true,
            };
        }

        // Skip if source equals target
        if (source === targetLanguage) {
            return {
                success: true,
                text,
                service: 'none',
            };
        }

        // Check translation memory
        const memoryMatch = this.lookupInMemory(text, targetLanguage, source);
        if (memoryMatch && memoryMatch.similarity > 0.95) {
            // Cache it
            if (!this.cache[cacheKey]) this.cache[cacheKey] = {};
            this.cache[cacheKey][targetLanguage] = memoryMatch.translation;
            
            return {
                success: true,
                text: memoryMatch.translation,
                service: this.config.translationService,
                cached: true,
            };
        }

        try {
            let result: string;
            const service = this.extendedService || this.config.translationService;

            switch (service) {
                case 'deepl':
                    result = await this.translateWithDeepL(text, targetLanguage, source);
                    break;
                case 'google':
                    result = await this.translateWithGoogle(text, targetLanguage, source);
                    break;
                case 'libretranslate':
                    result = await this.translateWithLibreTranslate(text, targetLanguage, source);
                    break;
                case 'lingva':
                    result = await this.translateWithLingva(text, targetLanguage, source);
                    break;
                case 'mymemory':
                    result = await this.translateWithMyMemory(text, targetLanguage, source);
                    break;
                case 'argos':
                    result = await this.translateWithArgos(text, targetLanguage, source);
                    break;
                case 'pseudo':
                    result = this.generatePseudoTranslation(text);
                    break;
                default:
                    return {
                        success: false,
                        error: 'No translation service configured',
                        service: 'none',
                    };
            }

            // Cache the result
            if (!this.cache[cacheKey]) {
                this.cache[cacheKey] = {};
            }
            this.cache[cacheKey][targetLanguage] = result;

            // Add to translation memory
            this.addToMemory(text, result, source, targetLanguage, service);

            return {
                success: true,
                text: result,
                service: this.config.translationService,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                error: errorMessage,
                service: this.config.translationService,
            };
        }
    }

    /**
     * Translate multiple strings in batch
     */
    async translateBatch(
        texts: string[],
        targetLanguage: SupportedLanguage,
        sourceLanguage?: SupportedLanguage,
        onProgress?: (completed: number, total: number) => void
    ): Promise<Map<string, TranslationResult>> {
        const results = new Map<string, TranslationResult>();
        const source = sourceLanguage || this.config.sourceLanguage;

        // Split into cached and uncached
        const uncached: string[] = [];
        const cacheKey = (text: string) => `${source}:${text}`;

        for (const text of texts) {
            if (this.cache[cacheKey(text)]?.[targetLanguage]) {
                results.set(text, {
                    success: true,
                    text: this.cache[cacheKey(text)][targetLanguage],
                    service: this.config.translationService,
                    cached: true,
                });
            } else {
                uncached.push(text);
            }
        }

        // Batch translate uncached strings
        if (uncached.length > 0) {
            const service = this.extendedService || this.config.translationService;

            if (service === 'deepl') {
                const batchResults = await this.batchTranslateDeepL(uncached, targetLanguage, source, onProgress);
                for (const [text, result] of batchResults) {
                    results.set(text, result);
                    if (result.success && result.text) {
                        if (!this.cache[cacheKey(text)]) {
                            this.cache[cacheKey(text)] = {};
                        }
                        this.cache[cacheKey(text)][targetLanguage] = result.text;
                    }
                }
            } else {
                // Sequential translation for other services
                let completed = texts.length - uncached.length;
                for (const text of uncached) {
                    const result = await this.translate(text, targetLanguage, source);
                    results.set(text, result);
                    completed++;
                    onProgress?.(completed, texts.length);
                    await this.delay(this.rateLimitDelay);
                }
            }
        }

        return results;
    }

    // =========================================================================
    // FREE TRANSLATION SERVICES (NO API KEY REQUIRED)
    // =========================================================================

    /**
     * Translate using LibreTranslate (FREE, no API key required)
     * Self-hosted or uses public instances
     */
    private async translateWithLibreTranslate(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage
    ): Promise<string> {
        // Try each instance until one works
        const instances = this.config.apiKey 
            ? [this.config.apiKey] // If API key is provided, treat it as a custom instance URL
            : this.libreTranslateInstances;

        let lastError: Error | null = null;

        for (const instance of instances) {
            try {
                const response = await axios.post(
                    `${instance}/translate`,
                    {
                        q: text,
                        source: this.mapToLibreTranslateLanguage(sourceLanguage),
                        target: this.mapToLibreTranslateLanguage(targetLanguage),
                        format: 'text',
                    },
                    {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 10000,
                    }
                );

                if (response.data?.translatedText) {
                    return response.data.translatedText;
                }
            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                continue;
            }
        }

        throw lastError || new Error('All LibreTranslate instances failed');
    }

    /**
     * Translate using Lingva Translate (FREE, no API key required)
     * Privacy-focused Google Translate frontend
     */
    private async translateWithLingva(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage
    ): Promise<string> {
        const instances = this.config.apiKey
            ? [this.config.apiKey]
            : this.lingvaInstances;

        let lastError: Error | null = null;

        for (const instance of instances) {
            try {
                const source = this.mapToLingvaLanguage(sourceLanguage);
                const target = this.mapToLingvaLanguage(targetLanguage);
                const encodedText = encodeURIComponent(text);

                const response = await axios.get(
                    `${instance}/api/v1/${source}/${target}/${encodedText}`,
                    { timeout: 10000 }
                );

                if (response.data?.translation) {
                    return response.data.translation;
                }
            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                continue;
            }
        }

        throw lastError || new Error('All Lingva instances failed');
    }

    /**
     * Translate using MyMemory (FREE, 10,000 chars/day without API key)
     * Higher limits with free registration
     */
    private async translateWithMyMemory(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage
    ): Promise<string> {
        const langPair = `${sourceLanguage}|${targetLanguage}`;
        const params: Record<string, string> = {
            q: text,
            langpair: langPair,
        };

        // Add email for higher limits (100,000 chars/day)
        if (this.config.apiKey && this.config.apiKey.includes('@')) {
            params.de = this.config.apiKey; // email for higher limits
        }

        const response = await axios.get('https://api.mymemory.translated.net/get', {
            params,
            timeout: 10000,
        });

        if (response.data?.responseData?.translatedText) {
            const translated = response.data.responseData.translatedText;
            
            // MyMemory returns error messages in the translation field
            if (translated.includes('MYMEMORY WARNING') || translated.includes('QUOTA EXCEEDED')) {
                throw new Error('MyMemory quota exceeded. Register for higher limits.');
            }
            
            return translated;
        }

        throw new Error('Invalid response from MyMemory');
    }

    /**
     * Translate using Argos Translate (FREE, local or API)
     */
    private async translateWithArgos(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage
    ): Promise<string> {
        // Argos uses LibreTranslate API format
        const endpoint = this.config.apiKey || 'https://translate.argosopentech.com';

        const response = await axios.post(
            `${endpoint}/translate`,
            {
                q: text,
                source: sourceLanguage,
                target: targetLanguage,
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000,
            }
        );

        if (response.data?.translatedText) {
            return response.data.translatedText;
        }

        throw new Error('Invalid response from Argos Translate');
    }

    /**
     * Generate pseudo-translation for testing
     * Creates text like: [Ḧḛŀŀő Ẇőřŀḓ] to test UI rendering
     */
    generatePseudoTranslation(text: string): string {
        const pseudoMap: Record<string, string> = {
            'a': 'ȧ', 'b': 'ƀ', 'c': 'ƈ', 'd': 'ḓ', 'e': 'ḛ', 'f': 'ƒ',
            'g': 'ɠ', 'h': 'ḥ', 'i': 'ī', 'j': 'ĵ', 'k': 'ķ', 'l': 'ŀ',
            'm': 'ḿ', 'n': 'ƞ', 'o': 'ő', 'p': 'ƥ', 'q': 'ʠ', 'r': 'ř',
            's': 'ş', 't': 'ŧ', 'u': 'ŭ', 'v': 'ṽ', 'w': 'ẇ', 'x': 'ẋ',
            'y': 'ẏ', 'z': 'ẑ',
            'A': 'Ȧ', 'B': 'Ɓ', 'C': 'Ƈ', 'D': 'Ḓ', 'E': 'Ḛ', 'F': 'Ƒ',
            'G': 'Ɠ', 'H': 'Ḥ', 'I': 'Ī', 'J': 'Ĵ', 'K': 'Ķ', 'L': 'Ŀ',
            'M': 'Ḿ', 'N': 'Ƞ', 'O': 'Ő', 'P': 'Ƥ', 'Q': 'Ǫ', 'R': 'Ř',
            'S': 'Ş', 'T': 'Ŧ', 'U': 'Ŭ', 'V': 'Ṽ', 'W': 'Ẇ', 'X': 'Ẋ',
            'Y': 'Ẏ', 'Z': 'Ẑ',
        };

        // Preserve placeholders and HTML
        const preservePattern = /(\{[^}]+\}|\{\{[^}]+\}\}|<[^>]+>|\$\{[^}]+\}|%[sd]|\$\w+)/g;
        const preservedSegments: string[] = [];
        let idx = 0;

        const textWithPlaceholders = text.replace(preservePattern, (match) => {
            preservedSegments.push(match);
            return `\x00${idx++}\x00`;
        });

        // Convert characters
        let pseudo = '';
        for (const char of textWithPlaceholders) {
            pseudo += pseudoMap[char] || char;
        }

        // Add length expansion (~30% for most languages)
        const expansion = Math.floor(text.length * 0.3);
        pseudo += '~'.repeat(expansion);

        // Restore preserved segments
        for (let i = 0; i < preservedSegments.length; i++) {
            pseudo = pseudo.replace(`\x00${i}\x00`, preservedSegments[i]);
        }

        // Wrap in brackets for visibility
        return `[${pseudo}]`;
    }

    // =========================================================================
    // PAID TRANSLATION SERVICES
    // =========================================================================

    /**
     * Translate using DeepL API
     */
    private async translateWithDeepL(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage
    ): Promise<string> {
        if (!this.config.apiKey) {
            throw new Error('DeepL API key not configured');
        }

        // Determine API endpoint (free vs pro)
        const isFreeKey = this.config.apiKey.endsWith(':fx');
        const baseUrl = isFreeKey
            ? 'https://api-free.deepl.com/v2'
            : 'https://api.deepl.com/v2';

        const response = await axios.post(
            `${baseUrl}/translate`,
            new URLSearchParams({
                text,
                source_lang: this.mapToDeepLLanguage(sourceLanguage),
                target_lang: this.mapToDeepLLanguage(targetLanguage),
            }),
            {
                headers: {
                    'Authorization': `DeepL-Auth-Key ${this.config.apiKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        if (response.data?.translations?.[0]?.text) {
            return response.data.translations[0].text;
        }

        throw new Error('Invalid response from DeepL');
    }

    /**
     * Batch translate using DeepL API
     */
    private async batchTranslateDeepL(
        texts: string[],
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage,
        onProgress?: (completed: number, total: number) => void
    ): Promise<Map<string, TranslationResult>> {
        const results = new Map<string, TranslationResult>();

        if (!this.config.apiKey) {
            for (const text of texts) {
                results.set(text, {
                    success: false,
                    error: 'DeepL API key not configured',
                    service: 'deepl',
                });
            }
            return results;
        }

        // DeepL supports batch requests (up to 50 texts)
        const batchSize = 50;
        const batches: string[][] = [];

        for (let i = 0; i < texts.length; i += batchSize) {
            batches.push(texts.slice(i, i + batchSize));
        }

        const isFreeKey = this.config.apiKey.endsWith(':fx');
        const baseUrl = isFreeKey
            ? 'https://api-free.deepl.com/v2'
            : 'https://api.deepl.com/v2';

        let completed = 0;

        for (const batch of batches) {
            try {
                const params = new URLSearchParams();
                batch.forEach(text => params.append('text', text));
                params.append('source_lang', this.mapToDeepLLanguage(sourceLanguage));
                params.append('target_lang', this.mapToDeepLLanguage(targetLanguage));

                const response = await axios.post(`${baseUrl}/translate`, params, {
                    headers: {
                        'Authorization': `DeepL-Auth-Key ${this.config.apiKey}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                });

                if (response.data?.translations) {
                    response.data.translations.forEach((translation: { text: string }, index: number) => {
                        results.set(batch[index], {
                            success: true,
                            text: translation.text,
                            service: 'deepl',
                        });
                    });
                }

                completed += batch.length;
                onProgress?.(completed, texts.length);

                // Rate limiting
                await this.delay(this.rateLimitDelay);
            } catch (error) {
                const errorMessage = this.handleApiError(error, 'deepl');
                for (const text of batch) {
                    results.set(text, {
                        success: false,
                        error: errorMessage,
                        service: 'deepl',
                    });
                }
            }
        }

        return results;
    }

    /**
     * Translate using Google Cloud Translation API
     */
    private async translateWithGoogle(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage
    ): Promise<string> {
        if (!this.config.apiKey) {
            throw new Error('Google Cloud Translation API key not configured');
        }

        const response = await axios.post(
            `https://translation.googleapis.com/language/translate/v2`,
            {
                q: text,
                source: this.mapToGoogleLanguage(sourceLanguage),
                target: this.mapToGoogleLanguage(targetLanguage),
                format: 'text',
            },
            {
                params: {
                    key: this.config.apiKey,
                },
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.data?.data?.translations?.[0]?.translatedText) {
            return response.data.data.translations[0].translatedText;
        }

        throw new Error('Invalid response from Google Translate');
    }

    // =========================================================================
    // LANGUAGE MAPPING
    // =========================================================================

    private mapToDeepLLanguage(lang: SupportedLanguage): string {
        const mapping: Partial<Record<SupportedLanguage, string>> = {
            'zh': 'ZH',
            'zh-TW': 'ZH',
            'pt-BR': 'PT-BR',
            'pt': 'PT-PT',
            'en': 'EN',
        };
        return (mapping[lang] || lang).toUpperCase();
    }

    private mapToGoogleLanguage(lang: SupportedLanguage): string {
        const mapping: Partial<Record<SupportedLanguage, string>> = {
            'zh': 'zh-CN',
            'zh-TW': 'zh-TW',
        };
        return mapping[lang] || lang;
    }

    // Lingva uses simpler codes
    private mapToLingvaLanguage(lang: SupportedLanguage): string {
        const mapping: Partial<Record<SupportedLanguage, string>> = {
            'zh': 'zh',
            'zh-TW': 'zh_Hant',
            'pt-BR': 'pt',
        };
        return mapping[lang] || lang;
    }

    private mapToLibreTranslateLanguage(lang: SupportedLanguage): string {
        const mapping: Partial<Record<SupportedLanguage, string>> = {
            'zh': 'zh',
            'zh-TW': 'zh',
            'pt-BR': 'pt',
        };
        return mapping[lang] || lang;
    }

    // =========================================================================
    // VALIDATION & QUALITY
    // =========================================================================

    /**
     * Validate translation quality
     */
    validateTranslation(source: string, translation: string): QualityReport {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let score = 100;

        // Check for placeholder preservation
        const sourcePlaceholders = source.match(/\{[^}]+\}|\{\{[^}]+\}\}|\$\{[^}]+\}|%[sd]/g) || [];
        const translationPlaceholders = translation.match(/\{[^}]+\}|\{\{[^}]+\}\}|\$\{[^}]+\}|%[sd]/g) || [];

        if (sourcePlaceholders.length !== translationPlaceholders.length) {
            issues.push(`Placeholder count mismatch: source has ${sourcePlaceholders.length}, translation has ${translationPlaceholders.length}`);
            score -= 30;
        }

        // Check for HTML tag preservation
        const sourceHtml = source.match(/<[^>]+>/g) || [];
        const translationHtml = translation.match(/<[^>]+>/g) || [];

        if (sourceHtml.length !== translationHtml.length) {
            issues.push(`HTML tag count mismatch: source has ${sourceHtml.length}, translation has ${translationHtml.length}`);
            score -= 20;
        }

        // Check for excessive length difference (>50% expansion is suspicious)
        const lengthRatio = translation.length / source.length;
        if (lengthRatio > 2) {
            issues.push('Translation is suspiciously longer than source');
            suggestions.push('Review translation for unnecessary content');
            score -= 10;
        }

        // Check for untranslated content (exact match usually means failure)
        if (source === translation && source.length > 3) {
            issues.push('Translation appears unchanged from source');
            score -= 40;
        }

        // Check for common machine translation issues
        if (translation.includes('MYMEMORY') || translation.includes('QUOTA')) {
            issues.push('Translation contains error message');
            score -= 50;
        }

        return {
            score: Math.max(0, score),
            issues,
            suggestions,
        };
    }

    /**
     * Detect interpolation patterns in text
     */
    detectInterpolations(text: string): { type: string; pattern: string; position: number }[] {
        const patterns = [
            { type: 'react', pattern: /{[^}]+}/g },
            { type: 'vue', pattern: /\{\{[^}]+\}\}/g },
            { type: 'template-literal', pattern: /\$\{[^}]+\}/g },
            { type: 'printf', pattern: /%[sd]/g },
            { type: 'named', pattern: /:(\w+)/g },
            { type: 'angular', pattern: /{{[^}]+}}/g },
            { type: 'ruby', pattern: /%{[^}]+}/g },
            { type: 'php', pattern: /\$\w+/g },
        ];

        const results: { type: string; pattern: string; position: number }[] = [];

        for (const { type, pattern } of patterns) {
            let match;
            const regex = new RegExp(pattern.source, 'g');
            while ((match = regex.exec(text)) !== null) {
                results.push({
                    type,
                    pattern: match[0],
                    position: match.index,
                });
            }
        }

        return results;
    }

    // =========================================================================
    // ERROR HANDLING
    // =========================================================================

    private handleApiError(error: unknown, service: ExtendedTranslationService): string {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<{ message?: string; error?: { message?: string } }>;

            if (axiosError.response) {
                const status = axiosError.response.status;
                const data = axiosError.response.data;

                switch (status) {
                    case 401:
                    case 403:
                        return `${service.toUpperCase()} API key is invalid or expired`;
                    case 429:
                        return `${service.toUpperCase()} rate limit exceeded. Please try again later.`;
                    case 456:
                        return `${service.toUpperCase()} quota exceeded. Please check your plan limits.`;
                    case 500:
                    case 503:
                        return `${service.toUpperCase()} service temporarily unavailable`;
                    default:
                        return data?.message || data?.error?.message || `${service.toUpperCase()} error: ${status}`;
                }
            }

            if (axiosError.request) {
                return `Network error: Unable to reach ${service.toUpperCase()} API`;
            }
        }

        return error instanceof Error ? error.message : 'Unknown translation error';
    }

    // =========================================================================
    // API KEY MANAGEMENT
    // =========================================================================

    /**
     * Validate API key
     */
    async validateApiKey(): Promise<{ valid: boolean; error?: string; usage?: object }> {
        if (!this.config.apiKey && !['libretranslate', 'lingva', 'mymemory', 'argos', 'pseudo', 'none'].includes(this.extendedService)) {
            return { valid: false, error: 'No API key configured' };
        }

        // Free services don't need validation
        if (['libretranslate', 'lingva', 'mymemory', 'argos', 'pseudo'].includes(this.extendedService)) {
            return { valid: true };
        }

        try {
            if (this.config.translationService === 'deepl') {
                const isFreeKey = this.config.apiKey?.endsWith(':fx');
                const baseUrl = isFreeKey
                    ? 'https://api-free.deepl.com/v2'
                    : 'https://api.deepl.com/v2';

                const response = await axios.get(`${baseUrl}/usage`, {
                    headers: {
                        'Authorization': `DeepL-Auth-Key ${this.config.apiKey}`,
                    },
                });

                return {
                    valid: true,
                    usage: {
                        characterCount: response.data.character_count,
                        characterLimit: response.data.character_limit,
                        remaining: response.data.character_limit - response.data.character_count,
                    },
                };
            } else if (this.config.translationService === 'google') {
                // Test with a simple translation
                await this.translateWithGoogle('test', 'es', 'en');
                return { valid: true };
            }

            return { valid: false, error: 'Unknown translation service' };
        } catch (error) {
            return {
                valid: false,
                error: this.handleApiError(error, this.config.translationService),
            };
        }
    }

    /**
     * Get supported languages for the configured service
     */
    async getSupportedLanguages(): Promise<SupportedLanguage[]> {
        return [
            'en', 'es', 'fr', 'de', 'it', 'pt', 'pt-BR', 'ru', 'zh', 'zh-TW',
            'ja', 'ko', 'ar', 'hi', 'nl', 'pl', 'sv', 'da', 'fi', 'no',
            'tr', 'cs', 'el', 'he', 'hu', 'id', 'ms', 'th', 'vi', 'uk',
            'bg', 'ro', 'sk', 'sl', 'et', 'lv', 'lt'
        ];
    }

    setApiKey(apiKey: string): void {
        this.config.apiKey = apiKey;
    }

    setService(service: TranslationService): void {
        this.config.translationService = service;
        this.extendedService = service;
    }

    clearCache(): void {
        this.cache = {};
    }

    getCacheStats(): { entries: number; languages: Set<string> } {
        const languages = new Set<string>();
        let entries = 0;

        for (const key of Object.keys(this.cache)) {
            for (const lang of Object.keys(this.cache[key])) {
                languages.add(lang);
                entries++;
            }
        }

        return { entries, languages };
    }

    getTranslationMemoryStats(): { entries: number; languages: Set<string> } {
        const languages = new Set<string>();
        
        for (const entry of this.translationMemory.entries) {
            languages.add(entry.targetLang);
        }

        return {
            entries: this.translationMemory.entries.length,
            languages,
        };
    }

    /**
     * Export translation memory
     */
    exportTranslationMemory(): TranslationMemory {
        return this.translationMemory;
    }

    /**
     * Import translation memory
     */
    importTranslationMemory(tm: TranslationMemory): void {
        for (const entry of tm.entries) {
            const exists = this.translationMemory.entries.some(
                e => e.source === entry.source && 
                     e.targetLang === entry.targetLang && 
                     e.sourceLang === entry.sourceLang
            );
            if (!exists) {
                this.translationMemory.entries.push(entry);
            }
        }
        this.saveTranslationMemory();
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Get instructions and links for obtaining API keys
 */
export function getApiKeyInstructions(service: ExtendedTranslationService): string {
    if (service === 'deepl') {
        return `
╔════════════════════════════════════════════════════════════════════╗
║                    DeepL API Key Setup                              ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  1. Go to: https://www.deepl.com/pro-api                            ║
║                                                                      ║
║  2. Sign up for a DeepL account (if you don't have one)             ║
║                                                                      ║
║  3. Choose a plan:                                                   ║
║     • DeepL API Free: 500,000 characters/month (FREE)               ║
║     • DeepL API Pro: Pay-as-you-go ($4.99/month + usage)            ║
║                                                                      ║
║  4. After signing up, go to your account:                           ║
║     https://www.deepl.com/account/summary                           ║
║                                                                      ║
║  5. Scroll down to "Authentication Key for DeepL API"               ║
║                                                                      ║
║  6. Copy your API key (it looks like: xxxxxxxx-xxxx-xxxx-xxxx:fx)   ║
║                                                                      ║
║  Note: Free API keys end with ":fx"                                  ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
    }

    if (service === 'google') {
        return `
╔════════════════════════════════════════════════════════════════════╗
║              Google Cloud Translation API Key Setup                 ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  1. Go to Google Cloud Console:                                      ║
║     https://console.cloud.google.com/                                ║
║                                                                      ║
║  2. Create a new project or select an existing one                  ║
║                                                                      ║
║  3. Enable the Cloud Translation API:                                ║
║     https://console.cloud.google.com/apis/library/translate         ║
║                                                                      ║
║  4. Go to APIs & Services > Credentials:                            ║
║     https://console.cloud.google.com/apis/credentials               ║
║                                                                      ║
║  5. Click "Create Credentials" > "API Key"                          ║
║                                                                      ║
║  6. Copy your API key                                                ║
║                                                                      ║
║  7. (Recommended) Restrict your API key:                            ║
║     • Click on the API key                                           ║
║     • Under "API restrictions", select "Cloud Translation API"      ║
║     • Save                                                           ║
║                                                                      ║
║  Pricing: $20 per million characters (first 500K chars/month free)  ║
║  Details: https://cloud.google.com/translate/pricing                ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
    }

    if (service === 'libretranslate') {
        return `
╔════════════════════════════════════════════════════════════════════╗
║                  LibreTranslate (FREE - No API Key)                 ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ✅ NO API KEY REQUIRED - Uses public instances automatically       ║
║                                                                      ║
║  LibreTranslate is a free, open-source translation API.            ║
║                                                                      ║
║  Public instances used:                                              ║
║  • https://libretranslate.com                                        ║
║  • https://translate.argosopentech.com                               ║
║  • https://lt.vern.cc                                                ║
║                                                                      ║
║  For higher rate limits, you can:                                    ║
║  1. Self-host: https://github.com/LibreTranslate/LibreTranslate    ║
║  2. Provide your own instance URL as the "API key"                   ║
║                                                                      ║
║  Docker: docker run -p 5000:5000 libretranslate/libretranslate      ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
    }

    if (service === 'lingva') {
        return `
╔════════════════════════════════════════════════════════════════════╗
║                  Lingva Translate (FREE - No API Key)               ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ✅ NO API KEY REQUIRED - Uses public instances automatically       ║
║                                                                      ║
║  Lingva is a privacy-focused alternative frontend for Google        ║
║  Translate that doesn't track users.                                 ║
║                                                                      ║
║  Public instances used:                                              ║
║  • https://lingva.ml                                                 ║
║  • https://translate.plausibility.cloud                              ║
║  • https://lingva.lunar.icu                                          ║
║                                                                      ║
║  For your own instance:                                              ║
║  https://github.com/TheDavidDelta/lingva-translate                  ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
    }

    if (service === 'mymemory') {
        return `
╔════════════════════════════════════════════════════════════════════╗
║                   MyMemory (FREE - Optional Email)                  ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ✅ NO API KEY REQUIRED for basic usage                              ║
║                                                                      ║
║  MyMemory provides free translation with:                            ║
║  • 10,000 characters/day without registration                        ║
║  • 100,000 characters/day with email registration (free)            ║
║                                                                      ║
║  To get higher limits:                                               ║
║  1. Go to: https://mymemory.translated.net/                         ║
║  2. Register with your email                                         ║
║  3. Use your email as the "API key" in this tool                    ║
║                                                                      ║
║  Note: MyMemory uses crowd-sourced translations and machine         ║
║  translation. Quality may vary.                                      ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
    }

    if (service === 'pseudo') {
        return `
╔════════════════════════════════════════════════════════════════════╗
║                  Pseudo-localization (Testing)                       ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ✅ NO API KEY REQUIRED                                              ║
║                                                                      ║
║  Pseudo-localization creates fake translations for testing:          ║
║                                                                      ║
║  "Hello World" → "[Ḥḛŀŀő Ẇőřŀḓ~~~]"                                 ║
║                                                                      ║
║  This helps you:                                                     ║
║  • Test if your UI can handle different character sets              ║
║  • Verify that translations don't break your layout                  ║
║  • Find hard-coded strings that weren't extracted                   ║
║  • Test text expansion (translations are ~30% longer)               ║
║  • Identify concatenated strings and other i18n issues              ║
║                                                                      ║
║  Use this mode before real translations to catch problems early!    ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
    }

    return `
╔════════════════════════════════════════════════════════════════════╗
║                    Available Translation Services                    ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  🆓 FREE (No billing required):                                      ║
║                                                                      ║
║  • LibreTranslate - Open source, uses public instances               ║
║  • Lingva         - Privacy-focused Google Translate proxy           ║
║  • MyMemory       - 10k chars/day free, 100k with email             ║
║  • Pseudo         - Fake translations for testing                    ║
║                                                                      ║
║  💳 PAID (Requires billing):                                         ║
║                                                                      ║
║  • DeepL          - High quality (500k chars/month free tier)        ║
║  • Google         - Wide support (500k chars/month free tier)        ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
}

/**
 * Security utilities for API key management
 */
export const SecurityUtils = {
    /**
     * Mask API key for display (shows first and last 4 chars)
     */
    maskApiKey(key: string): string {
        if (!key || key.length < 12) return '****';
        return `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`;
    },

    /**
     * Check if a string looks like an API key (should not be logged)
     */
    looksLikeApiKey(str: string): boolean {
        // DeepL keys end with :fx
        if (str.endsWith(':fx')) return true;
        
        // Long alphanumeric strings with dashes
        if (/^[a-zA-Z0-9-]{32,}$/.test(str)) return true;
        
        // Google-style keys
        if (/^AIza[A-Za-z0-9_-]{35}$/.test(str)) return true;
        
        return false;
    },

    /**
     * Sanitize error messages to remove potential API keys
     */
    sanitizeError(error: string): string {
        // Remove anything that looks like an API key
        return error
            .replace(/AIza[A-Za-z0-9_-]{35}/g, '[REDACTED]')
            .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(:fx)?/gi, '[REDACTED]')
            .replace(/Bearer [^\s]+/g, 'Bearer [REDACTED]')
            .replace(/key=[^\s&]+/g, 'key=[REDACTED]');
    },

    /**
     * Validate API key format without exposing it
     */
    validateKeyFormat(key: string, service: ExtendedTranslationService): { valid: boolean; error?: string } {
        if (!key || key.trim().length === 0) {
            return { valid: false, error: 'API key is empty' };
        }

        switch (service) {
            case 'deepl':
                if (!/^[a-f0-9-]+(:fx)?$/i.test(key)) {
                    return { valid: false, error: 'DeepL API key format is invalid' };
                }
                break;
            case 'google':
                if (!/^AIza[A-Za-z0-9_-]{35}$/.test(key)) {
                    return { valid: false, error: 'Google API key format is invalid' };
                }
                break;
        }

        return { valid: true };
    },
};
