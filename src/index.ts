/**
 * multilingual-cli v2.0.0
 * Automated i18n with FREE translation options
 * 
 * Features:
 * - 6 translation services (4 free, 2 paid)
 * - 37 supported languages with RTL support
 * - Multiple export formats (JSON, XLIFF, PO, CSV, Android, iOS, ARB)
 * - Watch mode for development
 * - Translation memory with fuzzy matching
 * - Pseudo-localization for testing
 * - Statistics and cost estimation
 * - GitHub Actions automation
 */

// Types
export {
    MultilingualConfig,
    TranslationService,
    SupportedLanguage,
    ExtractedString,
    TranslationEntry,
    TranslationResult,
    ScanResult,
    GenerationResult,
    LanguageInfo,
    SUPPORTED_LANGUAGES,
    DEFAULT_CONFIG,
} from './types';

// Core components
export { Multilingual } from './core';
export { ContentScanner } from './scanner';
export { I18nGenerator } from './generator';
export { TranslationManager, ExtendedTranslationService, SecurityUtils, getApiKeyInstructions } from './translation';
export { ConfigManager } from './config';
export { GitHubActionsSetup } from './github-actions';

// New v2.0 features
export {
    TranslationDocument,
    TranslationUnit,
    XLIFFFormat,
    XLIFF2Format,
    POFormat,
    CSVFormat,
    AndroidXMLFormat,
    IOSStringsFormat,
    ARBFormat,
    exportToFile,
    importFromFile,
    convertFormat,
    mergeTranslations,
} from './formats';

export {
    TranslationStats,
    LanguageStats,
    CostEstimate,
    ProgressReport,
    QualityMetrics,
    calculateStats,
    formatStatsReport,
    formatStatsJSON,
    formatStatsMarkdown,
    saveStatsReport,
    calculateCostEstimate,
} from './stats';

export {
    WatchOptions,
    FileWatcher,
    TranslationWatchSession,
    WatchStats,
    createWatcher,
    createTranslationWatchSession,
    formatWatchStats,
} from './watch';

// Default export for easy usage
import { Multilingual } from './core';
export default Multilingual;
