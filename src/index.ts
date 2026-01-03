// Multilingual Auto-i18n - Main Entry Point
export { MultilingualConfig, TranslationService, SupportedLanguage } from './types';
export { ContentScanner } from './scanner';
export { I18nGenerator } from './generator';
export { TranslationManager } from './translation';
export { ConfigManager } from './config';
export { GitHubActionsSetup } from './github-actions';
export { Multilingual } from './core';

// Default export for easy usage
import { Multilingual } from './core';
export default Multilingual;
