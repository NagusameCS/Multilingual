/**
 * Usage Tracker for Multilingual CLI
 * Tracks daily usage, provides estimates, and manages translation queues
 */

import * as fs from 'fs';
import * as path from 'path';

export interface UsageData {
    version: string;
    lastUsed: string;
    dailyUsage: DailyUsage[];
    translationQueue: QueuedTranslation[];
}

export interface DailyUsage {
    date: string;
    service: string;
    charactersUsed: number;
    stringsTranslated: number;
    languagesTranslated: string[];
}

export interface QueuedTranslation {
    id: string;
    languages: string[];
    service: string;
    priority: 'high' | 'medium' | 'low';
    estimatedChars: number;
    createdAt: string;
    status: 'pending' | 'completed' | 'failed';
}

export interface ServiceLimits {
    name: string;
    dailyLimit: number;
    dailyLimitWithEmail: number;
    avgSecondsPerString: number;
    description: string;
    freeNote: string;
}

// Service limits and characteristics
export const SERVICE_LIMITS: Record<string, ServiceLimits> = {
    mymemory: {
        name: 'MyMemory',
        dailyLimit: 10000,
        dailyLimitWithEmail: 100000,
        avgSecondsPerString: 0.5,
        description: 'Crowd-sourced + machine translation',
        freeNote: 'Register email for 10x more characters (100,000/day)',
    },
    libretranslate: {
        name: 'LibreTranslate',
        dailyLimit: Infinity,
        dailyLimitWithEmail: Infinity,
        avgSecondsPerString: 1.0,
        description: 'Open source, self-hostable',
        freeNote: 'No limits but public instances may be slow',
    },
    lingva: {
        name: 'Lingva',
        dailyLimit: Infinity,
        dailyLimitWithEmail: Infinity,
        avgSecondsPerString: 0.8,
        description: 'Privacy-focused Google Translate proxy',
        freeNote: 'May be blocked by Cloudflare',
    },
    deepl: {
        name: 'DeepL',
        dailyLimit: 500000,
        dailyLimitWithEmail: 500000,
        avgSecondsPerString: 0.1, // Batch API is fast
        description: 'High quality neural translation',
        freeNote: '500,000 chars/month free tier',
    },
    google: {
        name: 'Google Translate',
        dailyLimit: 500000,
        dailyLimitWithEmail: 500000,
        avgSecondsPerString: 0.1,
        description: 'Wide language support',
        freeNote: '$300 free credit for new users',
    },
    pseudo: {
        name: 'Pseudo-localization',
        dailyLimit: Infinity,
        dailyLimitWithEmail: Infinity,
        avgSecondsPerString: 0.001,
        description: 'Fake translations for UI testing',
        freeNote: 'Instant, no API calls',
    },
    dictionary: {
        name: 'Built-in Dictionary',
        dailyLimit: Infinity,
        dailyLimitWithEmail: Infinity,
        avgSecondsPerString: 0.001,
        description: 'Offline phrase dictionary',
        freeNote: 'Instant, no internet required',
    },
};

export interface TranslationEstimate {
    totalStrings: number;
    totalCharacters: number;
    languageCount: number;
    totalApiCalls: number;

    // Time estimates
    estimatedSeconds: number;
    estimatedMinutes: number;
    estimatedHours: number;
    formattedTime: string;

    // Limit analysis
    service: string;
    dailyLimit: number;
    remainingToday: number;
    exceedsLimit: boolean;
    daysNeeded: number;

    // Email benefit
    emailBenefit: number;
    limitWithEmail: number;
    wouldExceedWithEmail: boolean;

    // Recommendations
    recommendations: string[];
    warnings: string[];
}

export class UsageTracker {
    private dataPath: string;
    private data: UsageData;

    constructor(projectRoot: string = process.cwd()) {
        this.dataPath = path.join(projectRoot, '.multilingual', 'usage.json');
        this.data = this.loadData();
    }

    private loadData(): UsageData {
        try {
            if (fs.existsSync(this.dataPath)) {
                return JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
            }
        } catch {
            // Ignore errors, return default
        }
        return {
            version: '1.0',
            lastUsed: new Date().toISOString(),
            dailyUsage: [],
            translationQueue: [],
        };
    }

    private saveData(): void {
        try {
            const dir = path.dirname(this.dataPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch {
            // Ignore save errors
        }
    }

    /**
     * Get the last time the CLI was used
     */
    getLastUsed(): Date | null {
        if (this.data.lastUsed) {
            return new Date(this.data.lastUsed);
        }
        return null;
    }

    /**
     * Format last used time in a human-readable way
     */
    getLastUsedFormatted(): string {
        const lastUsed = this.getLastUsed();
        if (!lastUsed) return 'Never';

        const now = new Date();
        const diffMs = now.getTime() - lastUsed.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;

        return lastUsed.toLocaleDateString();
    }

    /**
     * Update last used time
     */
    updateLastUsed(): void {
        this.data.lastUsed = new Date().toISOString();
        this.saveData();
    }

    /**
     * Get today's usage for a service
     */
    getTodayUsage(service: string): DailyUsage | null {
        const today = new Date().toISOString().split('T')[0];
        return this.data.dailyUsage.find(u => u.date === today && u.service === service) || null;
    }

    /**
     * Get remaining characters for today
     */
    getRemainingToday(service: string, hasEmail: boolean = false): number {
        const limits = SERVICE_LIMITS[service];
        if (!limits) return Infinity;

        const limit = hasEmail ? limits.dailyLimitWithEmail : limits.dailyLimit;
        if (limit === Infinity) return Infinity;

        const todayUsage = this.getTodayUsage(service);
        const used = todayUsage?.charactersUsed || 0;

        return Math.max(0, limit - used);
    }

    /**
     * Record usage
     */
    recordUsage(service: string, characters: number, strings: number, languages: string[]): void {
        const today = new Date().toISOString().split('T')[0];

        let todayUsage = this.data.dailyUsage.find(u => u.date === today && u.service === service);

        if (todayUsage) {
            todayUsage.charactersUsed += characters;
            todayUsage.stringsTranslated += strings;
            todayUsage.languagesTranslated = [...new Set([...todayUsage.languagesTranslated, ...languages])];
        } else {
            this.data.dailyUsage.push({
                date: today,
                service,
                charactersUsed: characters,
                stringsTranslated: strings,
                languagesTranslated: languages,
            });
        }

        // Keep only last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        this.data.dailyUsage = this.data.dailyUsage.filter(u => new Date(u.date) >= thirtyDaysAgo);

        this.updateLastUsed();
    }

    /**
     * Calculate translation estimate
     */
    calculateEstimate(
        strings: { value: string }[],
        targetLanguages: string[],
        service: string,
        hasEmail: boolean = false
    ): TranslationEstimate {
        const limits = SERVICE_LIMITS[service] || SERVICE_LIMITS.mymemory;

        const totalStrings = strings.length;
        const totalCharacters = strings.reduce((sum, s) => sum + s.value.length, 0);
        const languageCount = targetLanguages.length;
        const totalApiCalls = totalStrings * languageCount;
        const totalCharsNeeded = totalCharacters * languageCount;

        // Time estimate
        const estimatedSeconds = totalApiCalls * limits.avgSecondsPerString;
        const estimatedMinutes = estimatedSeconds / 60;
        const estimatedHours = estimatedMinutes / 60;

        // Format time
        let formattedTime: string;
        if (estimatedHours >= 1) {
            const hours = Math.floor(estimatedHours);
            const mins = Math.round((estimatedHours - hours) * 60);
            formattedTime = `${hours}h ${mins}m`;
        } else if (estimatedMinutes >= 1) {
            formattedTime = `${Math.round(estimatedMinutes)} minutes`;
        } else {
            formattedTime = `${Math.round(estimatedSeconds)} seconds`;
        }

        // Limit analysis
        const dailyLimit = hasEmail ? limits.dailyLimitWithEmail : limits.dailyLimit;
        const remainingToday = this.getRemainingToday(service, hasEmail);
        const exceedsLimit = totalCharsNeeded > remainingToday;
        const daysNeeded = dailyLimit === Infinity ? 1 : Math.ceil(totalCharsNeeded / dailyLimit);

        // Email benefit
        const emailBenefit = limits.dailyLimitWithEmail - limits.dailyLimit;
        const limitWithEmail = limits.dailyLimitWithEmail;
        const wouldExceedWithEmail = totalCharsNeeded > limitWithEmail;

        // Generate recommendations and warnings
        const recommendations: string[] = [];
        const warnings: string[] = [];

        if (exceedsLimit && dailyLimit !== Infinity) {
            warnings.push(`⚠️  Exceeds daily limit! Need ${totalCharsNeeded.toLocaleString()} chars, only ${remainingToday.toLocaleString()} remaining.`);

            if (!hasEmail && emailBenefit > 0) {
                recommendations.push(`💡 Add your email to get ${emailBenefit.toLocaleString()} more characters/day (${limitWithEmail.toLocaleString()} total)`);
            }

            if (daysNeeded > 1) {
                recommendations.push(`📅 Split translation over ${daysNeeded} days, or use queue feature`);
            }
        }

        if (languageCount > 5 && totalStrings > 1000) {
            recommendations.push(`🎯 Consider starting with 5 high-impact languages first`);
        }

        if (estimatedMinutes > 30 && service !== 'deepl') {
            recommendations.push(`⚡ DeepL is ~5x faster for large translations (500k chars/month free)`);
        }

        if (service === 'lingva') {
            warnings.push(`⚠️  Lingva may be blocked by Cloudflare - have a backup plan`);
        }

        return {
            totalStrings,
            totalCharacters,
            languageCount,
            totalApiCalls,
            estimatedSeconds,
            estimatedMinutes,
            estimatedHours,
            formattedTime,
            service: limits.name,
            dailyLimit,
            remainingToday,
            exceedsLimit,
            daysNeeded,
            emailBenefit,
            limitWithEmail,
            wouldExceedWithEmail,
            recommendations,
            warnings,
        };
    }

    /**
     * Add translation to queue
     */
    addToQueue(languages: string[], service: string, estimatedChars: number, priority: 'high' | 'medium' | 'low' = 'medium'): string {
        const id = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        this.data.translationQueue.push({
            id,
            languages,
            service,
            priority,
            estimatedChars,
            createdAt: new Date().toISOString(),
            status: 'pending',
        });

        this.saveData();
        return id;
    }

    /**
     * Get pending queue items
     */
    getPendingQueue(): QueuedTranslation[] {
        return this.data.translationQueue
            .filter(q => q.status === 'pending')
            .sort((a, b) => {
                const priorityOrder = { high: 0, medium: 1, low: 2 };
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            });
    }

    /**
     * Update queue item status
     */
    updateQueueStatus(id: string, status: 'pending' | 'completed' | 'failed'): void {
        const item = this.data.translationQueue.find(q => q.id === id);
        if (item) {
            item.status = status;
            this.saveData();
        }
    }

    /**
     * Clear completed queue items
     */
    clearCompletedQueue(): void {
        this.data.translationQueue = this.data.translationQueue.filter(q => q.status === 'pending');
        this.saveData();
    }

    /**
     * Format estimate for display
     */
    static formatEstimateReport(estimate: TranslationEstimate, hasEmail: boolean = false): string {
        const lines: string[] = [];

        lines.push('');
        lines.push('📊 Translation Estimate');
        lines.push('═'.repeat(50));
        lines.push('');
        lines.push(`   Strings to translate: ${estimate.totalStrings.toLocaleString()}`);
        lines.push(`   Total characters:     ${estimate.totalCharacters.toLocaleString()}`);
        lines.push(`   Target languages:     ${estimate.languageCount}`);
        lines.push(`   Total API calls:      ${(estimate.totalStrings * estimate.languageCount).toLocaleString()}`);
        lines.push('');
        lines.push('⏱️  Time Estimate');
        lines.push('─'.repeat(50));
        lines.push(`   Estimated duration:   ${estimate.formattedTime}`);
        lines.push('');
        lines.push(`📈 ${estimate.service} Usage`);
        lines.push('─'.repeat(50));

        if (estimate.dailyLimit === Infinity) {
            lines.push('   Daily limit:          Unlimited');
        } else {
            lines.push(`   Daily limit:          ${estimate.dailyLimit.toLocaleString()} chars`);
            lines.push(`   Remaining today:      ${estimate.remainingToday.toLocaleString()} chars`);
            lines.push(`   Chars needed:         ${(estimate.totalCharacters * estimate.languageCount).toLocaleString()} chars`);

            if (!hasEmail && estimate.emailBenefit > 0) {
                lines.push('');
                lines.push(`   💡 With email:        +${estimate.emailBenefit.toLocaleString()} chars/day`);
                lines.push(`      (${estimate.limitWithEmail.toLocaleString()} total)`);
            }
        }

        if (estimate.warnings.length > 0) {
            lines.push('');
            lines.push('⚠️  Warnings');
            lines.push('─'.repeat(50));
            for (const warning of estimate.warnings) {
                lines.push(`   ${warning}`);
            }
        }

        if (estimate.recommendations.length > 0) {
            lines.push('');
            lines.push('💡 Recommendations');
            lines.push('─'.repeat(50));
            for (const rec of estimate.recommendations) {
                lines.push(`   ${rec}`);
            }
        }

        lines.push('');

        return lines.join('\n');
    }
}

/**
 * Format time remaining during translation
 */
export function formatTimeRemaining(completed: number, total: number, startTime: number): string {
    if (completed === 0) return 'Calculating...';

    const elapsed = Date.now() - startTime;
    const avgPerItem = elapsed / completed;
    const remaining = total - completed;
    const msRemaining = remaining * avgPerItem;

    const seconds = Math.round(msRemaining / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `~${hours}h ${minutes % 60}m remaining`;
    } else if (minutes > 0) {
        return `~${minutes}m ${seconds % 60}s remaining`;
    } else {
        return `~${seconds}s remaining`;
    }
}

/**
 * Format elapsed time
 */
export function formatElapsedTime(startTime: number): string {
    const elapsed = Date.now() - startTime;
    const seconds = Math.round(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}
