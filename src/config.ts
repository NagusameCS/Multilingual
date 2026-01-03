/**
 * Configuration Manager - Handles loading and saving configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import { MultilingualConfig, DEFAULT_CONFIG, SupportedLanguage, TranslationService } from './types';

const CONFIG_FILE_NAMES = [
    'multilingual.config.json',
    'multilingual.config.js',
    '.multilingualrc',
    '.multilingualrc.json',
];

export class ConfigManager {
    private config: MultilingualConfig;
    private configPath: string | null = null;

    constructor(projectRoot?: string) {
        this.config = {
            ...DEFAULT_CONFIG,
            projectRoot: projectRoot || process.cwd()
        };
    }

    /**
     * Load configuration from file or create default
     */
    async load(): Promise<MultilingualConfig> {
        // Try to find existing config file
        for (const fileName of CONFIG_FILE_NAMES) {
            const filePath = path.join(this.config.projectRoot, fileName);
            if (fs.existsSync(filePath)) {
                this.configPath = filePath;
                const fileConfig = await this.loadConfigFile(filePath);
                this.config = this.mergeConfig(fileConfig);
                break;
            }
        }

        // Also check package.json for "multilingual" key
        const packageJsonPath = path.join(this.config.projectRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                if (packageJson.multilingual) {
                    this.config = this.mergeConfig(packageJson.multilingual);
                }
            } catch (error) {
                // Ignore package.json errors
            }
        }

        // Load API key from environment variables
        if (!this.config.apiKey) {
            if (this.config.translationService === 'deepl') {
                this.config.apiKey = process.env.DEEPL_API_KEY || process.env.MULTILINGUAL_API_KEY;
            } else if (this.config.translationService === 'google') {
                this.config.apiKey = process.env.GOOGLE_TRANSLATE_API_KEY || process.env.MULTILINGUAL_API_KEY;
            }
        }

        return this.config;
    }

    /**
     * Load configuration from a specific file
     */
    private async loadConfigFile(filePath: string): Promise<Partial<MultilingualConfig>> {
        try {
            const ext = path.extname(filePath).toLowerCase();
            const content = fs.readFileSync(filePath, 'utf-8');

            if (ext === '.js') {
                // Dynamic import for JS files
                const absolutePath = path.resolve(filePath);
                delete require.cache[require.resolve(absolutePath)];
                const module = require(absolutePath);
                return module.default || module;
            }

            return JSON.parse(content);
        } catch (error) {
            console.error(`Error loading config from ${filePath}:`, error);
            return {};
        }
    }

    /**
     * Merge partial config with defaults
     */
    private mergeConfig(partial: Partial<MultilingualConfig>): MultilingualConfig {
        return {
            ...this.config,
            ...partial,
            // Merge arrays properly
            include: partial.include || this.config.include,
            exclude: partial.exclude || this.config.exclude,
            fileTypes: partial.fileTypes || this.config.fileTypes,
            targetLanguages: partial.targetLanguages || this.config.targetLanguages,
            ignorePatterns: partial.ignorePatterns || this.config.ignorePatterns,
        };
    }

    /**
     * Save configuration to file
     */
    async save(config?: Partial<MultilingualConfig>): Promise<string> {
        if (config) {
            this.config = this.mergeConfig(config);
        }

        const configToSave = this.getSerializableConfig();
        const filePath = this.configPath || path.join(this.config.projectRoot, 'multilingual.config.json');

        fs.writeFileSync(filePath, JSON.stringify(configToSave, null, 2), 'utf-8');
        this.configPath = filePath;

        return filePath;
    }

    /**
     * Get configuration that can be serialized (without sensitive data)
     */
    private getSerializableConfig(): Partial<MultilingualConfig> {
        const { apiKey, projectRoot, ...rest } = this.config;
        return rest;
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
        this.config = this.mergeConfig(updates);
        return this.config;
    }

    /**
     * Set source language
     */
    setSourceLanguage(language: SupportedLanguage): void {
        this.config.sourceLanguage = language;
    }

    /**
     * Set target languages
     */
    setTargetLanguages(languages: SupportedLanguage[]): void {
        this.config.targetLanguages = languages;
    }

    /**
     * Add target language
     */
    addTargetLanguage(language: SupportedLanguage): void {
        if (!this.config.targetLanguages.includes(language)) {
            this.config.targetLanguages.push(language);
        }
    }

    /**
     * Remove target language
     */
    removeTargetLanguage(language: SupportedLanguage): void {
        this.config.targetLanguages = this.config.targetLanguages.filter(l => l !== language);
    }

    /**
     * Set translation service
     */
    setTranslationService(service: TranslationService): void {
        this.config.translationService = service;
    }

    /**
     * Set API key
     */
    setApiKey(apiKey: string): void {
        this.config.apiKey = apiKey;
    }

    /**
     * Enable GitHub Actions auto mode
     */
    enableAutoMode(): void {
        this.config.autoMode = true;
        this.config.githubActions = true;
    }

    /**
     * Disable GitHub Actions auto mode
     */
    disableAutoMode(): void {
        this.config.autoMode = false;
        this.config.githubActions = false;
    }

    /**
     * Validate configuration
     */
    validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Check source language
        if (!this.config.sourceLanguage) {
            errors.push('Source language is required');
        }

        // Check target languages
        if (this.config.targetLanguages.length === 0) {
            errors.push('At least one target language is required');
        }

        // Check for duplicate languages
        if (this.config.targetLanguages.includes(this.config.sourceLanguage)) {
            errors.push('Target languages should not include source language');
        }

        // Check output directory
        if (!this.config.outputDir) {
            errors.push('Output directory is required');
        }

        // Check translation service configuration
        if (this.config.translationService !== 'none' && !this.config.apiKey) {
            errors.push(`API key is required for ${this.config.translationService} translation service`);
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Create environment file template
     */
    createEnvTemplate(): string {
        const envPath = path.join(this.config.projectRoot, '.env.example');

        const content = `# Multilingual Auto-i18n Configuration
# Copy this file to .env and fill in your API keys

# DeepL API Key (get one at https://www.deepl.com/pro-api)
DEEPL_API_KEY=

# Google Cloud Translation API Key (get one at https://console.cloud.google.com/apis/credentials)
GOOGLE_TRANSLATE_API_KEY=

# Or use a generic key name (will be used if service-specific key is not set)
MULTILINGUAL_API_KEY=
`;

        fs.writeFileSync(envPath, content, 'utf-8');
        return envPath;
    }

    /**
     * Add to .gitignore
     */
    updateGitignore(): void {
        const gitignorePath = path.join(this.config.projectRoot, '.gitignore');

        const entriesToAdd = [
            '',
            '# Multilingual Auto-i18n',
            '.env',
            '.env.local',
        ];

        let content = '';
        if (fs.existsSync(gitignorePath)) {
            content = fs.readFileSync(gitignorePath, 'utf-8');
        }

        // Check if entries already exist
        const existingLines = content.split('\n');
        const newEntries = entriesToAdd.filter(entry => !existingLines.includes(entry));

        if (newEntries.length > 0) {
            content += '\n' + newEntries.join('\n');
            fs.writeFileSync(gitignorePath, content, 'utf-8');
        }
    }

    /**
     * Detect project type and adjust defaults
     */
    detectProjectType(): {
        type: string;
        framework?: string;
        recommendations: Partial<MultilingualConfig>;
    } {
        const projectRoot = this.config.projectRoot;
        let type = 'generic';
        let framework: string | undefined;
        const recommendations: Partial<MultilingualConfig> = {};

        // Check for package.json
        const packageJsonPath = path.join(projectRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

                // Detect framework
                if (deps.next) {
                    framework = 'nextjs';
                    recommendations.include = ['app/**/*', 'pages/**/*', 'components/**/*', 'src/**/*'];
                    recommendations.outputDir = './public/locales';
                } else if (deps.react || deps['react-dom']) {
                    framework = 'react';
                    recommendations.include = ['src/**/*', 'components/**/*'];
                } else if (deps.vue) {
                    framework = 'vue';
                    recommendations.include = ['src/**/*', 'components/**/*', 'views/**/*'];
                } else if (deps.svelte) {
                    framework = 'svelte';
                    recommendations.include = ['src/**/*'];
                } else if (deps.angular) {
                    framework = 'angular';
                    recommendations.include = ['src/**/*'];
                } else if (deps.express) {
                    framework = 'express';
                    recommendations.include = ['src/**/*', 'routes/**/*', 'views/**/*'];
                }

                type = 'node';
            } catch (error) {
                // Ignore
            }
        }

        // Check for Python project
        if (fs.existsSync(path.join(projectRoot, 'requirements.txt')) ||
            fs.existsSync(path.join(projectRoot, 'setup.py')) ||
            fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
            type = 'python';
            recommendations.fileTypes = ['.py', '.html', '.jinja', '.jinja2'];

            // Check for Django
            if (fs.existsSync(path.join(projectRoot, 'manage.py'))) {
                framework = 'django';
                recommendations.outputDir = './locale';
            }

            // Check for Flask
            if (fs.existsSync(path.join(projectRoot, 'app.py')) ||
                fs.readdirSync(projectRoot).some(f => f.includes('flask'))) {
                framework = 'flask';
                recommendations.include = ['**/*.py', 'templates/**/*'];
            }
        }

        // Check for Ruby project
        if (fs.existsSync(path.join(projectRoot, 'Gemfile'))) {
            type = 'ruby';
            recommendations.fileTypes = ['.rb', '.erb', '.haml', '.slim'];

            if (fs.existsSync(path.join(projectRoot, 'config', 'routes.rb'))) {
                framework = 'rails';
                recommendations.outputDir = './config/locales';
                recommendations.include = ['app/**/*', 'lib/**/*'];
            }
        }

        // Check for Go project
        if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
            type = 'go';
            recommendations.fileTypes = ['.go', '.html', '.tmpl'];
        }

        // Check for PHP project
        if (fs.existsSync(path.join(projectRoot, 'composer.json'))) {
            type = 'php';
            recommendations.fileTypes = ['.php', '.blade.php', '.twig'];

            // Check for Laravel
            if (fs.existsSync(path.join(projectRoot, 'artisan'))) {
                framework = 'laravel';
                recommendations.outputDir = './resources/lang';
                recommendations.include = ['app/**/*', 'resources/**/*'];
            }
        }

        return { type, framework, recommendations };
    }
}
