/**
 * multilingual-cli - Type Definitions
 */

export type TranslationService = 'deepl' | 'google' | 'none';

export type SupportedLanguage =
    | 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'pt-BR' | 'ru' | 'zh' | 'zh-TW'
    | 'ja' | 'ko' | 'ar' | 'hi' | 'nl' | 'pl' | 'sv' | 'da' | 'fi' | 'no'
    | 'tr' | 'cs' | 'el' | 'he' | 'hu' | 'id' | 'ms' | 'th' | 'vi' | 'uk'
    | 'bg' | 'ro' | 'sk' | 'sl' | 'et' | 'lv' | 'lt';

export interface LanguageInfo {
    code: SupportedLanguage;
    name: string;
    nativeName: string;
    rtl?: boolean;
}

export interface MultilingualConfig {
    // Project settings
    projectRoot: string;
    outputDir: string;
    sourceLanguage: SupportedLanguage;
    targetLanguages: SupportedLanguage[];

    // Translation service
    translationService: TranslationService;
    apiKey?: string;

    // Scanning options
    include: string[];
    exclude: string[];
    fileTypes: string[];

    // i18n output format
    outputFormat: 'json' | 'yaml' | 'js' | 'ts';
    flatKeys: boolean;
    keyStyle: 'nested' | 'flat' | 'auto';

    // GitHub Actions
    autoMode: boolean;
    githubActions: boolean;

    // Advanced
    preserveExisting: boolean;
    sortKeys: boolean;
    minStringLength: number;
    maxStringLength: number;
    ignorePatterns: string[];
}

export interface ExtractedString {
    key: string;
    value: string;
    file: string;
    line: number;
    column: number;
    context?: string;
    type: 'text' | 'attribute' | 'template' | 'jsx' | 'code';
}

export interface TranslationEntry {
    key: string;
    source: string;
    translations: Record<SupportedLanguage, string>;
    metadata?: {
        extractedFrom: string;
        lastUpdated: string;
        autoTranslated: boolean;
    };
}

export interface TranslationResult {
    success: boolean;
    text?: string;
    error?: string;
    service: TranslationService;
    cached?: boolean;
}

export interface ScanResult {
    strings: ExtractedString[];
    files: string[];
    stats: {
        totalFiles: number;
        totalStrings: number;
        byType: Record<string, number>;
        byFile: Record<string, number>;
    };
}

export interface GenerationResult {
    success: boolean;
    outputFiles: string[];
    stats: {
        totalKeys: number;
        newKeys: number;
        removedKeys: number;
        unchangedKeys: number;
    };
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'es', name: 'Spanish', nativeName: 'Español' },
    { code: 'fr', name: 'French', nativeName: 'Français' },
    { code: 'de', name: 'German', nativeName: 'Deutsch' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
    { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский' },
    { code: 'zh', name: 'Chinese (Simplified)', nativeName: '中文(简体)' },
    { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '中文(繁體)' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語' },
    { code: 'ko', name: 'Korean', nativeName: '한국어' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
    { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
    { code: 'pl', name: 'Polish', nativeName: 'Polski' },
    { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
    { code: 'da', name: 'Danish', nativeName: 'Dansk' },
    { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
    { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
    { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
    { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
    { code: 'he', name: 'Hebrew', nativeName: 'עברית', rtl: true },
    { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
    { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
    { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
    { code: 'th', name: 'Thai', nativeName: 'ไทย' },
    { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
    { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
    { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
    { code: 'ro', name: 'Romanian', nativeName: 'Română' },
    { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
    { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina' },
    { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
    { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
    { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
];

export const DEFAULT_CONFIG: MultilingualConfig = {
    projectRoot: process.cwd(),
    outputDir: './locales',
    sourceLanguage: 'en',
    targetLanguages: [],
    translationService: 'none',
    include: ['src/**/*', 'app/**/*', 'pages/**/*', 'components/**/*', 'views/**/*'],
    exclude: ['node_modules/**', 'dist/**', 'build/**', '.git/**', '*.test.*', '*.spec.*'],
    fileTypes: ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.html', '.htm', '.php', '.py', '.rb', '.go', '.java'],
    outputFormat: 'json',
    flatKeys: false,
    keyStyle: 'auto',
    autoMode: false,
    githubActions: false,
    preserveExisting: true,
    sortKeys: true,
    minStringLength: 2,
    maxStringLength: 5000,
    ignorePatterns: [
        '^[0-9]+$',           // Pure numbers
        '^[\\s]+$',           // Whitespace only
        '^https?://',         // URLs
        '^[a-zA-Z0-9_-]+$',   // Single word identifiers
        '^\\{\\{.*\\}\\}$',   // Template variables
        '^\\$\\{.*\\}$',      // Template literals
        '^[A-Z_]+$',          // Constants
    ],
};
