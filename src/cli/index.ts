#!/usr/bin/env node

/**
 * Multilingual Auto-i18n CLI
 * Interactive command-line interface for automated internationalization
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { Multilingual } from '../core';
import { ConfigManager } from '../config';
import { getApiKeyInstructions } from '../translation';
import { GitHubActionsSetup } from '../github-actions';
import {
    SUPPORTED_LANGUAGES,
    SupportedLanguage,
    TranslationService,
} from '../types';

const program = new Command();

// ASCII Art Banner
const banner = `
${chalk.cyan('╔══════════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('🌐 Multilingual Auto-i18n')}                                  ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Automated internationalization for any project')}              ${chalk.cyan('║')}
${chalk.cyan('╚══════════════════════════════════════════════════════════════╝')}
`;

program
    .name('multilingual')
    .description('Automated i18n detection and translation tool')
    .version('1.0.0');

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
            // Use defaults
            const config = await multilingual.init();
            await multilingual.saveConfig();
            console.log(chalk.green('\n✅ Configuration saved with defaults!'));
            return;
        }

        // Interactive setup
        const answers = await inquirer.prompt<{
            sourceLanguage: SupportedLanguage;
            targetLanguages: SupportedLanguage[];
            translationService: TranslationService;
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
                    { name: '🔷 DeepL - High quality translations (recommended)', value: 'deepl' },
                    { name: '🔵 Google Translate - Wide language support', value: 'google' },
                    { name: '⬜ None - I\'ll translate manually', value: 'none' },
                ],
            },
            {
                type: 'input',
                name: 'apiKey',
                message: (answers: { translationService: TranslationService }) =>
                    `Enter your ${answers.translationService === 'deepl' ? 'DeepL' : 'Google'} API key:`,
                when: (answers) => answers.translationService !== 'none',
                validate: (input) => input.length > 0 || 'API key is required',
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
        if (answers.translationService !== 'none' && !answers.apiKey) {
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
            translationService: answers.translationService,
            apiKey: answers.apiKey,
            outputDir: answers.outputDir,
            outputFormat: answers.outputFormat,
        });

        // Validate API key if provided
        if (answers.apiKey) {
            const spinner = ora('Validating API key...').start();
            const validation = await multilingual.validateApiKey();

            if (validation.valid) {
                spinner.succeed('API key is valid!');
                if (validation.usage) {
                    console.log(chalk.gray(`   Usage: ${JSON.stringify(validation.usage)}`));
                }
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
            await runTranslation(multilingual);
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
    .action(async (options) => {
        console.log(banner);

        const multilingual = new Multilingual();
        await multilingual.init();

        await runTranslation(multilingual, options.auto);
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
                const fs = await import('fs');
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
 * Translate command - Translate existing keys
 */
program
    .command('translate')
    .description('Translate scanned strings to target languages')
    .option('-a, --auto', 'Run in non-interactive mode')
    .option('-l, --language <lang>', 'Translate to specific language only')
    .action(async (options) => {
        console.log(banner);

        const multilingual = new Multilingual();
        await multilingual.init();

        await runTranslation(multilingual, options.auto);
    });

/**
 * Config command - View/edit configuration
 */
program
    .command('config')
    .description('View or modify configuration')
    .option('-e, --edit', 'Edit configuration interactively')
    .option('--show', 'Show current configuration')
    .action(async (options) => {
        console.log(banner);

        const multilingual = new Multilingual();
        const config = await multilingual.init();

        if (options.show || !options.edit) {
            console.log(chalk.blue('\n📋 Current Configuration:\n'));
            console.log(chalk.gray(JSON.stringify(config, null, 2)));
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

        // Handle each field
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
    .option('--pr-based', 'Use PR-based workflow instead of direct commits')
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

        await setupGitHubActionsInteractive(multilingual, options.prBased);
    });

/**
 * Validate command - Validate translation files
 */
program
    .command('validate')
    .description('Validate translation files for completeness')
    .action(async () => {
        console.log(banner);

        const multilingual = new Multilingual();
        const config = await multilingual.init();

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
 * Check command - Show translation statistics
 */
program
    .command('check')
    .description('Check translation status and statistics')
    .option('--report', 'Generate detailed report')
    .action(async (options) => {
        console.log(banner);

        const multilingual = new Multilingual();
        const config = await multilingual.init();

        console.log(chalk.blue('\n📊 Translation Status:\n'));
        console.log(`   Source language: ${config.sourceLanguage}`);
        console.log(`   Target languages: ${config.targetLanguages.join(', ')}`);
        console.log(`   Translation service: ${config.translationService}`);
        console.log(`   Output directory: ${config.outputDir}`);
        console.log(`   GitHub Actions: ${config.githubActions ? 'enabled' : 'disabled'}`);
    });

/**
 * Languages command - List available languages
 */
program
    .command('languages')
    .description('List all supported languages')
    .action(() => {
        console.log(banner);
        console.log(chalk.blue('\n🌍 Supported Languages:\n'));

        for (const lang of SUPPORTED_LANGUAGES) {
            const rtlBadge = lang.rtl ? chalk.yellow(' [RTL]') : '';
            console.log(`   ${chalk.bold(lang.code.padEnd(6))} ${lang.name} (${lang.nativeName})${rtlBadge}`);
        }
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

async function runTranslation(multilingual: Multilingual, auto = false): Promise<void> {
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

    // Check API key
    if (config.translationService !== 'none' && !config.apiKey) {
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
                { name: '🔷 DeepL', value: 'deepl' },
                { name: '🔵 Google Translate', value: 'google' },
                { name: '⬜ None', value: 'none' },
            ],
        },
    ]);

    if (service !== 'none') {
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
        multilingual.setTranslationService('none');
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
            type: 'input',
            name: 'apiKey',
            message: 'Enter your API key:',
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
    const config = multilingual.getConfig();

    if (!prBased) {
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
    } else {
        const spinner = ora('Setting up GitHub Actions...').start();
        const result = multilingual.setupGitHubActions({ prBased: true });
        spinner.succeed('GitHub Actions configured!');
        console.log(result.secrets);
    }
}

// Parse arguments and run
program.parse();
