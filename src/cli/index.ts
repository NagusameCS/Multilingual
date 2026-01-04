#!/usr/bin/env node

/**
 * multilingual-cli v2.0.0
 * Interactive command-line interface for automated internationalization
 * 
 * Features:
 * - 6 translation services (4 free, 2 paid)
 * - Multiple export formats (JSON, XLIFF, PO, CSV, Android, iOS, ARB)
 * - Watch mode for development
 * - Translation memory with fuzzy matching
 * - Statistics and cost estimation
 * - Pseudo-localization for testing
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { Multilingual } from '../core';
import { ConfigManager } from '../config';
import { getApiKeyInstructions, ExtendedTranslationService, SecurityUtils, TranslationManager } from '../translation';
import { GitHubActionsSetup } from '../github-actions';
import { calculateStats, formatStatsReport, saveStatsReport } from '../stats';
import { exportToFile, importFromFile, convertFormat, TranslationDocument } from '../formats';
import { createTranslationWatchSession, formatWatchStats } from '../watch';
import {
    SUPPORTED_LANGUAGES,
    SupportedLanguage,
    TranslationService,
} from '../types';

const program = new Command();

// ASCII Art Banner
const banner = `
${chalk.cyan('╔════════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('🌐 multilingual-cli')} ${chalk.gray('v2.0.2')}                            ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Automated internationalization for any project')}            ${chalk.cyan('║')}
${chalk.cyan('╚════════════════════════════════════════════════════════════╝')}
`;

program
    .name('multilingual')
    .description('Automated i18n detection and translation tool with free translation options')
    .version('2.0.2');

/**
 * Init command - Interactive setup wizard
 */
program
    .command('init')
    .description('Initialize multilingual in your project with interactive setup')
    .option('-y, --yes', 'Use default settings without prompts')
    .action(async (options) => {
        console.log(banner);

        const multilingual = new Multilingual();
        const configManager = new ConfigManager();

        // Detect project type
        const projectInfo = configManager.detectProjectType();
        console.log(chalk.blue(`\n📦 Detected project type: ${chalk.bold(projectInfo.type)}`));
        if (projectInfo.framework) {
            console.log(chalk.blue(`📚 Framework: ${chalk.bold(projectInfo.framework)}`));
        }

        if (options.yes) {
            const config = await multilingual.init();
            await multilingual.saveConfig();
            console.log(chalk.green('\n✅ Configuration saved with defaults!'));
            return;
        }

        // Interactive setup with all service options
        const answers = await inquirer.prompt<{
            sourceLanguage: SupportedLanguage;
            targetLanguages: SupportedLanguage[];
            translationService: ExtendedTranslationService;
            apiKey?: string;
            outputDir: string;
            outputFormat: 'json' | 'ts' | 'js';
            setupGitHub: boolean;
        }>([
            {
                type: 'list',
                name: 'sourceLanguage',
                message: 'What is your source language?',
                choices: SUPPORTED_LANGUAGES.map(l => ({
                    name: `${l.name} (${l.nativeName})`,
                    value: l.code,
                })),
                default: 'en',
            },
            {
                type: 'checkbox',
                name: 'targetLanguages',
                message: 'Select target languages to translate to:',
                choices: SUPPORTED_LANGUAGES.filter(l => l.code !== 'en').map(l => ({
                    name: `${l.name} (${l.nativeName})`,
                    value: l.code,
                })),
                validate: (input) => input.length > 0 || 'Please select at least one language',
            },
            {
                type: 'list',
                name: 'translationService',
                message: 'Which translation service would you like to use?',
                choices: [
                    new inquirer.Separator('── 🆓 FREE (No billing required) ──'),
                    { name: '🌐 LibreTranslate - Open source, no API key', value: 'libretranslate' },
                    { name: '🔒 Lingva - Privacy-focused, no API key', value: 'lingva' },
                    { name: '💾 MyMemory - 10k chars/day free', value: 'mymemory' },
                    { name: '🧪 Pseudo - Fake translations for testing', value: 'pseudo' },
                    new inquirer.Separator('── 💳 PAID (Free tier available) ──'),
                    { name: '🔷 DeepL - High quality (500k/month free)', value: 'deepl' },
                    { name: '🔵 Google - Wide support (500k/month free)', value: 'google' },
                    new inquirer.Separator('──────────────────────────────────'),
                    { name: '⬜ None - I\'ll translate manually', value: 'none' },
                ],
            },
            {
                type: 'input',
                name: 'apiKey',
                message: (answers: { translationService: ExtendedTranslationService }) => {
                    if (answers.translationService === 'deepl') return 'Enter your DeepL API key:';
                    if (answers.translationService === 'google') return 'Enter your Google API key:';
                    if (answers.translationService === 'mymemory') return 'Enter your email for higher limits (optional):';
                    return 'Enter custom instance URL (optional):';
                },
                when: (answers) => !['none', 'pseudo', 'libretranslate', 'lingva'].includes(answers.translationService),
            },
            {
                type: 'input',
                name: 'outputDir',
                message: 'Where should translation files be saved?',
                default: projectInfo.recommendations.outputDir || './locales',
            },
            {
                type: 'list',
                name: 'outputFormat',
                message: 'What format for translation files?',
                choices: [
                    { name: 'JSON (.json)', value: 'json' },
                    { name: 'TypeScript (.ts)', value: 'ts' },
                    { name: 'JavaScript (.js)', value: 'js' },
                ],
                default: 'json',
            },
            {
                type: 'confirm',
                name: 'setupGitHub',
                message: 'Would you like to setup GitHub Actions for automatic translation?',
                default: false,
            },
        ]);

        // Show API key instructions if needed
        if (['deepl', 'google'].includes(answers.translationService) && !answers.apiKey) {
            console.log(getApiKeyInstructions(answers.translationService));

            const apiKeyAnswer = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'apiKey',
                    message: 'Enter your API key (or press Enter to skip for now):',
                },
            ]);
            answers.apiKey = apiKeyAnswer.apiKey;
        }

        // Update configuration
        multilingual.updateConfig({
            sourceLanguage: answers.sourceLanguage,
            targetLanguages: answers.targetLanguages,
            translationService: ['deepl', 'google', 'none'].includes(answers.translationService)
                ? answers.translationService as TranslationService
                : 'none',
            apiKey: answers.apiKey,
            outputDir: answers.outputDir,
            outputFormat: answers.outputFormat,
        });

        // Validate API key if provided
        if (answers.apiKey && ['deepl', 'google'].includes(answers.translationService)) {
            const spinner = ora('Validating API key...').start();
            const validation = await multilingual.validateApiKey();

            if (validation.valid) {
                spinner.succeed('API key is valid!');
            } else {
                spinner.warn(`API key validation failed: ${validation.error}`);
            }
        }

        // Setup GitHub Actions
        if (answers.setupGitHub) {
            await setupGitHubActionsInteractive(multilingual);
        }

        // Save configuration
        const configPath = await multilingual.saveConfig();
        console.log(chalk.green(`\n✅ Configuration saved to: ${configPath}`));

        // Create env template
        const envPath = multilingual.createEnvTemplate();
        console.log(chalk.blue(`📝 Environment template created: ${envPath}`));

        // Ask to run initial scan
        const { runNow } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'runNow',
                message: 'Would you like to scan and translate now?',
                default: true,
            },
        ]);

        if (runNow) {
            await runTranslation(multilingual, answers.translationService);
        } else {
            console.log(chalk.blue('\n💡 Run "multilingual run" when you\'re ready to scan and translate.'));
        }
    });

/**
 * Run command - Execute scan and translation
 */
program
    .command('run')
    .description('Scan project and generate translations')
    .option('-a, --auto', 'Run in non-interactive mode')
    .option('-f, --force', 'Force re-translation of all strings')
    .option('-s, --service <service>', 'Translation service to use')
    .action(async (options) => {
        console.log(banner);

        const multilingual = new Multilingual();
        await multilingual.init();

        await runTranslation(multilingual, options.service, options.auto);
    });

/**
 * Scan command - Scan only, no translation
 */
program
    .command('scan')
    .description('Scan project for translatable strings')
    .option('-a, --auto', 'Run in non-interactive mode')
    .option('-o, --output <file>', 'Output scan results to file')
    .action(async (options) => {
        console.log(banner);

        const multilingual = new Multilingual();
        await multilingual.init();

        const spinner = ora('Scanning project...').start();

        try {
            const result = await multilingual.scan();
            spinner.succeed(`Found ${result.strings.length} strings in ${result.files.length} files`);

            console.log(chalk.blue('\n📊 Scan Statistics:'));
            console.log(`   Total files scanned: ${result.stats.totalFiles}`);
            console.log(`   Total strings found: ${result.stats.totalStrings}`);
            console.log('\n   By type:');
            for (const [type, count] of Object.entries(result.stats.byType)) {
                console.log(`     ${type}: ${count}`);
            }

            if (options.output) {
                fs.writeFileSync(options.output, JSON.stringify(result, null, 2));
                console.log(chalk.green(`\n📄 Results saved to: ${options.output}`));
            }

            // Show sample strings
            if (result.strings.length > 0 && !options.auto) {
                console.log(chalk.blue('\n📝 Sample strings found:'));
                const samples = result.strings.slice(0, 5);
                for (const str of samples) {
                    console.log(chalk.gray(`   "${str.value}" (${str.file}:${str.line})`));
                }
                if (result.strings.length > 5) {
                    console.log(chalk.gray(`   ... and ${result.strings.length - 5} more`));
                }
            }
        } catch (error) {
            spinner.fail('Scan failed');
            console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
            process.exit(1);
        }
    });

/**
 * Translate-file command - Translate an existing JSON file
 */
program
    .command('translate-file')
    .description('Translate an existing JSON translation file')
    .requiredOption('-s, --source <file>', 'Source JSON file path')
    .requiredOption('-o, --output <dir>', 'Output directory for translated files')
    .option('-t, --targets <langs>', 'Comma-separated target language codes')
    .option('--service <service>', 'Translation service (lingva|mymemory|libretranslate|pseudo|dictionary|local|piglatin|emoji|leet|reverse|mirror|morse|nato|deepl|google)', 'lingva')
    .option('--api-key <key>', 'API key for translation service (optional for free services)')
    .option('--source-lang <lang>', 'Source language code', 'en')
    .action(async (options) => {
        console.log(banner);

        const sourcePath = path.resolve(options.source);
        if (!fs.existsSync(sourcePath)) {
            console.log(chalk.red(`\n❌ Source file not found: ${sourcePath}`));
            process.exit(1);
        }

        let targetLangs: SupportedLanguage[] = [];
        if (options.targets) {
            targetLangs = options.targets.split(',').map((l: string) => l.trim()) as SupportedLanguage[];
        } else {
            targetLangs = SUPPORTED_LANGUAGES
                .map(l => l.code)
                .filter(c => c !== options.sourceLang) as SupportedLanguage[];
        }

        // Show service info
        const service = options.service as ExtendedTranslationService;
        const freeServices = [
            'libretranslate', 'lingva', 'mymemory', 'pseudo',
            'dictionary', 'local', 'piglatin', 'emoji', 'leet',
            'reverse', 'mirror', 'uppercase', 'morse', 'nato'
        ];
        const isFreeService = freeServices.includes(service);

        console.log(chalk.blue(`\n📂 Source file: ${chalk.bold(sourcePath)}`));
        console.log(chalk.blue(`📁 Output directory: ${chalk.bold(options.output)}`));
        console.log(chalk.blue(`🌐 Source language: ${chalk.bold(options.sourceLang)}`));
        console.log(chalk.blue(`🎯 Target languages: ${chalk.bold(targetLangs.length)} languages`));
        console.log(chalk.blue(`🔧 Translation service: ${chalk.bold(service)} ${isFreeService ? chalk.green('(FREE)') : ''}`));

        if (!isFreeService && !options.apiKey) {
            console.log(chalk.yellow(`\n⚠️  ${service} requires an API key. Use --api-key <key>`));
            console.log(getApiKeyInstructions(service));
            process.exit(1);
        }

        const multilingual = new Multilingual({
            config: {
                sourceLanguage: options.sourceLang as SupportedLanguage,
                targetLanguages: targetLangs,
                translationService: ['deepl', 'google'].includes(service) ? service as TranslationService : 'none',
                apiKey: options.apiKey,
            }
        });

        // Set extended service
        (multilingual as any).translationManager?.setExtendedService?.(service);

        const spinner = ora('Translating...').start();
        const startTime = Date.now();
        let languagesCompleted = 0;
        const totalLanguages = targetLangs.length;

        const formatTime = (ms: number): string => {
            if (ms < 1000) return `${ms}ms`;
            const seconds = Math.floor(ms / 1000);
            if (seconds < 60) return `${seconds}s`;
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}m ${remainingSeconds}s`;
        };

        const result = await multilingual.translateFile(
            sourcePath,
            path.resolve(options.output),
            (lang, progress) => {
                if (lang === 'done') {
                    spinner.text = 'Finalizing...';
                } else {
                    languagesCompleted++;
                    const elapsed = Date.now() - startTime;
                    const avgTimePerLang = elapsed / languagesCompleted;
                    const remainingLangs = totalLanguages - languagesCompleted;
                    const eta = Math.round(avgTimePerLang * remainingLangs);
                    
                    const etaText = remainingLangs > 0 ? ` • ETA: ${formatTime(eta)}` : '';
                    spinner.text = `Translating to ${lang}... (${languagesCompleted}/${totalLanguages})${etaText}`;
                }
            }
        );

        const totalTime = Date.now() - startTime;

        if (result.success) {
            spinner.succeed(`Successfully translated to ${result.files.length} files in ${formatTime(totalTime)}`);
            console.log(chalk.green('\n✅ Generated files:'));
            result.files.forEach(f => console.log(`   ${chalk.gray(f)}`));
            console.log(chalk.gray(`\n⏱️  Total time: ${formatTime(totalTime)} (${Math.round(totalTime / targetLangs.length)}ms per language)`));
        } else {
            spinner.fail('Translation completed with errors');
            result.errors.forEach(e => console.log(chalk.red(`   ❌ ${e}`)));
        }
    });

/**
 * Pseudo command - Generate pseudo-translations for testing
 */
program
    .command('pseudo')
    .description('Generate pseudo-translations for UI testing')
    .option('-s, --source <file>', 'Source JSON file path')
    .option('-o, --output <file>', 'Output file path')
    .action(async (options) => {
        console.log(banner);
        console.log(chalk.blue('\n🧪 Pseudo-localization Generator\n'));

        const manager = new TranslationManager();

        if (options.source) {
            const sourcePath = path.resolve(options.source);
            if (!fs.existsSync(sourcePath)) {
                console.log(chalk.red(`❌ Source file not found: ${sourcePath}`));
                process.exit(1);
            }

            const content = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
            const pseudo: Record<string, string> = {};

            const processObject = (obj: Record<string, unknown>, prefix = '') => {
                for (const [key, value] of Object.entries(obj)) {
                    const fullKey = prefix ? `${prefix}.${key}` : key;
                    if (typeof value === 'string') {
                        pseudo[fullKey] = manager.generatePseudoTranslation(value);
                    } else if (typeof value === 'object' && value !== null) {
                        processObject(value as Record<string, unknown>, fullKey);
                    }
                }
            };

            processObject(content);

            const outputPath = options.output || sourcePath.replace('.json', '.pseudo.json');
            fs.writeFileSync(outputPath, JSON.stringify(pseudo, null, 2));

            console.log(chalk.green(`✅ Generated: ${outputPath}`));
            console.log(chalk.gray('\nSample:'));
            const samples = Object.entries(pseudo).slice(0, 3);
            for (const [key, value] of samples) {
                console.log(chalk.gray(`   ${key}: ${value}`));
            }
        } else {
            // Interactive mode
            const { text } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'text',
                    message: 'Enter text to pseudo-translate:',
                },
            ]);

            const result = manager.generatePseudoTranslation(text);
            console.log(chalk.green(`\n   Original: ${text}`));
            console.log(chalk.blue(`   Pseudo:   ${result}`));
        }
    });

/**
 * Watch command - Watch for file changes
 */
program
    .command('watch')
    .description('Watch for file changes and auto-translate')
    .option('-d, --dir <directory>', 'Directory to watch', 'src')
    .action(async (options) => {
        console.log(banner);
        console.log(chalk.blue('\n👀 Watch Mode\n'));
        console.log(chalk.gray('Watching for file changes. Press Ctrl+C to stop.\n'));

        const multilingual = new Multilingual();
        await multilingual.init();

        const session = createTranslationWatchSession(
            process.cwd(),
            async (filePath) => {
                console.log(chalk.blue(`\n📝 File changed: ${filePath}`));
                // Trigger translation
                const result = await multilingual.run();
                if (result.success) {
                    console.log(chalk.green(`   ✅ Updated ${result.generation.outputFiles.length} files`));
                }
            },
            {
                paths: [path.join(process.cwd(), options.dir)],
            }
        );

        await session.start();

        // Handle shutdown
        process.on('SIGINT', () => {
            console.log(chalk.yellow('\n\n👋 Stopping watch mode...'));
            session.stop();
            console.log(formatWatchStats(session.getStats()));
            process.exit(0);
        });
    });

/**
 * Stats command - Show translation statistics
 */
program
    .command('stats')
    .description('Show translation statistics and cost estimates')
    .option('--report', 'Generate detailed report files')
    .option('--format <format>', 'Report format (text|json|markdown|all)', 'text')
    .action(async (options) => {
        console.log(banner);

        const multilingual = new Multilingual();
        const config = await multilingual.init();

        const spinner = ora('Calculating statistics...').start();

        try {
            const scanResult = await multilingual.scan();
            const existingTranslations = new Map<SupportedLanguage, Record<string, string>>();

            // Load existing translations
            for (const lang of config.targetLanguages) {
                const filePath = path.join(config.outputDir, `${lang}.json`);
                if (fs.existsSync(filePath)) {
                    existingTranslations.set(lang, JSON.parse(fs.readFileSync(filePath, 'utf-8')));
                }
            }

            const stats = calculateStats(scanResult.strings, existingTranslations, config.targetLanguages);
            spinner.succeed('Statistics calculated');

            console.log('\n' + formatStatsReport(stats));

            if (options.report) {
                const reportDir = path.join(process.cwd(), '.multilingual', 'reports');
                const files = saveStatsReport(stats, reportDir, options.format);
                console.log(chalk.green('\n📊 Reports saved:'));
                files.forEach(f => console.log(`   ${chalk.gray(f)}`));
            }
        } catch (error) {
            spinner.fail('Failed to calculate statistics');
            console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        }
    });

/**
 * Export command - Export translations to different formats
 */
program
    .command('export')
    .description('Export translations to different formats (XLIFF, PO, CSV, etc.)')
    .requiredOption('-i, --input <file>', 'Target translations JSON file')
    .requiredOption('-o, --output <file>', 'Output file path')
    .option('--source-file <file>', 'Source translations JSON file (for proper bilingual export)')
    .option('-f, --format <format>', 'Output format (xliff|xliff2|po|csv|android|ios|arb)', 'xliff')
    .option('-s, --source-lang <lang>', 'Source language', 'en')
    .option('-t, --target-lang <lang>', 'Target language', 'en')
    .action(async (options) => {
        console.log(banner);

        const inputPath = path.resolve(options.input);
        if (!fs.existsSync(inputPath)) {
            console.log(chalk.red(`❌ Input file not found: ${inputPath}`));
            process.exit(1);
        }

        // Read target translations
        const targetContent = fs.readFileSync(inputPath, 'utf-8');
        const targetData = JSON.parse(targetContent);

        // Read source translations if provided
        let sourceData: Record<string, string> | null = null;
        if (options.sourceFile) {
            const sourceFilePath = path.resolve(options.sourceFile);
            if (fs.existsSync(sourceFilePath)) {
                const sourceContent = fs.readFileSync(sourceFilePath, 'utf-8');
                sourceData = JSON.parse(sourceContent);
            }
        }

        const spinner = ora('Exporting...').start();

        try {
            // Build translation document with proper source/target
            const doc: TranslationDocument = {
                sourceLanguage: options.sourceLang,
                targetLanguage: options.targetLang,
                units: Object.entries(targetData).map(([key, value]) => ({
                    key,
                    source: sourceData ? (sourceData[key] || String(value)) : String(value),
                    target: String(value),
                })),
            };

            exportToFile(doc, options.output, options.format);

            spinner.succeed(`Exported to: ${options.output}`);
            console.log(chalk.gray(`   Format: ${options.format.toUpperCase()}`));
            console.log(chalk.gray(`   Units: ${doc.units.length}`));
            if (sourceData) {
                console.log(chalk.gray(`   Source file: ${options.sourceFile}`));
            }
        } catch (error) {
            spinner.fail('Export failed');
            console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        }
    });

/**
 * Import command - Import translations from different formats
 */
program
    .command('import')
    .description('Import translations from different formats')
    .requiredOption('-i, --input <file>', 'Input file (XLIFF, PO, CSV, etc.)')
    .requiredOption('-o, --output <file>', 'Output JSON file')
    .action(async (options) => {
        console.log(banner);

        const inputPath = path.resolve(options.input);
        if (!fs.existsSync(inputPath)) {
            console.log(chalk.red(`❌ Input file not found: ${inputPath}`));
            process.exit(1);
        }

        const spinner = ora('Importing...').start();

        try {
            const doc = importFromFile(inputPath);
            exportToFile(doc, options.output, 'json');

            spinner.succeed(`Imported to: ${options.output}`);
            console.log(chalk.gray(`   Units: ${doc.units.length}`));
            console.log(chalk.gray(`   Language: ${doc.targetLanguage}`));
        } catch (error) {
            spinner.fail('Import failed');
            console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        }
    });

/**
 * Services command - List available translation services
 */
program
    .command('services')
    .description('List available translation services')
    .option('--details <service>', 'Show detailed setup instructions for a service')
    .action((options) => {
        console.log(banner);

        if (options.details) {
            console.log(getApiKeyInstructions(options.details as ExtendedTranslationService));
            return;
        }

        console.log(chalk.blue('\n📋 Available Translation Services\n'));

        console.log(chalk.green.bold('� FREE ONLINE (No billing required):'));
        console.log(`   ${chalk.bold('lingva')} - Privacy-focused Google Translate proxy ${chalk.green('[RECOMMENDED]')}`);
        console.log(chalk.gray('      No API key needed. No tracking. Most reliable.'));
        console.log(`   ${chalk.bold('mymemory')} - Free translation memory`);
        console.log(chalk.gray('      10,000 chars/day free. 100,000 with email registration.'));
        console.log(`   ${chalk.bold('libretranslate')} - Open source, uses public instances`);
        console.log(chalk.gray('      No API key needed. May be slow or unavailable.'));

        console.log(chalk.cyan.bold('\n📂 OFFLINE (No internet required):'));
        console.log(`   ${chalk.bold('dictionary')} - Built-in phrase dictionary`);
        console.log(chalk.gray('      Common phrases in 10 languages. No API calls.'));
        console.log(`   ${chalk.bold('local')} - Custom local JSON dictionaries`);
        console.log(chalk.gray('      Uses .multilingual/dictionaries/*.json files.'));

        console.log(chalk.magenta.bold('\n🎨 CREATIVE (For testing & fun):'));
        console.log(`   ${chalk.bold('pseudo')} - Pseudo-localization`);
        console.log(chalk.gray('      [Ḥḛŀŀő Ẇőřŀḓ~~~] - Tests UI string expansion.'));
        console.log(`   ${chalk.bold('piglatin')} - Pig Latin translation`);
        console.log(chalk.gray('      "Hello World" → "Ellohay Orldway"'));
        console.log(`   ${chalk.bold('emoji')} - Emoji translation`);
        console.log(chalk.gray('      "Hello" → "👋" - Words to emojis.'));
        console.log(`   ${chalk.bold('leet')} - L33t speak`);
        console.log(chalk.gray('      "Hello" → "#3110" - Hacker style.'));
        console.log(`   ${chalk.bold('reverse')} - Reversed text (RTL testing)`);
        console.log(chalk.gray('      "Hello" → "olleH" - Tests RTL layouts.'));
        console.log(`   ${chalk.bold('mirror')} - Upside-down text`);
        console.log(chalk.gray('      "Hello" → "oןןǝH" - Flipped characters.'));
        console.log(`   ${chalk.bold('morse')} - Morse code`);
        console.log(chalk.gray('      "Hi" → ".... .." - Dots and dashes.'));
        console.log(`   ${chalk.bold('nato')} - NATO phonetic alphabet`);
        console.log(chalk.gray('      "Hi" → "Hotel India" - Aviation alphabet.'));
        console.log(`   ${chalk.bold('uppercase')} - UPPERCASE transformation`);
        console.log(chalk.gray('      "Hello" → "HELLO" - Emphasis testing.'));

        console.log(chalk.yellow.bold('\n💳 PAID (Free tier available):'));
        console.log(`   ${chalk.bold('deepl')} - High quality neural translation`);
        console.log(chalk.gray('      500,000 chars/month free. Best quality.'));
        console.log(`   ${chalk.bold('google')} - Google Cloud Translation`);
        console.log(chalk.gray('      500,000 chars/month free (first year).'));

        console.log(chalk.gray('\n💡 Use --details <service> for setup instructions'));
    });

/**
 * Languages command - List all supported languages
 */
program
    .command('languages')
    .description('List all supported languages')
    .option('--json', 'Output as JSON')
    .action((options) => {
        if (options.json) {
            console.log(JSON.stringify(SUPPORTED_LANGUAGES, null, 2));
            return;
        }

        console.log(banner);
        console.log(chalk.blue('\n🌍 Supported Languages:\n'));

        for (const lang of SUPPORTED_LANGUAGES) {
            const rtlBadge = lang.rtl ? chalk.yellow(' [RTL]') : '';
            console.log(`   ${chalk.bold(lang.code.padEnd(6))} ${lang.name} (${lang.nativeName})${rtlBadge}`);
        }
    });

/**
 * Validate command - Validate translation files
 */
program
    .command('validate')
    .description('Validate translation files for completeness and quality')
    .action(async () => {
        console.log(banner);

        const multilingual = new Multilingual();
        await multilingual.init();

        const spinner = ora('Validating translations...').start();

        try {
            const result = await multilingual.checkMissing();

            if (result.missing.length === 0) {
                spinner.succeed('All translations are complete!');
            } else {
                spinner.warn('Some translations are missing');

                for (const lang of result.missing) {
                    console.log(chalk.yellow(`\n${lang.language}: ${lang.keys.length} missing keys`));
                    for (const key of lang.keys.slice(0, 5)) {
                        console.log(chalk.gray(`   - ${key}`));
                    }
                    if (lang.keys.length > 5) {
                        console.log(chalk.gray(`   ... and ${lang.keys.length - 5} more`));
                    }
                }
            }

            if (result.complete.length > 0) {
                console.log(chalk.green(`\n✅ Complete languages: ${result.complete.join(', ')}`));
            }
        } catch (error) {
            spinner.fail('Validation failed');
            console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
            process.exit(1);
        }
    });

/**
 * Config command - View/edit configuration
 */
program
    .command('config')
    .description('View or modify configuration')
    .option('-e, --edit', 'Edit configuration interactively')
    .option('--show', 'Show current configuration')
    .option('--key <key>', 'Get specific config value')
    .option('--set <key=value>', 'Set a config value')
    .action(async (options) => {
        console.log(banner);

        const multilingual = new Multilingual();
        const config = await multilingual.init();

        if (options.key) {
            const value = (config as any)[options.key];
            console.log(value !== undefined ? value : chalk.red(`Unknown key: ${options.key}`));
            return;
        }

        if (options.set) {
            const [key, ...valueParts] = options.set.split('=');
            const value = valueParts.join('=');
            multilingual.updateConfig({ [key]: value });
            await multilingual.saveConfig();
            console.log(chalk.green(`✅ Set ${key} = ${SecurityUtils.looksLikeApiKey(value) ? '[REDACTED]' : value}`));
            return;
        }

        if (options.show || !options.edit) {
            console.log(chalk.blue('\n📋 Current Configuration:\n'));
            // Mask API key in output
            const safeConfig = { ...config };
            if (safeConfig.apiKey) {
                safeConfig.apiKey = SecurityUtils.maskApiKey(safeConfig.apiKey);
            }
            console.log(chalk.gray(JSON.stringify(safeConfig, null, 2)));
            return;
        }

        // Interactive edit
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'field',
                message: 'What would you like to change?',
                choices: [
                    { name: 'Source language', value: 'sourceLanguage' },
                    { name: 'Target languages', value: 'targetLanguages' },
                    { name: 'Translation service', value: 'translationService' },
                    { name: 'API key', value: 'apiKey' },
                    { name: 'Output directory', value: 'outputDir' },
                    { name: 'Output format', value: 'outputFormat' },
                    { name: 'GitHub Actions', value: 'githubActions' },
                ],
            },
        ]);

        switch (answers.field) {
            case 'sourceLanguage':
            case 'targetLanguages':
                await handleLanguageConfig(multilingual, answers.field);
                break;
            case 'translationService':
                await handleServiceConfig(multilingual);
                break;
            case 'apiKey':
                await handleApiKeyConfig(multilingual);
                break;
            case 'githubActions':
                await setupGitHubActionsInteractive(multilingual);
                break;
            default:
                const valueAnswer = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'value',
                        message: `Enter new value for ${answers.field}:`,
                        default: (config as any)[answers.field],
                    },
                ]);
                multilingual.updateConfig({ [answers.field]: valueAnswer.value });
        }

        await multilingual.saveConfig();
        console.log(chalk.green('\n✅ Configuration saved!'));
    });

/**
 * GitHub command - Manage GitHub Actions
 */
program
    .command('github')
    .description('Setup or manage GitHub Actions integration')
    .option('--setup', 'Setup GitHub Actions workflows')
    .option('--remove', 'Remove GitHub Actions workflows')
    .action(async (options) => {
        console.log(banner);

        const multilingual = new Multilingual();
        await multilingual.init();

        if (options.remove) {
            const spinner = ora('Removing GitHub Actions workflows...').start();
            const success = multilingual.removeGitHubActions();
            if (success) {
                spinner.succeed('GitHub Actions workflows removed');
            } else {
                spinner.fail('Failed to remove workflows');
            }
            return;
        }

        await setupGitHubActionsInteractive(multilingual);
    });

/**
 * Clean command - Clean generated files
 */
program
    .command('clean')
    .description('Remove generated translation files')
    .option('-f, --force', 'Skip confirmation')
    .action(async (options) => {
        console.log(banner);

        if (!options.force) {
            const { confirm } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirm',
                    message: 'This will remove all generated translation files. Are you sure?',
                    default: false,
                },
            ]);

            if (!confirm) {
                console.log(chalk.yellow('Cancelled.'));
                return;
            }
        }

        const multilingual = new Multilingual();
        await multilingual.init();

        const spinner = ora('Cleaning output directory...').start();
        multilingual.cleanOutput();
        spinner.succeed('Output directory cleaned');
    });

// Helper functions

async function runTranslation(
    multilingual: Multilingual,
    service?: ExtendedTranslationService,
    auto = false
): Promise<void> {
    const config = multilingual.getConfig();

    // Validate configuration
    if (config.targetLanguages.length === 0) {
        console.log(chalk.yellow('\n⚠️  No target languages configured.'));
        if (!auto) {
            const { languages } = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'languages',
                    message: 'Select target languages:',
                    choices: SUPPORTED_LANGUAGES.filter(l => l.code !== config.sourceLanguage).map(l => ({
                        name: `${l.name} (${l.nativeName})`,
                        value: l.code,
                    })),
                    validate: (input) => input.length > 0 || 'Please select at least one language',
                },
            ]);
            multilingual.setLanguages(config.sourceLanguage, languages);
        } else {
            console.log(chalk.red('Please configure target languages first.'));
            process.exit(1);
        }
    }

    // Check if we're using a free service
    const effectiveService = service || config.translationService;
    const isFreeService = ['libretranslate', 'lingva', 'mymemory', 'pseudo'].includes(effectiveService);

    // Check API key for paid services
    if (!isFreeService && config.translationService !== 'none' && !config.apiKey) {
        console.log(chalk.yellow(`\n⚠️  No API key configured for ${config.translationService}.`));
        if (!auto) {
            console.log(getApiKeyInstructions(config.translationService));
            const { apiKey } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'apiKey',
                    message: 'Enter your API key:',
                },
            ]);
            if (apiKey) {
                multilingual.setTranslationService(config.translationService, apiKey);
            }
        }
    }

    const spinner = ora();

    try {
        const result = await multilingual.run((stage, message, progress) => {
            spinner.text = `${message} (${progress}%)`;
            if (!spinner.isSpinning) {
                spinner.start();
            }
        });

        if (result.success) {
            spinner.succeed('Translation complete!');

            console.log(chalk.blue('\n📊 Results:'));
            console.log(`   Strings found: ${result.scan.stats.totalStrings}`);
            console.log(`   Files generated: ${result.generation.outputFiles.length}`);
            console.log(`   New keys: ${result.generation.stats.newKeys}`);
            console.log(`   Unchanged keys: ${result.generation.stats.unchangedKeys}`);

            console.log(chalk.blue('\n📁 Generated files:'));
            for (const file of result.generation.outputFiles) {
                console.log(chalk.gray(`   ${file}`));
            }
        } else {
            spinner.fail('Translation failed');
            for (const error of result.errors) {
                console.log(chalk.red(`   ❌ ${error}`));
            }
            process.exit(1);
        }
    } catch (error) {
        spinner.fail('Translation failed');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
}

async function handleLanguageConfig(
    multilingual: Multilingual,
    field: 'sourceLanguage' | 'targetLanguages'
): Promise<void> {
    const config = multilingual.getConfig();

    if (field === 'sourceLanguage') {
        const { language } = await inquirer.prompt([
            {
                type: 'list',
                name: 'language',
                message: 'Select source language:',
                choices: SUPPORTED_LANGUAGES.map(l => ({
                    name: `${l.name} (${l.nativeName})`,
                    value: l.code,
                })),
                default: config.sourceLanguage,
            },
        ]);
        multilingual.setLanguages(language, config.targetLanguages.filter((l: SupportedLanguage) => l !== language));
    } else {
        const { languages } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'languages',
                message: 'Select target languages:',
                choices: SUPPORTED_LANGUAGES.filter(l => l.code !== config.sourceLanguage).map(l => ({
                    name: `${l.name} (${l.nativeName})`,
                    value: l.code,
                    checked: config.targetLanguages.includes(l.code as SupportedLanguage),
                })),
            },
        ]);
        multilingual.setLanguages(config.sourceLanguage, languages);
    }
}

async function handleServiceConfig(multilingual: Multilingual): Promise<void> {
    const { service } = await inquirer.prompt([
        {
            type: 'list',
            name: 'service',
            message: 'Select translation service:',
            choices: [
                new inquirer.Separator('── 🆓 FREE ──'),
                { name: '🌐 LibreTranslate', value: 'libretranslate' },
                { name: '🔒 Lingva', value: 'lingva' },
                { name: '💾 MyMemory', value: 'mymemory' },
                { name: '🧪 Pseudo', value: 'pseudo' },
                new inquirer.Separator('── 💳 PAID ──'),
                { name: '🔷 DeepL', value: 'deepl' },
                { name: '🔵 Google', value: 'google' },
                new inquirer.Separator('────────────'),
                { name: '⬜ None', value: 'none' },
            ],
        },
    ]);

    if (['deepl', 'google'].includes(service)) {
        console.log(getApiKeyInstructions(service));
        const { apiKey } = await inquirer.prompt([
            {
                type: 'input',
                name: 'apiKey',
                message: 'Enter your API key:',
            },
        ]);
        multilingual.setTranslationService(service, apiKey);
    } else {
        multilingual.setTranslationService(['deepl', 'google', 'none'].includes(service) ? service : 'none');
    }
}

async function handleApiKeyConfig(multilingual: Multilingual): Promise<void> {
    const config = multilingual.getConfig();

    if (config.translationService === 'none') {
        console.log(chalk.yellow('Please configure a translation service first.'));
        await handleServiceConfig(multilingual);
        return;
    }

    console.log(getApiKeyInstructions(config.translationService));

    const { apiKey } = await inquirer.prompt([
        {
            type: 'password',
            name: 'apiKey',
            message: 'Enter your API key:',
            mask: '*',
        },
    ]);

    if (apiKey) {
        multilingual.setTranslationService(config.translationService, apiKey);

        const spinner = ora('Validating API key...').start();
        const validation = await multilingual.validateApiKey();

        if (validation.valid) {
            spinner.succeed('API key is valid!');
        } else {
            spinner.warn(`Validation failed: ${validation.error}`);
        }
    }
}

async function setupGitHubActionsInteractive(
    multilingual: Multilingual,
    prBased = false
): Promise<void> {
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'workflowType',
            message: 'What type of GitHub Actions workflow would you like?',
            choices: [
                {
                    name: '🚀 Direct commit - Automatically commit translations to branch',
                    value: 'direct'
                },
                {
                    name: '🔀 PR-based - Create pull request with translations (safer)',
                    value: 'pr'
                },
            ],
        },
        {
            type: 'confirm',
            name: 'addValidation',
            message: 'Add validation workflow to check translations on PRs?',
            default: true,
        },
    ]);

    prBased = answers.workflowType === 'pr';

    const spinner = ora('Setting up GitHub Actions...').start();

    const result = multilingual.setupGitHubActions({
        prBased,
        validation: answers.addValidation,
    });

    spinner.succeed('GitHub Actions configured!');

    console.log(chalk.blue('\n📁 Created workflows:'));
    for (const file of result.workflows) {
        console.log(chalk.gray(`   ${file}`));
    }

    console.log(result.secrets);

    await multilingual.saveConfig();
}

// Parse arguments and run
program.parse();
