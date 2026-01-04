/**
 * Statistics and Reporting for Multilingual
 * Provides translation coverage, cost estimates, and progress tracking
 */

import * as fs from 'fs';
import * as path from 'path';
import { SupportedLanguage, SUPPORTED_LANGUAGES, ExtractedString } from './types';

export interface TranslationStats {
    totalStrings: number;
    totalWords: number;
    totalCharacters: number;
    languages: LanguageStats[];
    coverage: number;
    estimatedCost: CostEstimate;
    byFile: Record<string, number>;
    byType: Record<string, number>;
}

export interface LanguageStats {
    code: SupportedLanguage;
    name: string;
    translated: number;
    untranslated: number;
    reviewed: number;
    coverage: number;
    lastUpdated?: string;
}

export interface CostEstimate {
    deepl: { free: number; pro: number };
    google: { free: number; paid: number };
    totalCharacters: number;
    note: string;
}

export interface ProgressReport {
    timestamp: string;
    projectName: string;
    summary: {
        totalStrings: number;
        completedLanguages: number;
        totalLanguages: number;
        overallCoverage: number;
    };
    languages: LanguageStats[];
    recentChanges: ChangeEntry[];
    qualityMetrics: QualityMetrics;
}

export interface ChangeEntry {
    timestamp: string;
    type: 'added' | 'modified' | 'removed';
    key: string;
    language: string;
    value?: string;
}

export interface QualityMetrics {
    averageLength: number;
    longStrings: number;
    shortStrings: number;
    withPlaceholders: number;
    withHtml: number;
    duplicates: number;
}

/**
 * Calculate statistics from extracted strings
 */
export function calculateStats(
    strings: ExtractedString[],
    existingTranslations: Map<SupportedLanguage, Record<string, string>>,
    targetLanguages: SupportedLanguage[]
): TranslationStats {
    const totalStrings = strings.length;
    let totalWords = 0;
    let totalCharacters = 0;

    const byFile: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const str of strings) {
        // Count words (rough approximation)
        totalWords += str.value.split(/\s+/).filter(w => w.length > 0).length;
        totalCharacters += str.value.length;

        // By file
        byFile[str.file] = (byFile[str.file] || 0) + 1;

        // By type
        byType[str.type] = (byType[str.type] || 0) + 1;
    }

    // Calculate per-language stats
    const languages: LanguageStats[] = targetLanguages.map(code => {
        const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === code);
        const translations = existingTranslations.get(code) || {};
        const translatedKeys = Object.keys(translations);

        const translated = strings.filter(s => translatedKeys.includes(s.key)).length;
        const untranslated = totalStrings - translated;

        return {
            code,
            name: langInfo?.name || code,
            translated,
            untranslated,
            reviewed: 0, // Would need to track this separately
            coverage: totalStrings > 0 ? (translated / totalStrings) * 100 : 0,
        };
    });

    // Overall coverage
    const totalTranslated = languages.reduce((sum, l) => sum + l.translated, 0);
    const totalPossible = totalStrings * targetLanguages.length;
    const coverage = totalPossible > 0 ? (totalTranslated / totalPossible) * 100 : 0;

    // Cost estimates
    const estimatedCost = calculateCostEstimate(totalCharacters, targetLanguages.length);

    return {
        totalStrings,
        totalWords,
        totalCharacters,
        languages,
        coverage,
        estimatedCost,
        byFile,
        byType,
    };
}

/**
 * Calculate cost estimates for different translation services
 */
export function calculateCostEstimate(
    characters: number,
    languageCount: number
): CostEstimate {
    const totalChars = characters * languageCount;

    // DeepL pricing: Free tier is 500,000 chars/month
    // Pro tier is $20 per million characters
    const deeplFreeMonths = totalChars / 500000;
    const deeplProCost = (totalChars / 1000000) * 20;

    // Google pricing: Free tier is 500,000 chars/month (first year)
    // After that, $20 per million characters
    const googleFreeMonths = totalChars / 500000;
    const googlePaidCost = (totalChars / 1000000) * 20;

    return {
        deepl: {
            free: deeplFreeMonths,
            pro: deeplProCost,
        },
        google: {
            free: googleFreeMonths,
            paid: googlePaidCost,
        },
        totalCharacters: totalChars,
        note: totalChars <= 500000
            ? '✅ Within free tier limits for both services'
            : totalChars <= 1000000
                ? '⚠️ May exceed free tier - consider spreading across months'
                : '💰 Will require paid plan for single-run translation',
    };
}

/**
 * Generate a formatted progress report
 */
export function generateProgressReport(
    stats: TranslationStats,
    projectName: string
): ProgressReport {
    const completedLanguages = stats.languages.filter(l => l.coverage >= 100).length;

    return {
        timestamp: new Date().toISOString(),
        projectName,
        summary: {
            totalStrings: stats.totalStrings,
            completedLanguages,
            totalLanguages: stats.languages.length,
            overallCoverage: stats.coverage,
        },
        languages: stats.languages,
        recentChanges: [], // Would need to track changes over time
        qualityMetrics: calculateQualityMetrics([]), // Would need the strings
    };
}

/**
 * Calculate quality metrics
 */
export function calculateQualityMetrics(strings: ExtractedString[]): QualityMetrics {
    if (strings.length === 0) {
        return {
            averageLength: 0,
            longStrings: 0,
            shortStrings: 0,
            withPlaceholders: 0,
            withHtml: 0,
            duplicates: 0,
        };
    }

    const lengths = strings.map(s => s.value.length);
    const averageLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;

    const longStrings = strings.filter(s => s.value.length > 200).length;
    const shortStrings = strings.filter(s => s.value.length < 5).length;

    const placeholderPattern = /\{[^}]+\}|\{\{[^}]+\}\}|\$\{[^}]+\}|%[sd]/;
    const htmlPattern = /<[^>]+>/;

    const withPlaceholders = strings.filter(s => placeholderPattern.test(s.value)).length;
    const withHtml = strings.filter(s => htmlPattern.test(s.value)).length;

    // Count duplicates
    const valueCounts = new Map<string, number>();
    for (const str of strings) {
        valueCounts.set(str.value, (valueCounts.get(str.value) || 0) + 1);
    }
    const duplicates = Array.from(valueCounts.values()).filter(c => c > 1).length;

    return {
        averageLength: Math.round(averageLength),
        longStrings,
        shortStrings,
        withPlaceholders,
        withHtml,
        duplicates,
    };
}

/**
 * Format stats as a text report
 */
export function formatStatsReport(stats: TranslationStats): string {
    const lines: string[] = [];

    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║              Translation Statistics Report                    ║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('');

    lines.push('📊 SUMMARY');
    lines.push('─'.repeat(60));
    lines.push(`  Total strings:    ${stats.totalStrings.toLocaleString()}`);
    lines.push(`  Total words:      ${stats.totalWords.toLocaleString()}`);
    lines.push(`  Total characters: ${stats.totalCharacters.toLocaleString()}`);
    lines.push(`  Overall coverage: ${stats.coverage.toFixed(1)}%`);
    lines.push('');

    lines.push('🌍 LANGUAGE COVERAGE');
    lines.push('─'.repeat(60));

    for (const lang of stats.languages) {
        const bar = generateProgressBar(lang.coverage, 20);
        const status = lang.coverage >= 100 ? '✅' : lang.coverage > 50 ? '🔄' : '⏳';
        lines.push(`  ${status} ${lang.name.padEnd(20)} ${bar} ${lang.coverage.toFixed(1)}%`);
        lines.push(`     Translated: ${lang.translated} | Remaining: ${lang.untranslated}`);
    }
    lines.push('');

    lines.push('💰 COST ESTIMATES');
    lines.push('─'.repeat(60));
    lines.push(`  Total characters to translate: ${stats.estimatedCost.totalCharacters.toLocaleString()}`);
    lines.push('');
    lines.push('  DeepL:');
    lines.push(`    Free tier: ~${stats.estimatedCost.deepl.free.toFixed(1)} months of quota`);
    lines.push(`    Pro tier:  ~$${stats.estimatedCost.deepl.pro.toFixed(2)}`);
    lines.push('');
    lines.push('  Google Cloud Translation:');
    lines.push(`    Free tier: ~${stats.estimatedCost.google.free.toFixed(1)} months of quota`);
    lines.push(`    Paid tier: ~$${stats.estimatedCost.google.paid.toFixed(2)}`);
    lines.push('');
    lines.push(`  ${stats.estimatedCost.note}`);
    lines.push('');

    lines.push('📁 BY FILE TYPE');
    lines.push('─'.repeat(60));
    const sortedTypes = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sortedTypes) {
        const pct = ((count / stats.totalStrings) * 100).toFixed(1);
        lines.push(`  ${type.padEnd(15)} ${count.toString().padStart(5)} strings (${pct}%)`);
    }
    lines.push('');

    lines.push('╚══════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
}

/**
 * Generate a visual progress bar
 */
function generateProgressBar(percentage: number, width: number): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

/**
 * Format stats as JSON
 */
export function formatStatsJSON(stats: TranslationStats): string {
    return JSON.stringify(stats, null, 2);
}

/**
 * Format stats as Markdown
 */
export function formatStatsMarkdown(stats: TranslationStats, projectName = 'Project'): string {
    const lines: string[] = [];

    lines.push(`# ${projectName} - Translation Report`);
    lines.push('');
    lines.push(`*Generated: ${new Date().toISOString()}*`);
    lines.push('');

    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total Strings | ${stats.totalStrings.toLocaleString()} |`);
    lines.push(`| Total Words | ${stats.totalWords.toLocaleString()} |`);
    lines.push(`| Total Characters | ${stats.totalCharacters.toLocaleString()} |`);
    lines.push(`| Overall Coverage | ${stats.coverage.toFixed(1)}% |`);
    lines.push('');

    lines.push('## Language Coverage');
    lines.push('');
    lines.push('| Language | Translated | Remaining | Coverage |');
    lines.push('|----------|------------|-----------|----------|');

    for (const lang of stats.languages) {
        const status = lang.coverage >= 100 ? '✅' : lang.coverage > 50 ? '🔄' : '⏳';
        lines.push(`| ${status} ${lang.name} | ${lang.translated} | ${lang.untranslated} | ${lang.coverage.toFixed(1)}% |`);
    }
    lines.push('');

    lines.push('## Cost Estimates');
    lines.push('');
    lines.push('| Service | Free Tier | Paid Cost |');
    lines.push('|---------|-----------|-----------|');
    lines.push(`| DeepL | ~${stats.estimatedCost.deepl.free.toFixed(1)} months | ~$${stats.estimatedCost.deepl.pro.toFixed(2)} |`);
    lines.push(`| Google | ~${stats.estimatedCost.google.free.toFixed(1)} months | ~$${stats.estimatedCost.google.paid.toFixed(2)} |`);
    lines.push('');
    lines.push(`> ${stats.estimatedCost.note}`);
    lines.push('');

    lines.push('---');
    lines.push('*Report generated by [Multilingual CLI](https://github.com/NagusameCS/Multilingual)*');

    return lines.join('\n');
}

/**
 * Save stats to file
 */
export function saveStatsReport(
    stats: TranslationStats,
    outputDir: string,
    format: 'text' | 'json' | 'markdown' | 'all' = 'all'
): string[] {
    const files: string[] = [];

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    if (format === 'text' || format === 'all') {
        const textPath = path.join(outputDir, 'translation-report.txt');
        fs.writeFileSync(textPath, formatStatsReport(stats));
        files.push(textPath);
    }

    if (format === 'json' || format === 'all') {
        const jsonPath = path.join(outputDir, 'translation-report.json');
        fs.writeFileSync(jsonPath, formatStatsJSON(stats));
        files.push(jsonPath);
    }

    if (format === 'markdown' || format === 'all') {
        const mdPath = path.join(outputDir, 'TRANSLATION-REPORT.md');
        fs.writeFileSync(mdPath, formatStatsMarkdown(stats));
        files.push(mdPath);
    }

    return files;
}

/**
 * Compare two snapshots of translation stats
 */
export function compareStats(
    before: TranslationStats,
    after: TranslationStats
): {
    stringsAdded: number;
    stringsRemoved: number;
    coverageChange: number;
    languageChanges: { code: string; change: number }[];
} {
    return {
        stringsAdded: Math.max(0, after.totalStrings - before.totalStrings),
        stringsRemoved: Math.max(0, before.totalStrings - after.totalStrings),
        coverageChange: after.coverage - before.coverage,
        languageChanges: after.languages.map(lang => {
            const beforeLang = before.languages.find(l => l.code === lang.code);
            return {
                code: lang.code,
                change: lang.coverage - (beforeLang?.coverage || 0),
            };
        }),
    };
}
