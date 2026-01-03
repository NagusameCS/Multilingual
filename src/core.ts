/**
 * Core Multilingual class - Main entry point for programmatic usage
 */

import { ContentScanner } from './scanner';
import { TranslationManager } from './translation';
import { I18nGenerator } from './generator';
import { ConfigManager } from './config';
import { GitHubActionsSetup } from './github-actions';
import {
    MultilingualConfig,
    ScanResult,
    GenerationResult,
    SupportedLanguage,
    TranslationService,
    SUPPORTED_LANGUAGES,
    DEFAULT_CONFIG,
} from './types';

export interface MultilingualOptions {
    projectRoot?: string;
    config?: Partial<MultilingualConfig>;
}

export interface RunResult {
    scan: ScanResult;
    generation: GenerationResult;
    success: boolean;
    errors: string[];
}

export class Multilingual {
    private configManager: ConfigManager;
    private scanner: ContentScanner;
    private translationManager: TranslationManager;
    private generator: I18nGenerator;
    private githubActions: GitHubActionsSetup;
    private config: MultilingualConfig;

    constructor(options: MultilingualOptions = {}) {
        const projectRoot = options.projectRoot || process.cwd();

        this.configManager = new ConfigManager(projectRoot);
        this.config = { ...DEFAULT_CONFIG, projectRoot, ...options.config };

        this.scanner = new ContentScanner(this.config);
        this.translationManager = new TranslationManager(this.config);
        this.generator = new I18nGenerator(this.config, this.translationManager);
        this.githubActions = new GitHubActionsSetup(this.config);
    }

    /**
     * Initialize and load configuration
     */
    async init(): Promise<MultilingualConfig> {
        this.config = await this.configManager.load();
        this.updateComponents();
        return this.config;
    }

    /**
     * Update all component configurations
     */
    private updateComponents(): void {
        this.scanner = new ContentScanner(this.config);
        this.translationManager = new TranslationManager(this.config);
        this.generator = new I18nGenerator(this.config, this.translationManager);
        this.githubActions = new GitHubActionsSetup(this.config);
    }

    /**
     * Run the full i18n workflow: scan, generate, translate
     */
    async run(
        onProgress?: (stage: string, message: string, progress: number) => void
    ): Promise<RunResult> {
        const errors: string[] = [];

        // Validate configuration
        const validation = this.configManager.validate();
        if (!validation.valid) {
            return {
                scan: { strings: [], files: [], stats: { totalFiles: 0, totalStrings: 0, byType: {}, byFile: {} } },
                generation: { success: false, outputFiles: [], stats: { totalKeys: 0, newKeys: 0, removedKeys: 0, unchangedKeys: 0 } },
                success: false,
                errors: validation.errors,
            };
        }

        // Scan for strings
        onProgress?.('scan', 'Scanning project for user-facing strings...', 0);
        const scanResult = await this.scanner.scan();
        onProgress?.('scan', `Found ${scanResult.strings.length} strings in ${scanResult.files.length} files`, 100);

        if (scanResult.strings.length === 0) {
            errors.push('No translatable strings found');
            return {
                scan: scanResult,
                generation: { success: false, outputFiles: [], stats: { totalKeys: 0, newKeys: 0, removedKeys: 0, unchangedKeys: 0 } },
                success: false,
                errors,
            };
        }

        // Generate translation files
        onProgress?.('generate', 'Generating translation files...', 0);
        const generationResult = await this.generator.generate(
            scanResult.strings,
            (message, completed, total) => {
                const progress = Math.round((completed / total) * 100);
                onProgress?.('generate', message, progress);
            }
        );

        return {
            scan: scanResult,
            generation: generationResult,
            success: generationResult.success,
            errors,
        };
    }

    /**
     * Scan project for strings only (no translation)
     */
    async scan(): Promise<ScanResult> {
        return this.scanner.scan();
    }

    /**
     * Generate/update translation files
     */
    async generate(
        onProgress?: (message: string, completed: number, total: number) => void
    ): Promise<GenerationResult> {
        const scanResult = await this.scanner.scan();
        return this.generator.generate(scanResult.strings, onProgress);
    }

    /**
     * Translate a single string
     */
    async translateString(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage?: SupportedLanguage
    ): Promise<string | null> {
        const result = await this.translationManager.translate(
            text,
            targetLanguage,
            sourceLanguage || this.config.sourceLanguage
        );
        return result.success ? result.text || null : null;
    }

    /**
     * Configure translation service
     */
    setTranslationService(service: TranslationService, apiKey?: string): void {
        this.config.translationService = service;
        if (apiKey) {
            this.config.apiKey = apiKey;
        }
        this.configManager.updateConfig(this.config);
        this.translationManager.setService(service);
        if (apiKey) {
            this.translationManager.setApiKey(apiKey);
        }
    }

    /**
     * Set languages
     */
    setLanguages(source: SupportedLanguage, targets: SupportedLanguage[]): void {
        this.config.sourceLanguage = source;
        this.config.targetLanguages = targets;
        this.configManager.updateConfig(this.config);
        this.updateComponents();
    }

    /**
     * Add a target language
     */
    addLanguage(language: SupportedLanguage): void {
        if (!this.config.targetLanguages.includes(language)) {
            this.config.targetLanguages.push(language);
            this.configManager.updateConfig(this.config);
        }
    }

    /**
     * Remove a target language
     */
    removeLanguage(language: SupportedLanguage): void {
        this.config.targetLanguages = this.config.targetLanguages.filter(l => l !== language);
        this.configManager.updateConfig(this.config);
    }

    /**
     * Validate API key
     */
    async validateApiKey(): Promise<{ valid: boolean; error?: string; usage?: object }> {
        return this.translationManager.validateApiKey();
    }

    /**
     * Setup GitHub Actions
     */
    setupGitHubActions(options?: { prBased?: boolean; validation?: boolean }): {
        workflows: string[];
        secrets: string;
    } {
        const workflows: string[] = [];

        if (options?.prBased) {
            const result = this.githubActions.createPRWorkflow();
            if (result.success) workflows.push(result.filePath);
        } else {
            const result = this.githubActions.createWorkflow();
            if (result.success) workflows.push(result.filePath);
        }

        if (options?.validation) {
            const result = this.githubActions.createValidationWorkflow();
            if (result.success) workflows.push(result.filePath);
        }

        // Enable auto mode in config
        this.config.autoMode = true;
        this.config.githubActions = true;
        this.configManager.updateConfig(this.config);

        return {
            workflows,
            secrets: this.githubActions.getSecretsInstructions(),
        };
    }

    /**
     * Remove GitHub Actions
     */
    removeGitHubActions(): boolean {
        this.config.autoMode = false;
        this.config.githubActions = false;
        this.configManager.updateConfig(this.config);
        return this.githubActions.removeWorkflow();
    }

    /**
     * Save configuration
     */
    async saveConfig(): Promise<string> {
        return this.configManager.save(this.config);
    }

    /**
     * Get current configuration
     */
    getConfig(): MultilingualConfig {
        return { ...this.config };
    }

    /**
     * Update configuration
     */
    updateConfig(updates: Partial<MultilingualConfig>): MultilingualConfig {
        this.config = { ...this.config, ...updates };
        this.configManager.updateConfig(this.config);
        this.updateComponents();
        return this.config;
    }

    /**
     * Get supported languages
     */
    static getSupportedLanguages(): typeof SUPPORTED_LANGUAGES {
        return SUPPORTED_LANGUAGES;
    }

    /**
     * Detect project type
     */
    detectProject(): ReturnType<ConfigManager['detectProjectType']> {
        return this.configManager.detectProjectType();
    }

    /**
     * Create environment template
     */
    createEnvTemplate(): string {
        return this.configManager.createEnvTemplate();
    }

    /**
     * Clean output directory
     */
    cleanOutput(): void {
        this.generator.cleanOutputDirectory();
    }

    /**
     * Check for missing translations
     */
    async checkMissing(): Promise<{
        missing: { language: SupportedLanguage; keys: string[] }[];
        complete: SupportedLanguage[];
    }> {
        // This would compare source language keys with target language files
        // Implementation depends on existing translation files
        const result = {
            missing: [] as { language: SupportedLanguage; keys: string[] }[],
            complete: [] as SupportedLanguage[],
        };

        // For now, return empty - actual implementation would read files
        return result;
    }
}

// Export a factory function for quick usage
export function createMultilingual(options?: MultilingualOptions): Multilingual {
    return new Multilingual(options);
}

// Export default instance creator
export default Multilingual;
