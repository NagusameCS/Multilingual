/**
 * Watch Mode for Multilingual
 * Auto-translate on file changes during development
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface WatchOptions {
    paths: string[];
    ignore: string[];
    debounceMs: number;
    onFileChange?: (filePath: string, event: 'add' | 'change' | 'unlink') => void;
    onReady?: () => void;
    onError?: (error: Error) => void;
}

export interface FileWatcher extends EventEmitter {
    start(): void;
    stop(): void;
    isWatching(): boolean;
}

/**
 * Simple file watcher implementation using fs.watch
 * This is a basic implementation - for production, consider using chokidar
 */
export function createWatcher(options: WatchOptions): FileWatcher {
    const emitter = new EventEmitter();
    const watchers: fs.FSWatcher[] = [];
    let watching = false;
    const changeTimers = new Map<string, NodeJS.Timeout>();

    const isIgnored = (filePath: string): boolean => {
        const relativePath = filePath;
        return options.ignore.some(pattern => {
            if (pattern.includes('*')) {
                // Simple glob matching
                const regex = new RegExp(
                    '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
                );
                return regex.test(relativePath);
            }
            return relativePath.includes(pattern);
        });
    };

    const handleChange = (filePath: string, event: 'add' | 'change' | 'unlink') => {
        if (isIgnored(filePath)) return;

        // Debounce changes
        const existingTimer = changeTimers.get(filePath);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        changeTimers.set(
            filePath,
            setTimeout(() => {
                changeTimers.delete(filePath);
                emitter.emit('change', filePath, event);
                options.onFileChange?.(filePath, event);
            }, options.debounceMs)
        );
    };

    const watchDir = (dirPath: string) => {
        try {
            const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
                if (filename) {
                    const fullPath = path.join(dirPath, filename);
                    const event = eventType === 'rename'
                        ? (fs.existsSync(fullPath) ? 'add' : 'unlink')
                        : 'change';
                    handleChange(fullPath, event);
                }
            });

            watcher.on('error', (error) => {
                emitter.emit('error', error);
                options.onError?.(error);
            });

            watchers.push(watcher);
        } catch (error) {
            emitter.emit('error', error);
            options.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
    };

    return Object.assign(emitter, {
        start() {
            if (watching) return;
            watching = true;

            for (const watchPath of options.paths) {
                if (fs.existsSync(watchPath)) {
                    const stat = fs.statSync(watchPath);
                    if (stat.isDirectory()) {
                        watchDir(watchPath);
                    } else {
                        // Watch the parent directory for file changes
                        watchDir(path.dirname(watchPath));
                    }
                }
            }

            emitter.emit('ready');
            options.onReady?.();
        },

        stop() {
            watching = false;
            for (const watcher of watchers) {
                watcher.close();
            }
            watchers.length = 0;

            // Clear pending timers
            for (const timer of changeTimers.values()) {
                clearTimeout(timer);
            }
            changeTimers.clear();
        },

        isWatching() {
            return watching;
        },
    });
}

/**
 * Create a translation watch session
 */
export interface TranslationWatchSession {
    start(): Promise<void>;
    stop(): void;
    getStats(): WatchStats;
}

export interface WatchStats {
    filesChanged: number;
    stringsTranslated: number;
    errorsCount: number;
    startTime: Date;
    lastChange?: Date;
}

export function createTranslationWatchSession(
    projectRoot: string,
    translateCallback: (filePath: string) => Promise<void>,
    options: Partial<WatchOptions> = {}
): TranslationWatchSession {
    const stats: WatchStats = {
        filesChanged: 0,
        stringsTranslated: 0,
        errorsCount: 0,
        startTime: new Date(),
    };

    const watcher = createWatcher({
        paths: [path.join(projectRoot, 'src')],
        ignore: ['node_modules', '.git', 'dist', 'build', '*.test.*', '*.spec.*'],
        debounceMs: 500,
        ...options,
        async onFileChange(filePath, event) {
            if (event === 'unlink') return;

            // Only process relevant file types
            const ext = path.extname(filePath).toLowerCase();
            const relevantExts = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.html'];

            if (!relevantExts.includes(ext)) return;

            stats.filesChanged++;
            stats.lastChange = new Date();

            try {
                await translateCallback(filePath);
            } catch (error) {
                stats.errorsCount++;
                console.error(`Error processing ${filePath}:`, error);
            }
        },
    });

    return {
        async start() {
            watcher.start();
        },
        stop() {
            watcher.stop();
        },
        getStats() {
            return { ...stats };
        },
    };
}

/**
 * Format watch stats for display
 */
export function formatWatchStats(stats: WatchStats): string {
    const runtime = Date.now() - stats.startTime.getTime();
    const hours = Math.floor(runtime / 3600000);
    const minutes = Math.floor((runtime % 3600000) / 60000);
    const seconds = Math.floor((runtime % 60000) / 1000);

    const lines = [
        '📊 Watch Session Stats',
        '─'.repeat(40),
        `  Runtime:          ${hours}h ${minutes}m ${seconds}s`,
        `  Files changed:    ${stats.filesChanged}`,
        `  Strings updated:  ${stats.stringsTranslated}`,
        `  Errors:           ${stats.errorsCount}`,
    ];

    if (stats.lastChange) {
        lines.push(`  Last change:      ${stats.lastChange.toLocaleTimeString()}`);
    }

    return lines.join('\n');
}
