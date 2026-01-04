/**
 * Translation Manager - Multi-service translation with free options
 * Supports: DeepL, Google, LibreTranslate, Lingva, MyMemory, Mock/Pseudo
 */

import axios, { AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import {
    MultilingualConfig,
    TranslationService,
    SupportedLanguage,
    TranslationResult,
    DEFAULT_CONFIG,
} from './types';

interface TranslationCache {
    [key: string]: {
        [targetLang: string]: string;
    };
}

interface TranslationMemoryEntry {
    source: string;
    target: string;
    sourceLang: string;
    targetLang: string;
    service: string;
    timestamp: number;
    context?: string;
}

interface TranslationMemory {
    version: string;
    entries: TranslationMemoryEntry[];
}

interface QualityReport {
    score: number;
    issues: string[];
    suggestions: string[];
}

// Extended translation service types
export type ExtendedTranslationService =
    | TranslationService
    | 'libretranslate' | 'lingva' | 'mymemory' | 'argos' | 'pseudo'
    // Local/Offline methods
    | 'dictionary' | 'local'
    // Creative/Fun methods  
    | 'piglatin' | 'emoji' | 'leet' | 'reverse' | 'mirror' | 'uppercase' | 'morse' | 'nato';

// Built-in dictionaries for common phrases (offline translation)
const BUILT_IN_DICTIONARIES: Record<string, Record<string, Record<string, string>>> = {
    en: {
        es: {
            'hello': 'hola', 'goodbye': 'adiós', 'yes': 'sí', 'no': 'no',
            'please': 'por favor', 'thank you': 'gracias', 'thanks': 'gracias',
            'welcome': 'bienvenido', 'sorry': 'lo siento', 'excuse me': 'disculpe',
            'good morning': 'buenos días', 'good afternoon': 'buenas tardes',
            'good evening': 'buenas noches', 'good night': 'buenas noches',
            'how are you': 'cómo estás', 'i am fine': 'estoy bien',
            'what is your name': 'cómo te llamas', 'my name is': 'me llamo',
            'nice to meet you': 'mucho gusto', 'see you later': 'hasta luego',
            'i love you': 'te quiero', 'help': 'ayuda', 'stop': 'pare',
            'go': 'ir', 'come': 'ven', 'eat': 'comer', 'drink': 'beber',
            'water': 'agua', 'food': 'comida', 'money': 'dinero',
            'today': 'hoy', 'tomorrow': 'mañana', 'yesterday': 'ayer',
            'now': 'ahora', 'later': 'después', 'never': 'nunca', 'always': 'siempre',
            'here': 'aquí', 'there': 'allí', 'where': 'dónde', 'when': 'cuándo',
            'why': 'por qué', 'how': 'cómo', 'what': 'qué', 'who': 'quién',
            'this': 'esto', 'that': 'eso', 'these': 'estos', 'those': 'esos',
            'i': 'yo', 'you': 'tú', 'he': 'él', 'she': 'ella', 'we': 'nosotros',
            'they': 'ellos', 'it': 'eso', 'the': 'el', 'a': 'un', 'an': 'un',
            'and': 'y', 'or': 'o', 'but': 'pero', 'if': 'si', 'then': 'entonces',
            'because': 'porque', 'so': 'así que', 'very': 'muy', 'too': 'también',
            'more': 'más', 'less': 'menos', 'many': 'muchos', 'few': 'pocos',
            'all': 'todos', 'some': 'algunos', 'any': 'cualquier', 'none': 'ninguno',
            'good': 'bueno', 'bad': 'malo', 'big': 'grande', 'small': 'pequeño',
            'new': 'nuevo', 'old': 'viejo', 'young': 'joven', 'hot': 'caliente',
            'cold': 'frío', 'happy': 'feliz', 'sad': 'triste', 'fast': 'rápido',
            'slow': 'lento', 'easy': 'fácil', 'hard': 'difícil', 'open': 'abrir',
            'close': 'cerrar', 'start': 'empezar', 'end': 'terminar', 'buy': 'comprar',
            'sell': 'vender', 'give': 'dar', 'take': 'tomar', 'make': 'hacer',
            'do': 'hacer', 'say': 'decir', 'speak': 'hablar', 'listen': 'escuchar',
            'read': 'leer', 'write': 'escribir', 'learn': 'aprender', 'teach': 'enseñar',
            'work': 'trabajar', 'play': 'jugar', 'run': 'correr', 'walk': 'caminar',
            'sit': 'sentar', 'stand': 'estar de pie', 'sleep': 'dormir', 'wake': 'despertar',
            'live': 'vivir', 'die': 'morir', 'love': 'amar', 'hate': 'odiar',
            'want': 'querer', 'need': 'necesitar', 'like': 'gustar', 'know': 'saber',
            'think': 'pensar', 'believe': 'creer', 'remember': 'recordar', 'forget': 'olvidar',
            'try': 'intentar', 'use': 'usar', 'find': 'encontrar', 'get': 'obtener',
            'put': 'poner', 'tell': 'decir', 'ask': 'preguntar', 'answer': 'responder',
            'call': 'llamar', 'leave': 'salir', 'enter': 'entrar', 'wait': 'esperar',
            'stay': 'quedarse', 'begin': 'comenzar', 'seem': 'parecer', 'show': 'mostrar',
            'hear': 'oír', 'let': 'dejar', 'keep': 'mantener', 'set': 'establecer',
            'bring': 'traer', 'happen': 'suceder', 'turn': 'girar', 'move': 'mover',
            'must': 'deber', 'should': 'debería', 'would': 'haría', 'could': 'podría',
            'can': 'puede', 'may': 'puede', 'will': 'voluntad', 'shall': 'deberá',
        },
        fr: {
            'hello': 'bonjour', 'goodbye': 'au revoir', 'yes': 'oui', 'no': 'non',
            'please': 's\'il vous plaît', 'thank you': 'merci', 'thanks': 'merci',
            'welcome': 'bienvenue', 'sorry': 'désolé', 'excuse me': 'excusez-moi',
            'good morning': 'bonjour', 'good afternoon': 'bon après-midi',
            'good evening': 'bonsoir', 'good night': 'bonne nuit',
            'how are you': 'comment allez-vous', 'i am fine': 'je vais bien',
            'my name is': 'je m\'appelle', 'nice to meet you': 'enchanté',
            'see you later': 'à plus tard', 'i love you': 'je t\'aime',
            'help': 'aide', 'stop': 'arrêtez', 'water': 'eau', 'food': 'nourriture',
            'today': 'aujourd\'hui', 'tomorrow': 'demain', 'yesterday': 'hier',
        },
        de: {
            'hello': 'hallo', 'goodbye': 'auf wiedersehen', 'yes': 'ja', 'no': 'nein',
            'please': 'bitte', 'thank you': 'danke', 'thanks': 'danke',
            'welcome': 'willkommen', 'sorry': 'entschuldigung', 'excuse me': 'entschuldigen sie',
            'good morning': 'guten morgen', 'good afternoon': 'guten tag',
            'good evening': 'guten abend', 'good night': 'gute nacht',
            'how are you': 'wie geht es ihnen', 'i am fine': 'mir geht es gut',
            'my name is': 'ich heiße', 'nice to meet you': 'freut mich',
            'see you later': 'bis später', 'i love you': 'ich liebe dich',
            'help': 'hilfe', 'stop': 'halt', 'water': 'wasser', 'food': 'essen',
        },
        ja: {
            'hello': 'こんにちは', 'goodbye': 'さようなら', 'yes': 'はい', 'no': 'いいえ',
            'please': 'お願いします', 'thank you': 'ありがとう', 'thanks': 'ありがとう',
            'welcome': 'ようこそ', 'sorry': 'ごめんなさい', 'excuse me': 'すみません',
            'good morning': 'おはよう', 'good afternoon': 'こんにちは',
            'good evening': 'こんばんは', 'good night': 'おやすみなさい',
            'i love you': '愛しています', 'help': '助けて', 'water': '水',
        },
        zh: {
            'hello': '你好', 'goodbye': '再见', 'yes': '是', 'no': '不',
            'please': '请', 'thank you': '谢谢', 'thanks': '谢谢',
            'welcome': '欢迎', 'sorry': '对不起', 'excuse me': '打扰一下',
            'good morning': '早上好', 'good afternoon': '下午好',
            'good evening': '晚上好', 'good night': '晚安',
            'i love you': '我爱你', 'help': '帮助', 'water': '水',
        },
        ko: {
            'hello': '안녕하세요', 'goodbye': '안녕히 가세요', 'yes': '네', 'no': '아니요',
            'please': '제발', 'thank you': '감사합니다', 'thanks': '고마워요',
            'welcome': '환영합니다', 'sorry': '미안합니다', 'i love you': '사랑해요',
        },
        ar: {
            'hello': 'مرحبا', 'goodbye': 'مع السلامة', 'yes': 'نعم', 'no': 'لا',
            'please': 'من فضلك', 'thank you': 'شكرا', 'welcome': 'أهلا وسهلا',
            'sorry': 'آسف', 'i love you': 'أحبك', 'help': 'مساعدة',
        },
        ru: {
            'hello': 'привет', 'goodbye': 'до свидания', 'yes': 'да', 'no': 'нет',
            'please': 'пожалуйста', 'thank you': 'спасибо', 'welcome': 'добро пожаловать',
            'sorry': 'извините', 'i love you': 'я тебя люблю', 'help': 'помощь',
        },
        pt: {
            'hello': 'olá', 'goodbye': 'adeus', 'yes': 'sim', 'no': 'não',
            'please': 'por favor', 'thank you': 'obrigado', 'welcome': 'bem-vindo',
            'sorry': 'desculpe', 'i love you': 'eu te amo', 'help': 'ajuda',
        },
        it: {
            'hello': 'ciao', 'goodbye': 'arrivederci', 'yes': 'sì', 'no': 'no',
            'please': 'per favore', 'thank you': 'grazie', 'welcome': 'benvenuto',
            'sorry': 'mi dispiace', 'i love you': 'ti amo', 'help': 'aiuto',
        },
    },
};

// Emoji mappings for common words
const EMOJI_MAP: Record<string, string> = {
    'hello': '👋', 'hi': '👋', 'hey': '👋', 'goodbye': '👋😢', 'bye': '👋',
    'yes': '✅', 'no': '❌', 'maybe': '🤔', 'ok': '👍', 'okay': '👍',
    'good': '👍', 'bad': '👎', 'great': '🎉', 'awesome': '🔥', 'amazing': '🤩',
    'love': '❤️', 'heart': '❤️', 'like': '👍', 'hate': '😡', 'happy': '😊',
    'sad': '😢', 'angry': '😠', 'laugh': '😂', 'cry': '😭', 'smile': '😊',
    'think': '🤔', 'idea': '💡', 'question': '❓', 'answer': '💬', 'help': '🆘',
    'warning': '⚠️', 'error': '❌', 'success': '✅', 'info': 'ℹ️', 'note': '📝',
    'save': '💾', 'delete': '🗑️', 'edit': '✏️', 'add': '➕', 'remove': '➖',
    'search': '🔍', 'find': '🔍', 'settings': '⚙️', 'config': '⚙️', 'user': '👤',
    'users': '👥', 'home': '🏠', 'house': '🏠', 'work': '💼', 'office': '🏢',
    'email': '📧', 'mail': '📧', 'phone': '📱', 'call': '📞', 'message': '💬',
    'chat': '💬', 'send': '📤', 'receive': '📥', 'upload': '⬆️', 'download': '⬇️',
    'file': '📄', 'folder': '📁', 'document': '📄', 'image': '🖼️', 'photo': '📷',
    'video': '🎬', 'music': '🎵', 'audio': '🔊', 'play': '▶️', 'pause': '⏸️',
    'stop': '⏹️', 'next': '⏭️', 'previous': '⏮️', 'fast': '⚡', 'slow': '🐢',
    'time': '⏰', 'clock': '🕐', 'calendar': '📅', 'date': '📅', 'today': '📆',
    'sun': '☀️', 'moon': '🌙', 'star': '⭐', 'weather': '🌤️', 'rain': '🌧️',
    'snow': '❄️', 'hot': '🔥', 'cold': '🥶', 'fire': '🔥', 'water': '💧',
    'food': '🍔', 'eat': '🍽️', 'drink': '🥤', 'coffee': '☕', 'pizza': '🍕',
    'money': '💰', 'dollar': '💵', 'card': '💳', 'shop': '🛒', 'cart': '🛒',
    'car': '🚗', 'bus': '🚌', 'train': '🚂', 'plane': '✈️', 'ship': '🚢',
    'world': '🌍', 'globe': '🌍', 'map': '🗺️', 'location': '📍', 'pin': '📌',
    'key': '🔑', 'lock': '🔒', 'unlock': '🔓', 'secure': '🔐', 'password': '🔑',
    'book': '📚', 'read': '📖', 'write': '✍️', 'pen': '🖊️', 'pencil': '✏️',
    'new': '🆕', 'free': '🆓', 'cool': '😎', 'top': '🔝',
    'up': '⬆️', 'down': '⬇️', 'left': '⬅️', 'right': '➡️', 'back': '🔙',
    'loading': '⏳', 'wait': '⏳', 'done': '✅', 'complete': '✅', 'finish': '🏁',
    'start': '🚀', 'launch': '🚀', 'begin': '▶️', 'end': '🔚', 'exit': '🚪',
    'dog': '🐕', 'cat': '🐱', 'bird': '🐦', 'fish': '🐟', 'animal': '🐾',
    'tree': '🌳', 'flower': '🌸', 'plant': '🌱', 'nature': '🌿', 'garden': '🌻',
    'gift': '🎁', 'party': '🎉', 'celebrate': '🎊', 'birthday': '🎂', 'cake': '🍰',
    'game': '🎮', 'sport': '⚽', 'ball': '🏀', 'run': '🏃', 'walk': '🚶',
    'sleep': '😴', 'dream': '💭', 'night': '🌙', 'morning': '🌅', 'day': '☀️',
    'code': '💻', 'program': '👨‍💻', 'developer': '👨‍💻', 'bug': '🐛', 'fix': '🔧',
    'rocket': '🚀', 'magic': '✨', 'sparkle': '✨', 'boom': '💥', 'zap': '⚡',
};

// NATO phonetic alphabet
const NATO_ALPHABET: Record<string, string> = {
    'a': 'Alpha', 'b': 'Bravo', 'c': 'Charlie', 'd': 'Delta', 'e': 'Echo',
    'f': 'Foxtrot', 'g': 'Golf', 'h': 'Hotel', 'i': 'India', 'j': 'Juliet',
    'k': 'Kilo', 'l': 'Lima', 'm': 'Mike', 'n': 'November', 'o': 'Oscar',
    'p': 'Papa', 'q': 'Quebec', 'r': 'Romeo', 's': 'Sierra', 't': 'Tango',
    'u': 'Uniform', 'v': 'Victor', 'w': 'Whiskey', 'x': 'X-ray', 'y': 'Yankee',
    'z': 'Zulu', '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four',
    '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Nine',
};

// Morse code
const MORSE_CODE: Record<string, string> = {
    'a': '.-', 'b': '-...', 'c': '-.-.', 'd': '-..', 'e': '.', 'f': '..-.',
    'g': '--.', 'h': '....', 'i': '..', 'j': '.---', 'k': '-.-', 'l': '.-..',
    'm': '--', 'n': '-.', 'o': '---', 'p': '.--.', 'q': '--.-', 'r': '.-.',
    's': '...', 't': '-', 'u': '..-', 'v': '...-', 'w': '.--', 'x': '-..-',
    'y': '-.--', 'z': '--..', '0': '-----', '1': '.----', '2': '..---',
    '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...',
    '8': '---..', '9': '----.', ' ': '/', '.': '.-.-.-', ',': '--..--',
    '?': '..--..', '!': '-.-.--', "'": '.----.', '"': '.-..-.', ':': '---...',
    ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '/': '-..-.',
    '(': '-.--.', ')': '-.--.-', '&': '.-...', '@': '.--.-.',
};

// L33t speak mappings
const LEET_MAP: Record<string, string> = {
    'a': '4', 'b': '8', 'c': '(', 'd': 'd', 'e': '3', 'f': 'f', 'g': '9',
    'h': '#', 'i': '1', 'j': 'j', 'k': 'k', 'l': '1', 'm': 'm', 'n': 'n',
    'o': '0', 'p': 'p', 'q': 'q', 'r': 'r', 's': '5', 't': '7', 'u': 'u',
    'v': 'v', 'w': 'w', 'x': 'x', 'y': 'y', 'z': '2',
};

// Mirror/flip text mappings
const MIRROR_MAP: Record<string, string> = {
    'a': 'ɐ', 'b': 'q', 'c': 'ɔ', 'd': 'p', 'e': 'ǝ', 'f': 'ɟ', 'g': 'ƃ',
    'h': 'ɥ', 'i': 'ᴉ', 'j': 'ɾ', 'k': 'ʞ', 'l': 'l', 'm': 'ɯ', 'n': 'u',
    'o': 'o', 'p': 'd', 'q': 'b', 'r': 'ɹ', 's': 's', 't': 'ʇ', 'u': 'n',
    'v': 'ʌ', 'w': 'ʍ', 'x': 'x', 'y': 'ʎ', 'z': 'z',
    'A': '∀', 'B': 'q', 'C': 'Ɔ', 'D': 'p', 'E': 'Ǝ', 'F': 'Ⅎ', 'G': '⅁',
    'H': 'H', 'I': 'I', 'J': 'ſ', 'K': '⋊', 'L': '˥', 'M': 'W', 'N': 'N',
    'O': 'O', 'P': 'Ԁ', 'Q': 'Ọ', 'R': 'ᴚ', 'S': 'S', 'T': '⊥', 'U': '∩',
    'V': 'Λ', 'W': 'M', 'X': 'X', 'Y': '⅄', 'Z': 'Z',
    '1': 'Ɩ', '2': 'ᄅ', '3': 'Ɛ', '4': 'ㄣ', '5': 'ϛ', '6': '9', '7': 'ㄥ',
    '8': '8', '9': '6', '0': '0', '.': '˙', ',': "'", '?': '¿', '!': '¡',
    "'": ',', '"': '„', '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{',
    '<': '>', '>': '<', '&': '⅋', '_': '‾',
};

export class TranslationManager {
    private config: MultilingualConfig;
    private cache: TranslationCache = {};
    private rateLimitDelay = 100; // ms between requests
    private translationMemory: TranslationMemory = { version: '1.0', entries: [] };
    private tmPath: string;
    private extendedService: ExtendedTranslationService;

    // Public LibreTranslate instances (no API key required)
    // Note: Public instances may be rate-limited or unavailable. Consider using Lingva as alternative.
    private libreTranslateInstances = [
        'https://libretranslate.de',
        'https://translate.terraprint.co',
        'https://trans.zillyhuhn.com',
        'https://libretranslate.pussthecat.org',
    ];

    // Lingva Translate instances (no API key required)
    private lingvaInstances = [
        'https://lingva.ml',
        'https://translate.plausibility.cloud',
        'https://lingva.lunar.icu',
    ];

    constructor(config: Partial<MultilingualConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.tmPath = path.join(this.config.projectRoot || process.cwd(), '.multilingual', 'translation-memory.json');
        this.extendedService = this.config.translationService as ExtendedTranslationService;
        this.loadTranslationMemory();
    }

    /**
     * Set extended translation service
     */
    setExtendedService(service: ExtendedTranslationService): void {
        this.extendedService = service;
        // Also update the base service if it's a standard one
        if (['deepl', 'google', 'none'].includes(service)) {
            this.config.translationService = service as TranslationService;
        }
    }

    /**
     * Load translation memory from disk
     */
    private loadTranslationMemory(): void {
        try {
            if (fs.existsSync(this.tmPath)) {
                const data = fs.readFileSync(this.tmPath, 'utf-8');
                this.translationMemory = JSON.parse(data);
            }
        } catch {
            this.translationMemory = { version: '1.0', entries: [] };
        }
    }

    /**
     * Save translation memory to disk
     */
    saveTranslationMemory(): void {
        try {
            const dir = path.dirname(this.tmPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.tmPath, JSON.stringify(this.translationMemory, null, 2));
        } catch {
            // Silently fail
        }
    }

    /**
     * Look up translation in memory with fuzzy matching
     */
    private lookupInMemory(
        text: string,
        targetLang: string,
        sourceLang: string,
        fuzzyThreshold = 0.85
    ): { translation: string; similarity: number } | null {
        const normalizedText = text.toLowerCase().trim();

        for (const entry of this.translationMemory.entries) {
            if (entry.sourceLang === sourceLang && entry.targetLang === targetLang) {
                const normalizedSource = entry.source.toLowerCase().trim();

                // Exact match
                if (normalizedSource === normalizedText) {
                    return { translation: entry.target, similarity: 1.0 };
                }

                // Fuzzy match
                const similarity = this.calculateSimilarity(normalizedText, normalizedSource);
                if (similarity >= fuzzyThreshold) {
                    return { translation: entry.target, similarity };
                }
            }
        }

        return null;
    }

    /**
     * Calculate string similarity (Levenshtein-based)
     */
    private calculateSimilarity(a: string, b: string): number {
        if (a === b) return 1;
        if (a.length === 0 || b.length === 0) return 0;

        const matrix: number[][] = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        const maxLen = Math.max(a.length, b.length);
        return 1 - matrix[b.length][a.length] / maxLen;
    }

    /**
     * Add entry to translation memory
     */
    private addToMemory(
        source: string,
        target: string,
        sourceLang: string,
        targetLang: string,
        service: string
    ): void {
        // Check for duplicates
        const exists = this.translationMemory.entries.some(
            e => e.source === source && e.targetLang === targetLang && e.sourceLang === sourceLang
        );

        if (!exists) {
            this.translationMemory.entries.push({
                source,
                target,
                sourceLang,
                targetLang,
                service,
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Translate a single string
     */
    async translate(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage?: SupportedLanguage
    ): Promise<TranslationResult> {
        const source = sourceLanguage || this.config.sourceLanguage;

        // Check cache
        const cacheKey = `${source}:${text}`;
        if (this.cache[cacheKey]?.[targetLanguage]) {
            return {
                success: true,
                text: this.cache[cacheKey][targetLanguage],
                service: this.config.translationService,
                cached: true,
            };
        }

        // Skip if source equals target
        if (source === targetLanguage) {
            return {
                success: true,
                text,
                service: 'none',
            };
        }

        // Check translation memory
        const memoryMatch = this.lookupInMemory(text, targetLanguage, source);
        if (memoryMatch && memoryMatch.similarity > 0.95) {
            // Cache it
            if (!this.cache[cacheKey]) this.cache[cacheKey] = {};
            this.cache[cacheKey][targetLanguage] = memoryMatch.translation;

            return {
                success: true,
                text: memoryMatch.translation,
                service: this.config.translationService,
                cached: true,
            };
        }

        try {
            let result: string;
            const service = this.extendedService || this.config.translationService;

            switch (service) {
                case 'deepl':
                    result = await this.translateWithDeepL(text, targetLanguage, source);
                    break;
                case 'google':
                    result = await this.translateWithGoogle(text, targetLanguage, source);
                    break;
                case 'libretranslate':
                    result = await this.translateWithLibreTranslate(text, targetLanguage, source);
                    break;
                case 'lingva':
                    result = await this.translateWithLingva(text, targetLanguage, source);
                    break;
                case 'mymemory':
                    result = await this.translateWithMyMemory(text, targetLanguage, source);
                    break;
                case 'argos':
                    result = await this.translateWithArgos(text, targetLanguage, source);
                    break;
                case 'pseudo':
                    result = this.generatePseudoTranslation(text);
                    break;
                // Local/Offline methods
                case 'dictionary':
                    result = this.translateWithDictionary(text, targetLanguage, source);
                    break;
                case 'local':
                    result = this.translateWithLocalDictionary(text, targetLanguage, source);
                    break;
                // Creative/Fun methods
                case 'piglatin':
                    result = this.translateToPigLatin(text);
                    break;
                case 'emoji':
                    result = this.translateToEmoji(text);
                    break;
                case 'leet':
                    result = this.translateToLeet(text);
                    break;
                case 'reverse':
                    result = this.translateToReverse(text);
                    break;
                case 'mirror':
                    result = this.translateToMirror(text);
                    break;
                case 'uppercase':
                    result = this.translateToUppercase(text);
                    break;
                case 'morse':
                    result = this.translateToMorse(text);
                    break;
                case 'nato':
                    result = this.translateToNato(text);
                    break;
                default:
                    return {
                        success: false,
                        error: 'No translation service configured',
                        service: 'none',
                    };
            }

            // Cache the result
            if (!this.cache[cacheKey]) {
                this.cache[cacheKey] = {};
            }
            this.cache[cacheKey][targetLanguage] = result;

            // Add to translation memory
            this.addToMemory(text, result, source, targetLanguage, service);

            return {
                success: true,
                text: result,
                service: this.config.translationService,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                error: errorMessage,
                service: this.config.translationService,
            };
        }
    }

    /**
     * Translate multiple strings in batch
     */
    async translateBatch(
        texts: string[],
        targetLanguage: SupportedLanguage,
        sourceLanguage?: SupportedLanguage,
        onProgress?: (completed: number, total: number) => void
    ): Promise<Map<string, TranslationResult>> {
        const results = new Map<string, TranslationResult>();
        const source = sourceLanguage || this.config.sourceLanguage;

        // Split into cached and uncached
        const uncached: string[] = [];
        const cacheKey = (text: string) => `${source}:${text}`;

        for (const text of texts) {
            if (this.cache[cacheKey(text)]?.[targetLanguage]) {
                results.set(text, {
                    success: true,
                    text: this.cache[cacheKey(text)][targetLanguage],
                    service: this.config.translationService,
                    cached: true,
                });
            } else {
                uncached.push(text);
            }
        }

        // Batch translate uncached strings
        if (uncached.length > 0) {
            const service = this.extendedService || this.config.translationService;

            if (service === 'deepl') {
                const batchResults = await this.batchTranslateDeepL(uncached, targetLanguage, source, onProgress);
                for (const [text, result] of batchResults) {
                    results.set(text, result);
                    if (result.success && result.text) {
                        if (!this.cache[cacheKey(text)]) {
                            this.cache[cacheKey(text)] = {};
                        }
                        this.cache[cacheKey(text)][targetLanguage] = result.text;
                    }
                }
            } else {
                // Sequential translation for other services
                let completed = texts.length - uncached.length;
                for (const text of uncached) {
                    const result = await this.translate(text, targetLanguage, source);
                    results.set(text, result);
                    completed++;
                    onProgress?.(completed, texts.length);
                    await this.delay(this.rateLimitDelay);
                }
            }
        }

        return results;
    }

    // =========================================================================
    // FREE TRANSLATION SERVICES (NO API KEY REQUIRED)
    // =========================================================================

    /**
     * Translate using LibreTranslate (FREE, no API key required)
     * Self-hosted or uses public instances
     */
    private async translateWithLibreTranslate(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage
    ): Promise<string> {
        // Try each instance until one works
        const instances = this.config.apiKey
            ? [this.config.apiKey] // If API key is provided, treat it as a custom instance URL
            : this.libreTranslateInstances;

        let lastError: Error | null = null;

        for (const instance of instances) {
            try {
                const response = await axios.post(
                    `${instance}/translate`,
                    {
                        q: text,
                        source: this.mapToLibreTranslateLanguage(sourceLanguage),
                        target: this.mapToLibreTranslateLanguage(targetLanguage),
                        format: 'text',
                    },
                    {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 10000,
                    }
                );

                if (response.data?.translatedText) {
                    return response.data.translatedText;
                }
            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                continue;
            }
        }

        throw lastError || new Error('All LibreTranslate instances failed');
    }

    /**
     * Translate using Lingva Translate (FREE, no API key required)
     * Privacy-focused Google Translate frontend
     */
    private async translateWithLingva(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage
    ): Promise<string> {
        const instances = this.config.apiKey
            ? [this.config.apiKey]
            : this.lingvaInstances;

        let lastError: Error | null = null;

        for (const instance of instances) {
            try {
                const source = this.mapToLingvaLanguage(sourceLanguage);
                const target = this.mapToLingvaLanguage(targetLanguage);
                const encodedText = encodeURIComponent(text);

                const response = await axios.get(
                    `${instance}/api/v1/${source}/${target}/${encodedText}`,
                    { timeout: 10000 }
                );

                if (response.data?.translation) {
                    return response.data.translation;
                }
            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                continue;
            }
        }

        throw lastError || new Error('All Lingva instances failed');
    }

    /**
     * Translate using MyMemory (FREE, 10,000 chars/day without API key)
     * Higher limits with free registration
     */
    private async translateWithMyMemory(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage
    ): Promise<string> {
        const langPair = `${sourceLanguage}|${targetLanguage}`;
        const params: Record<string, string> = {
            q: text,
            langpair: langPair,
        };

        // Add email for higher limits (100,000 chars/day)
        if (this.config.apiKey && this.config.apiKey.includes('@')) {
            params.de = this.config.apiKey; // email for higher limits
        }

        const response = await axios.get('https://api.mymemory.translated.net/get', {
            params,
            timeout: 10000,
        });

        if (response.data?.responseData?.translatedText) {
            const translated = response.data.responseData.translatedText;

            // MyMemory returns error messages in the translation field
            if (translated.includes('MYMEMORY WARNING') || translated.includes('QUOTA EXCEEDED')) {
                throw new Error('MyMemory quota exceeded. Register for higher limits.');
            }

            return translated;
        }

        throw new Error('Invalid response from MyMemory');
    }

    /**
     * Translate using Argos Translate (FREE, local or API)
     */
    private async translateWithArgos(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage
    ): Promise<string> {
        // Argos uses LibreTranslate API format
        const endpoint = this.config.apiKey || 'https://translate.argosopentech.com';

        const response = await axios.post(
            `${endpoint}/translate`,
            {
                q: text,
                source: sourceLanguage,
                target: targetLanguage,
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000,
            }
        );

        if (response.data?.translatedText) {
            return response.data.translatedText;
        }

        throw new Error('Invalid response from Argos Translate');
    }

    /**
     * Generate pseudo-translation for testing
     * Creates text like: [Ḧḛŀŀő Ẇőřŀḓ] to test UI rendering
     */
    generatePseudoTranslation(text: string): string {
        const pseudoMap: Record<string, string> = {
            'a': 'ȧ', 'b': 'ƀ', 'c': 'ƈ', 'd': 'ḓ', 'e': 'ḛ', 'f': 'ƒ',
            'g': 'ɠ', 'h': 'ḥ', 'i': 'ī', 'j': 'ĵ', 'k': 'ķ', 'l': 'ŀ',
            'm': 'ḿ', 'n': 'ƞ', 'o': 'ő', 'p': 'ƥ', 'q': 'ʠ', 'r': 'ř',
            's': 'ş', 't': 'ŧ', 'u': 'ŭ', 'v': 'ṽ', 'w': 'ẇ', 'x': 'ẋ',
            'y': 'ẏ', 'z': 'ẑ',
            'A': 'Ȧ', 'B': 'Ɓ', 'C': 'Ƈ', 'D': 'Ḓ', 'E': 'Ḛ', 'F': 'Ƒ',
            'G': 'Ɠ', 'H': 'Ḥ', 'I': 'Ī', 'J': 'Ĵ', 'K': 'Ķ', 'L': 'Ŀ',
            'M': 'Ḿ', 'N': 'Ƞ', 'O': 'Ő', 'P': 'Ƥ', 'Q': 'Ǫ', 'R': 'Ř',
            'S': 'Ş', 'T': 'Ŧ', 'U': 'Ŭ', 'V': 'Ṽ', 'W': 'Ẇ', 'X': 'Ẋ',
            'Y': 'Ẏ', 'Z': 'Ẑ',
        };

        // Preserve placeholders and HTML
        const preservePattern = /(\{[^}]+\}|\{\{[^}]+\}\}|<[^>]+>|\$\{[^}]+\}|%[sd]|\$\w+)/g;
        const preservedSegments: string[] = [];
        let idx = 0;

        const textWithPlaceholders = text.replace(preservePattern, (match) => {
            preservedSegments.push(match);
            return `\x00${idx++}\x00`;
        });

        // Convert characters
        let pseudo = '';
        for (const char of textWithPlaceholders) {
            pseudo += pseudoMap[char] || char;
        }

        // Add length expansion (~30% for most languages)
        const expansion = Math.floor(text.length * 0.3);
        pseudo += '~'.repeat(expansion);

        // Restore preserved segments
        for (let i = 0; i < preservedSegments.length; i++) {
            pseudo = pseudo.replace(`\x00${i}\x00`, preservedSegments[i]);
        }

        // Wrap in brackets for visibility
        return `[${pseudo}]`;
    }

    // =========================================================================
    // LOCAL/OFFLINE TRANSLATION METHODS (NO INTERNET REQUIRED)
    // =========================================================================

    /**
     * Translate using built-in dictionaries (completely offline)
     * Best for common phrases - falls back to original if not found
     */
    private translateWithDictionary(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage
    ): string {
        const dictionary = BUILT_IN_DICTIONARIES[sourceLanguage]?.[targetLanguage];
        if (!dictionary) {
            // No dictionary for this language pair, return original
            return text;
        }

        const lowerText = text.toLowerCase().trim();

        // Try exact match first
        if (dictionary[lowerText]) {
            // Preserve original casing pattern
            return this.matchCase(text, dictionary[lowerText]);
        }

        // Try word-by-word translation
        const words = text.split(/(\s+)/);
        let translated = '';
        let anyTranslated = false;

        for (const word of words) {
            const lowerWord = word.toLowerCase();
            if (dictionary[lowerWord]) {
                translated += this.matchCase(word, dictionary[lowerWord]);
                anyTranslated = true;
            } else {
                translated += word;
            }
        }

        return anyTranslated ? translated : text;
    }

    /**
     * Load and use a local JSON dictionary file
     */
    private translateWithLocalDictionary(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage
    ): string {
        // Look for local dictionary files in .multilingual/dictionaries/
        const dictPath = path.join(
            this.config.projectRoot || process.cwd(),
            '.multilingual',
            'dictionaries',
            `${sourceLanguage}-${targetLanguage}.json`
        );

        try {
            if (fs.existsSync(dictPath)) {
                const dictionary = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
                const lowerText = text.toLowerCase().trim();

                if (dictionary[lowerText]) {
                    return this.matchCase(text, dictionary[lowerText]);
                }

                // Word-by-word
                const words = text.split(/(\s+)/);
                let translated = '';

                for (const word of words) {
                    const lowerWord = word.toLowerCase();
                    translated += dictionary[lowerWord]
                        ? this.matchCase(word, dictionary[lowerWord])
                        : word;
                }

                return translated;
            }
        } catch {
            // Ignore errors, fall back to built-in
        }

        // Fall back to built-in dictionary
        return this.translateWithDictionary(text, targetLanguage, sourceLanguage);
    }

    /**
     * Match the case pattern of the original text to the translation
     */
    private matchCase(original: string, translated: string): string {
        if (original === original.toUpperCase()) {
            return translated.toUpperCase();
        }
        if (original === original.toLowerCase()) {
            return translated.toLowerCase();
        }
        if (original[0] === original[0].toUpperCase()) {
            return translated.charAt(0).toUpperCase() + translated.slice(1).toLowerCase();
        }
        return translated;
    }

    // =========================================================================
    // CREATIVE/FUN TRANSLATION METHODS (FOR TESTING & ENTERTAINMENT)
    // =========================================================================

    /**
     * Convert text to Pig Latin
     * "Hello World" → "Ellohay Orldway"
     */
    private translateToPigLatin(text: string): string {
        const preservePattern = /(\{[^}]+\}|\{\{[^}]+\}\}|<[^>]+>|\$\{[^}]+\}|%[sd]|\$\w+)/g;
        const preservedSegments: string[] = [];
        let idx = 0;

        const textWithPlaceholders = text.replace(preservePattern, (match) => {
            preservedSegments.push(match);
            return `\x00${idx++}\x00`;
        });

        const vowels = 'aeiouAEIOU';
        const words = textWithPlaceholders.split(/(\s+)/);

        const pigLatinWords = words.map(word => {
            // Skip whitespace
            if (/^\s+$/.test(word)) return word;
            // Skip placeholders
            if (/^\x00\d+\x00$/.test(word)) return word;

            // Handle punctuation at end
            const punctMatch = word.match(/^([a-zA-Z]+)([^a-zA-Z]*)$/);
            if (!punctMatch) return word;

            const [, letters, punct] = punctMatch;
            if (letters.length === 0) return word;

            const isUpperFirst = letters[0] === letters[0].toUpperCase();
            const lowerLetters = letters.toLowerCase();

            let result: string;
            if (vowels.includes(lowerLetters[0])) {
                result = lowerLetters + 'way';
            } else {
                // Find first vowel
                let firstVowelIdx = -1;
                for (let i = 0; i < lowerLetters.length; i++) {
                    if (vowels.toLowerCase().includes(lowerLetters[i])) {
                        firstVowelIdx = i;
                        break;
                    }
                }
                if (firstVowelIdx === -1) {
                    result = lowerLetters + 'ay';
                } else {
                    result = lowerLetters.slice(firstVowelIdx) + lowerLetters.slice(0, firstVowelIdx) + 'ay';
                }
            }

            if (isUpperFirst) {
                result = result.charAt(0).toUpperCase() + result.slice(1);
            }

            return result + punct;
        });

        let pigLatin = pigLatinWords.join('');

        // Restore preserved segments
        for (let i = 0; i < preservedSegments.length; i++) {
            pigLatin = pigLatin.replace(`\x00${i}\x00`, preservedSegments[i]);
        }

        return pigLatin;
    }

    /**
     * Convert text to emoji representation
     * "Hello World" → "👋 🌍"
     */
    private translateToEmoji(text: string): string {
        const preservePattern = /(\{[^}]+\}|\{\{[^}]+\}\}|<[^>]+>|\$\{[^}]+\}|%[sd]|\$\w+)/g;
        const preservedSegments: string[] = [];
        let idx = 0;

        const textWithPlaceholders = text.replace(preservePattern, (match) => {
            preservedSegments.push(match);
            return `\x00${idx++}\x00`;
        });

        const words = textWithPlaceholders.split(/(\s+)/);
        const emojiWords = words.map(word => {
            if (/^\s+$/.test(word)) return word;
            if (/^\x00\d+\x00$/.test(word)) return word;

            const lowerWord = word.toLowerCase().replace(/[^a-z]/g, '');
            return EMOJI_MAP[lowerWord] || word;
        });

        let result = emojiWords.join('');

        // Restore preserved segments
        for (let i = 0; i < preservedSegments.length; i++) {
            result = result.replace(`\x00${i}\x00`, preservedSegments[i]);
        }

        return result;
    }

    /**
     * Convert text to l33t speak
     * "Hello" → "#3110"
     */
    private translateToLeet(text: string): string {
        const preservePattern = /(\{[^}]+\}|\{\{[^}]+\}\}|<[^>]+>|\$\{[^}]+\}|%[sd]|\$\w+)/g;
        const preservedSegments: string[] = [];
        let idx = 0;

        const textWithPlaceholders = text.replace(preservePattern, (match) => {
            preservedSegments.push(match);
            return `\x00${idx++}\x00`;
        });

        let leet = '';
        for (const char of textWithPlaceholders) {
            const lower = char.toLowerCase();
            leet += LEET_MAP[lower] || char;
        }

        // Restore preserved segments
        for (let i = 0; i < preservedSegments.length; i++) {
            leet = leet.replace(`\x00${i}\x00`, preservedSegments[i]);
        }

        return leet;
    }

    /**
     * Reverse text (useful for RTL testing)
     * "Hello" → "olleH"
     */
    private translateToReverse(text: string): string {
        const preservePattern = /(\{[^}]+\}|\{\{[^}]+\}\}|<[^>]+>|\$\{[^}]+\}|%[sd]|\$\w+)/g;
        const preservedSegments: string[] = [];
        let idx = 0;

        const textWithPlaceholders = text.replace(preservePattern, (match) => {
            preservedSegments.push(match);
            return `\x00${idx++}\x00`;
        });

        // Reverse while keeping placeholders in order
        const reversed = textWithPlaceholders.split('').reverse().join('');

        // Restore preserved segments (in reverse order since text is reversed)
        let result = reversed;
        for (let i = preservedSegments.length - 1; i >= 0; i--) {
            result = result.replace(`\x00${i}\x00`, preservedSegments[i]);
        }

        return result;
    }

    /**
     * Mirror/flip text upside down
     * "Hello" → "oןןǝH"
     */
    private translateToMirror(text: string): string {
        const preservePattern = /(\{[^}]+\}|\{\{[^}]+\}\}|<[^>]+>|\$\{[^}]+\}|%[sd]|\$\w+)/g;
        const preservedSegments: string[] = [];
        let idx = 0;

        const textWithPlaceholders = text.replace(preservePattern, (match) => {
            preservedSegments.push(match);
            return `\x00${idx++}\x00`;
        });

        let mirror = '';
        for (const char of textWithPlaceholders) {
            mirror += MIRROR_MAP[char] || char;
        }

        // Reverse the string as well (upside down reading)
        mirror = mirror.split('').reverse().join('');

        // Restore preserved segments
        for (let i = 0; i < preservedSegments.length; i++) {
            mirror = mirror.replace(`\x00${i}\x00`, preservedSegments[i]);
        }

        return mirror;
    }

    /**
     * Convert text to UPPERCASE (for emphasis testing)
     */
    private translateToUppercase(text: string): string {
        const preservePattern = /(\{[^}]+\}|\{\{[^}]+\}\}|<[^>]+>|\$\{[^}]+\}|%[sd]|\$\w+)/g;
        const preservedSegments: string[] = [];
        let idx = 0;

        const textWithPlaceholders = text.replace(preservePattern, (match) => {
            preservedSegments.push(match);
            return `\x00${idx++}\x00`;
        });

        let upper = textWithPlaceholders.toUpperCase();

        // Restore preserved segments
        for (let i = 0; i < preservedSegments.length; i++) {
            upper = upper.replace(`\x00${i}\x00`, preservedSegments[i]);
        }

        return upper;
    }

    /**
     * Convert text to Morse code
     * "Hello" → ".... . .-.. .-.. ---"
     */
    private translateToMorse(text: string): string {
        const preservePattern = /(\{[^}]+\}|\{\{[^}]+\}\}|<[^>]+>|\$\{[^}]+\}|%[sd]|\$\w+)/g;
        const preservedSegments: string[] = [];
        let idx = 0;

        const textWithPlaceholders = text.replace(preservePattern, (match) => {
            preservedSegments.push(match);
            return `\x00${idx++}\x00`;
        });

        const morseChars: string[] = [];
        for (const char of textWithPlaceholders.toLowerCase()) {
            if (char === '\x00') {
                // Handle placeholder markers
                morseChars.push(char);
            } else {
                morseChars.push(MORSE_CODE[char] || char);
            }
        }

        let morse = morseChars.join(' ').replace(/  +/g, ' / ');

        // Restore preserved segments
        for (let i = 0; i < preservedSegments.length; i++) {
            morse = morse.replace(`\x00 ${i} \x00`, preservedSegments[i]);
        }

        return morse;
    }

    /**
     * Convert text to NATO phonetic alphabet
     * "Hello" → "Hotel Echo Lima Lima Oscar"
     */
    private translateToNato(text: string): string {
        const preservePattern = /(\{[^}]+\}|\{\{[^}]+\}\}|<[^>]+>|\$\{[^}]+\}|%[sd]|\$\w+)/g;
        const preservedSegments: string[] = [];
        let idx = 0;

        const textWithPlaceholders = text.replace(preservePattern, (match) => {
            preservedSegments.push(match);
            return `\x00${idx++}\x00`;
        });

        const natoWords: string[] = [];
        for (const char of textWithPlaceholders.toLowerCase()) {
            if (char === ' ') {
                natoWords.push('/');
            } else if (char === '\x00') {
                natoWords.push(char);
            } else if (NATO_ALPHABET[char]) {
                natoWords.push(NATO_ALPHABET[char]);
            } else {
                natoWords.push(char);
            }
        }

        let nato = natoWords.join(' ');

        // Restore preserved segments
        for (let i = 0; i < preservedSegments.length; i++) {
            nato = nato.replace(`\x00 ${i} \x00`, preservedSegments[i]);
        }

        return nato;
    }

    // =========================================================================
    // PAID TRANSLATION SERVICES
    // =========================================================================

    /**
     * Translate using DeepL API
     */
    private async translateWithDeepL(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage
    ): Promise<string> {
        if (!this.config.apiKey) {
            throw new Error('DeepL API key not configured');
        }

        // Determine API endpoint (free vs pro)
        const isFreeKey = this.config.apiKey.endsWith(':fx');
        const baseUrl = isFreeKey
            ? 'https://api-free.deepl.com/v2'
            : 'https://api.deepl.com/v2';

        const response = await axios.post(
            `${baseUrl}/translate`,
            new URLSearchParams({
                text,
                source_lang: this.mapToDeepLLanguage(sourceLanguage),
                target_lang: this.mapToDeepLLanguage(targetLanguage),
            }),
            {
                headers: {
                    'Authorization': `DeepL-Auth-Key ${this.config.apiKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        if (response.data?.translations?.[0]?.text) {
            return response.data.translations[0].text;
        }

        throw new Error('Invalid response from DeepL');
    }

    /**
     * Batch translate using DeepL API
     */
    private async batchTranslateDeepL(
        texts: string[],
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage,
        onProgress?: (completed: number, total: number) => void
    ): Promise<Map<string, TranslationResult>> {
        const results = new Map<string, TranslationResult>();

        if (!this.config.apiKey) {
            for (const text of texts) {
                results.set(text, {
                    success: false,
                    error: 'DeepL API key not configured',
                    service: 'deepl',
                });
            }
            return results;
        }

        // DeepL supports batch requests (up to 50 texts)
        const batchSize = 50;
        const batches: string[][] = [];

        for (let i = 0; i < texts.length; i += batchSize) {
            batches.push(texts.slice(i, i + batchSize));
        }

        const isFreeKey = this.config.apiKey.endsWith(':fx');
        const baseUrl = isFreeKey
            ? 'https://api-free.deepl.com/v2'
            : 'https://api.deepl.com/v2';

        let completed = 0;

        for (const batch of batches) {
            try {
                const params = new URLSearchParams();
                batch.forEach(text => params.append('text', text));
                params.append('source_lang', this.mapToDeepLLanguage(sourceLanguage));
                params.append('target_lang', this.mapToDeepLLanguage(targetLanguage));

                const response = await axios.post(`${baseUrl}/translate`, params, {
                    headers: {
                        'Authorization': `DeepL-Auth-Key ${this.config.apiKey}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                });

                if (response.data?.translations) {
                    response.data.translations.forEach((translation: { text: string }, index: number) => {
                        results.set(batch[index], {
                            success: true,
                            text: translation.text,
                            service: 'deepl',
                        });
                    });
                }

                completed += batch.length;
                onProgress?.(completed, texts.length);

                // Rate limiting
                await this.delay(this.rateLimitDelay);
            } catch (error) {
                const errorMessage = this.handleApiError(error, 'deepl');
                for (const text of batch) {
                    results.set(text, {
                        success: false,
                        error: errorMessage,
                        service: 'deepl',
                    });
                }
            }
        }

        return results;
    }

    /**
     * Translate using Google Cloud Translation API
     */
    private async translateWithGoogle(
        text: string,
        targetLanguage: SupportedLanguage,
        sourceLanguage: SupportedLanguage
    ): Promise<string> {
        if (!this.config.apiKey) {
            throw new Error('Google Cloud Translation API key not configured');
        }

        const response = await axios.post(
            `https://translation.googleapis.com/language/translate/v2`,
            {
                q: text,
                source: this.mapToGoogleLanguage(sourceLanguage),
                target: this.mapToGoogleLanguage(targetLanguage),
                format: 'text',
            },
            {
                params: {
                    key: this.config.apiKey,
                },
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.data?.data?.translations?.[0]?.translatedText) {
            return response.data.data.translations[0].translatedText;
        }

        throw new Error('Invalid response from Google Translate');
    }

    // =========================================================================
    // LANGUAGE MAPPING
    // =========================================================================

    private mapToDeepLLanguage(lang: SupportedLanguage): string {
        const mapping: Partial<Record<SupportedLanguage, string>> = {
            'zh': 'ZH',
            'zh-TW': 'ZH',
            'pt-BR': 'PT-BR',
            'pt': 'PT-PT',
            'en': 'EN',
        };
        return (mapping[lang] || lang).toUpperCase();
    }

    private mapToGoogleLanguage(lang: SupportedLanguage): string {
        const mapping: Partial<Record<SupportedLanguage, string>> = {
            'zh': 'zh-CN',
            'zh-TW': 'zh-TW',
        };
        return mapping[lang] || lang;
    }

    // Lingva uses simpler codes
    private mapToLingvaLanguage(lang: SupportedLanguage): string {
        const mapping: Partial<Record<SupportedLanguage, string>> = {
            'zh': 'zh',
            'zh-TW': 'zh_Hant',
            'pt-BR': 'pt',
        };
        return mapping[lang] || lang;
    }

    private mapToLibreTranslateLanguage(lang: SupportedLanguage): string {
        const mapping: Partial<Record<SupportedLanguage, string>> = {
            'zh': 'zh',
            'zh-TW': 'zh',
            'pt-BR': 'pt',
        };
        return mapping[lang] || lang;
    }

    // =========================================================================
    // VALIDATION & QUALITY
    // =========================================================================

    /**
     * Validate translation quality
     */
    validateTranslation(source: string, translation: string): QualityReport {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let score = 100;

        // Check for placeholder preservation
        const sourcePlaceholders = source.match(/\{[^}]+\}|\{\{[^}]+\}\}|\$\{[^}]+\}|%[sd]/g) || [];
        const translationPlaceholders = translation.match(/\{[^}]+\}|\{\{[^}]+\}\}|\$\{[^}]+\}|%[sd]/g) || [];

        if (sourcePlaceholders.length !== translationPlaceholders.length) {
            issues.push(`Placeholder count mismatch: source has ${sourcePlaceholders.length}, translation has ${translationPlaceholders.length}`);
            score -= 30;
        }

        // Check for HTML tag preservation
        const sourceHtml = source.match(/<[^>]+>/g) || [];
        const translationHtml = translation.match(/<[^>]+>/g) || [];

        if (sourceHtml.length !== translationHtml.length) {
            issues.push(`HTML tag count mismatch: source has ${sourceHtml.length}, translation has ${translationHtml.length}`);
            score -= 20;
        }

        // Check for excessive length difference (>50% expansion is suspicious)
        const lengthRatio = translation.length / source.length;
        if (lengthRatio > 2) {
            issues.push('Translation is suspiciously longer than source');
            suggestions.push('Review translation for unnecessary content');
            score -= 10;
        }

        // Check for untranslated content (exact match usually means failure)
        if (source === translation && source.length > 3) {
            issues.push('Translation appears unchanged from source');
            score -= 40;
        }

        // Check for common machine translation issues
        if (translation.includes('MYMEMORY') || translation.includes('QUOTA')) {
            issues.push('Translation contains error message');
            score -= 50;
        }

        return {
            score: Math.max(0, score),
            issues,
            suggestions,
        };
    }

    /**
     * Detect interpolation patterns in text
     */
    detectInterpolations(text: string): { type: string; pattern: string; position: number }[] {
        const patterns = [
            { type: 'react', pattern: /{[^}]+}/g },
            { type: 'vue', pattern: /\{\{[^}]+\}\}/g },
            { type: 'template-literal', pattern: /\$\{[^}]+\}/g },
            { type: 'printf', pattern: /%[sd]/g },
            { type: 'named', pattern: /:(\w+)/g },
            { type: 'angular', pattern: /{{[^}]+}}/g },
            { type: 'ruby', pattern: /%{[^}]+}/g },
            { type: 'php', pattern: /\$\w+/g },
        ];

        const results: { type: string; pattern: string; position: number }[] = [];

        for (const { type, pattern } of patterns) {
            let match;
            const regex = new RegExp(pattern.source, 'g');
            while ((match = regex.exec(text)) !== null) {
                results.push({
                    type,
                    pattern: match[0],
                    position: match.index,
                });
            }
        }

        return results;
    }

    // =========================================================================
    // ERROR HANDLING
    // =========================================================================

    private handleApiError(error: unknown, service: ExtendedTranslationService): string {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<{ message?: string; error?: { message?: string } }>;

            if (axiosError.response) {
                const status = axiosError.response.status;
                const data = axiosError.response.data;

                switch (status) {
                    case 401:
                    case 403:
                        return `${service.toUpperCase()} API key is invalid or expired`;
                    case 429:
                        return `${service.toUpperCase()} rate limit exceeded. Please try again later.`;
                    case 456:
                        return `${service.toUpperCase()} quota exceeded. Please check your plan limits.`;
                    case 500:
                    case 503:
                        return `${service.toUpperCase()} service temporarily unavailable`;
                    default:
                        return data?.message || data?.error?.message || `${service.toUpperCase()} error: ${status}`;
                }
            }

            if (axiosError.request) {
                return `Network error: Unable to reach ${service.toUpperCase()} API`;
            }
        }

        return error instanceof Error ? error.message : 'Unknown translation error';
    }

    // =========================================================================
    // API KEY MANAGEMENT
    // =========================================================================

    /**
     * Validate API key
     */
    async validateApiKey(): Promise<{ valid: boolean; error?: string; usage?: object }> {
        if (!this.config.apiKey && !['libretranslate', 'lingva', 'mymemory', 'argos', 'pseudo', 'none'].includes(this.extendedService)) {
            return { valid: false, error: 'No API key configured' };
        }

        // Free services don't need validation
        if (['libretranslate', 'lingva', 'mymemory', 'argos', 'pseudo'].includes(this.extendedService)) {
            return { valid: true };
        }

        try {
            if (this.config.translationService === 'deepl') {
                const isFreeKey = this.config.apiKey?.endsWith(':fx');
                const baseUrl = isFreeKey
                    ? 'https://api-free.deepl.com/v2'
                    : 'https://api.deepl.com/v2';

                const response = await axios.get(`${baseUrl}/usage`, {
                    headers: {
                        'Authorization': `DeepL-Auth-Key ${this.config.apiKey}`,
                    },
                });

                return {
                    valid: true,
                    usage: {
                        characterCount: response.data.character_count,
                        characterLimit: response.data.character_limit,
                        remaining: response.data.character_limit - response.data.character_count,
                    },
                };
            } else if (this.config.translationService === 'google') {
                // Test with a simple translation
                await this.translateWithGoogle('test', 'es', 'en');
                return { valid: true };
            }

            return { valid: false, error: 'Unknown translation service' };
        } catch (error) {
            return {
                valid: false,
                error: this.handleApiError(error, this.config.translationService),
            };
        }
    }

    /**
     * Get supported languages for the configured service
     */
    async getSupportedLanguages(): Promise<SupportedLanguage[]> {
        return [
            'en', 'es', 'fr', 'de', 'it', 'pt', 'pt-BR', 'ru', 'zh', 'zh-TW',
            'ja', 'ko', 'ar', 'hi', 'nl', 'pl', 'sv', 'da', 'fi', 'no',
            'tr', 'cs', 'el', 'he', 'hu', 'id', 'ms', 'th', 'vi', 'uk',
            'bg', 'ro', 'sk', 'sl', 'et', 'lv', 'lt'
        ];
    }

    setApiKey(apiKey: string): void {
        this.config.apiKey = apiKey;
    }

    setService(service: TranslationService): void {
        this.config.translationService = service;
        this.extendedService = service;
    }

    clearCache(): void {
        this.cache = {};
    }

    getCacheStats(): { entries: number; languages: Set<string> } {
        const languages = new Set<string>();
        let entries = 0;

        for (const key of Object.keys(this.cache)) {
            for (const lang of Object.keys(this.cache[key])) {
                languages.add(lang);
                entries++;
            }
        }

        return { entries, languages };
    }

    getTranslationMemoryStats(): { entries: number; languages: Set<string> } {
        const languages = new Set<string>();

        for (const entry of this.translationMemory.entries) {
            languages.add(entry.targetLang);
        }

        return {
            entries: this.translationMemory.entries.length,
            languages,
        };
    }

    /**
     * Export translation memory
     */
    exportTranslationMemory(): TranslationMemory {
        return this.translationMemory;
    }

    /**
     * Import translation memory
     */
    importTranslationMemory(tm: TranslationMemory): void {
        for (const entry of tm.entries) {
            const exists = this.translationMemory.entries.some(
                e => e.source === entry.source &&
                    e.targetLang === entry.targetLang &&
                    e.sourceLang === entry.sourceLang
            );
            if (!exists) {
                this.translationMemory.entries.push(entry);
            }
        }
        this.saveTranslationMemory();
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Get instructions and links for obtaining API keys
 */
export function getApiKeyInstructions(service: ExtendedTranslationService): string {
    if (service === 'deepl') {
        return `
╔════════════════════════════════════════════════════════════════════╗
║                    DeepL API Key Setup                              ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  1. Go to: https://www.deepl.com/pro-api                            ║
║                                                                      ║
║  2. Sign up for a DeepL account (if you don't have one)             ║
║                                                                      ║
║  3. Choose a plan:                                                   ║
║     • DeepL API Free: 500,000 characters/month (FREE)               ║
║     • DeepL API Pro: Pay-as-you-go ($4.99/month + usage)            ║
║                                                                      ║
║  4. After signing up, go to your account:                           ║
║     https://www.deepl.com/account/summary                           ║
║                                                                      ║
║  5. Scroll down to "Authentication Key for DeepL API"               ║
║                                                                      ║
║  6. Copy your API key (it looks like: xxxxxxxx-xxxx-xxxx-xxxx:fx)   ║
║                                                                      ║
║  Note: Free API keys end with ":fx"                                  ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
    }

    if (service === 'google') {
        return `
╔════════════════════════════════════════════════════════════════════╗
║              Google Cloud Translation API Key Setup                 ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  1. Go to Google Cloud Console:                                      ║
║     https://console.cloud.google.com/                                ║
║                                                                      ║
║  2. Create a new project or select an existing one                  ║
║                                                                      ║
║  3. Enable the Cloud Translation API:                                ║
║     https://console.cloud.google.com/apis/library/translate         ║
║                                                                      ║
║  4. Go to APIs & Services > Credentials:                            ║
║     https://console.cloud.google.com/apis/credentials               ║
║                                                                      ║
║  5. Click "Create Credentials" > "API Key"                          ║
║                                                                      ║
║  6. Copy your API key                                                ║
║                                                                      ║
║  7. (Recommended) Restrict your API key:                            ║
║     • Click on the API key                                           ║
║     • Under "API restrictions", select "Cloud Translation API"      ║
║     • Save                                                           ║
║                                                                      ║
║  Pricing: $20 per million characters (first 500K chars/month free)  ║
║  Details: https://cloud.google.com/translate/pricing                ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
    }

    if (service === 'libretranslate') {
        return `
╔════════════════════════════════════════════════════════════════════╗
║                  LibreTranslate (FREE - No API Key)                 ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ✅ NO API KEY REQUIRED - Uses public instances automatically       ║
║                                                                      ║
║  LibreTranslate is a free, open-source translation API.            ║
║                                                                      ║
║  Public instances used:                                              ║
║  • https://libretranslate.com                                        ║
║  • https://translate.argosopentech.com                               ║
║  • https://lt.vern.cc                                                ║
║                                                                      ║
║  For higher rate limits, you can:                                    ║
║  1. Self-host: https://github.com/LibreTranslate/LibreTranslate    ║
║  2. Provide your own instance URL as the "API key"                   ║
║                                                                      ║
║  Docker: docker run -p 5000:5000 libretranslate/libretranslate      ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
    }

    if (service === 'lingva') {
        return `
╔════════════════════════════════════════════════════════════════════╗
║                  Lingva Translate (FREE - No API Key)               ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ✅ NO API KEY REQUIRED - Uses public instances automatically       ║
║                                                                      ║
║  Lingva is a privacy-focused alternative frontend for Google        ║
║  Translate that doesn't track users.                                 ║
║                                                                      ║
║  Public instances used:                                              ║
║  • https://lingva.ml                                                 ║
║  • https://translate.plausibility.cloud                              ║
║  • https://lingva.lunar.icu                                          ║
║                                                                      ║
║  For your own instance:                                              ║
║  https://github.com/TheDavidDelta/lingva-translate                  ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
    }

    if (service === 'mymemory') {
        return `
╔════════════════════════════════════════════════════════════════════╗
║                   MyMemory (FREE - Optional Email)                  ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ✅ NO API KEY REQUIRED for basic usage                              ║
║                                                                      ║
║  MyMemory provides free translation with:                            ║
║  • 10,000 characters/day without registration                        ║
║  • 100,000 characters/day with email registration (free)            ║
║                                                                      ║
║  To get higher limits:                                               ║
║  1. Go to: https://mymemory.translated.net/                         ║
║  2. Register with your email                                         ║
║  3. Use your email as the "API key" in this tool                    ║
║                                                                      ║
║  Note: MyMemory uses crowd-sourced translations and machine         ║
║  translation. Quality may vary.                                      ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
    }

    if (service === 'pseudo') {
        return `
╔════════════════════════════════════════════════════════════════════╗
║                  Pseudo-localization (Testing)                       ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ✅ NO API KEY REQUIRED                                              ║
║                                                                      ║
║  Pseudo-localization creates fake translations for testing:          ║
║                                                                      ║
║  "Hello World" → "[Ḥḛŀŀő Ẇőřŀḓ~~~]"                                 ║
║                                                                      ║
║  This helps you:                                                     ║
║  • Test if your UI can handle different character sets              ║
║  • Verify that translations don't break your layout                  ║
║  • Find hard-coded strings that weren't extracted                   ║
║  • Test text expansion (translations are ~30% longer)               ║
║  • Identify concatenated strings and other i18n issues              ║
║                                                                      ║
║  Use this mode before real translations to catch problems early!    ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
    }

    return `
╔════════════════════════════════════════════════════════════════════╗
║                    Available Translation Services                    ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  🆓 FREE (No billing required):                                      ║
║                                                                      ║
║  • LibreTranslate - Open source, uses public instances               ║
║  • Lingva         - Privacy-focused Google Translate proxy           ║
║  • MyMemory       - 10k chars/day free, 100k with email             ║
║  • Pseudo         - Fake translations for testing                    ║
║                                                                      ║
║  💳 PAID (Requires billing):                                         ║
║                                                                      ║
║  • DeepL          - High quality (500k chars/month free tier)        ║
║  • Google         - Wide support (500k chars/month free tier)        ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
}

/**
 * Security utilities for API key management
 */
export const SecurityUtils = {
    /**
     * Mask API key for display (shows first and last 4 chars)
     */
    maskApiKey(key: string): string {
        if (!key || key.length < 12) return '****';
        return `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`;
    },

    /**
     * Check if a string looks like an API key (should not be logged)
     */
    looksLikeApiKey(str: string): boolean {
        // DeepL keys end with :fx
        if (str.endsWith(':fx')) return true;

        // Long alphanumeric strings with dashes
        if (/^[a-zA-Z0-9-]{32,}$/.test(str)) return true;

        // Google-style keys
        if (/^AIza[A-Za-z0-9_-]{35}$/.test(str)) return true;

        return false;
    },

    /**
     * Sanitize error messages to remove potential API keys
     */
    sanitizeError(error: string): string {
        // Remove anything that looks like an API key
        return error
            .replace(/AIza[A-Za-z0-9_-]{35}/g, '[REDACTED]')
            .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(:fx)?/gi, '[REDACTED]')
            .replace(/Bearer [^\s]+/g, 'Bearer [REDACTED]')
            .replace(/key=[^\s&]+/g, 'key=[REDACTED]');
    },

    /**
     * Validate API key format without exposing it
     */
    validateKeyFormat(key: string, service: ExtendedTranslationService): { valid: boolean; error?: string } {
        if (!key || key.trim().length === 0) {
            return { valid: false, error: 'API key is empty' };
        }

        switch (service) {
            case 'deepl':
                if (!/^[a-f0-9-]+(:fx)?$/i.test(key)) {
                    return { valid: false, error: 'DeepL API key format is invalid' };
                }
                break;
            case 'google':
                if (!/^AIza[A-Za-z0-9_-]{35}$/.test(key)) {
                    return { valid: false, error: 'Google API key format is invalid' };
                }
                break;
        }

        return { valid: true };
    },
};
