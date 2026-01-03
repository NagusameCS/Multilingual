/**
 * Translation Manager - Handles DeepL and Google Translate API integrations
 */

import axios, { AxiosError } from 'axios';
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

export class TranslationManager {
    private config: MultilingualConfig;
    private cache: TranslationCache = {};
    private rateLimitDelay = 100; // ms between requests

    constructor(config: Partial<MultilingualConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
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

        try {
            let result: string;

            switch (this.config.translationService) {
                case 'deepl':
                    result = await this.translateWithDeepL(text, targetLanguage, source);
                    break;
                case 'google':
                    result = await this.translateWithGoogle(text, targetLanguage, source);
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
            if (this.config.translationService === 'deepl') {
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
            } else if (this.config.translationService === 'google') {
                // Google doesn't support true batch, so we simulate it
                let completed = texts.length - uncached.length;
                for (const text of uncached) {
                    const result = await this.translate(text, targetLanguage, source);
                    results.set(text, result);
                    completed++;
                    onProgress?.(completed, texts.length);
                    await this.delay(this.rateLimitDelay);
                }
            } else {
                for (const text of uncached) {
                    results.set(text, {
                        success: false,
                        error: 'No translation service configured',
                        service: 'none',
                    });
                }
            }
        }

        return results;
    }

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

    /**
     * Map language codes to DeepL format
     */
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

    /**
     * Map language codes to Google format
     */
    private mapToGoogleLanguage(lang: SupportedLanguage): string {
        const mapping: Partial<Record<SupportedLanguage, string>> = {
            'zh': 'zh-CN',
            'zh-TW': 'zh-TW',
        };
        return mapping[lang] || lang;
    }

    /**
     * Handle API errors
     */
    private handleApiError(error: unknown, service: TranslationService): string {
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

    /**
     * Validate API key
     */
    async validateApiKey(): Promise<{ valid: boolean; error?: string; usage?: object }> {
        if (!this.config.apiKey) {
            return { valid: false, error: 'No API key configured' };
        }

        try {
            if (this.config.translationService === 'deepl') {
                const isFreeKey = this.config.apiKey.endsWith(':fx');
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
        // Both DeepL and Google support these common languages
        return [
            'en', 'es', 'fr', 'de', 'it', 'pt', 'pt-BR', 'ru', 'zh', 'zh-TW',
            'ja', 'ko', 'ar', 'hi', 'nl', 'pl', 'sv', 'da', 'fi', 'no',
            'tr', 'cs', 'el', 'he', 'hu', 'id', 'ms', 'th', 'vi', 'uk',
            'bg', 'ro', 'sk', 'sl', 'et', 'lv', 'lt'
        ];
    }

    /**
     * Set API key
     */
    setApiKey(apiKey: string): void {
        this.config.apiKey = apiKey;
    }

    /**
     * Set translation service
     */
    setService(service: TranslationService): void {
        this.config.translationService = service;
    }

    /**
     * Clear translation cache
     */
    clearCache(): void {
        this.cache = {};
    }

    /**
     * Get cache statistics
     */
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

    /**
     * Delay helper for rate limiting
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Get instructions and links for obtaining API keys
 */
export function getApiKeyInstructions(service: TranslationService): string {
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

    return 'Please select a translation service (DeepL or Google).';
}
