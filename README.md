# 🌐 Multilingual

> **Automated internationalization (i18n) for any project** - Auto-detect user-facing content and translate with DeepL or Google Translate.

[![npm version](https://img.shields.io/npm/v/multilingual-cli.svg)](https://www.npmjs.com/package/multilingual-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Multilingual is a powerful CLI tool and NPM package that automatically scans your project for user-facing strings, extracts them into i18n translation files, and optionally translates them using DeepL or Google Translate. It supports **GitHub Actions** for fully automated translation on every push!

## ✨ Features

- 🔍 **Auto-detection** - Scans your entire project for user-facing strings
- 🌍 **37+ languages** supported out of the box
- 🔄 **DeepL & Google Translate** integration with easy API key setup
- ⚡ **GitHub Actions** - Automatic translation on every push
- 📁 **Multiple output formats** - JSON, TypeScript, JavaScript
- 🧩 **Framework agnostic** - Works with React, Vue, Svelte, Angular, Node.js, Python, Ruby, Go, PHP, and more
- 🎯 **Smart extraction** - Ignores code, URLs, CSS classes, and other non-translatable content
- 📝 **TypeScript support** - Full type definitions included
- 🔒 **Preserves existing** - Won't overwrite manually edited translations

## 📦 Installation

```bash
# Global installation (recommended for CLI usage)
npm install -g multilingual-cli

# Or as a project dependency
npm install multilingual-cli --save-dev

# Using yarn
yarn add -D multilingual-cli

# Using pnpm
pnpm add -D multilingual-cli
```

## 🚀 Quick Start

### Interactive Setup

Run the initialization wizard:

```bash
multilingual init
```

This will guide you through:
1. Selecting source and target languages
2. Choosing a translation service (DeepL or Google)
3. Setting up your API key
4. Optionally configuring GitHub Actions

### One-Command Translation

After setup, run translations with:

```bash
multilingual run
```

## 📖 CLI Commands

### `multilingual init`

Interactive setup wizard for your project.

```bash
multilingual init          # Interactive setup
multilingual init -y       # Use defaults without prompts
```

### `multilingual run`

Scan and translate your project.

```bash
multilingual run           # Interactive mode
multilingual run --auto    # Non-interactive mode (for CI/CD)
multilingual run --force   # Force re-translation of all strings
```

### `multilingual scan`

Scan for translatable strings without translating.

```bash
multilingual scan                    # Scan and display results
multilingual scan -o results.json    # Export results to file
```

### `multilingual translate`

Translate already scanned strings.

```bash
multilingual translate                  # Translate to all configured languages
multilingual translate -l es           # Translate to specific language only
```

### `multilingual config`

View or modify configuration.

```bash
multilingual config --show    # Show current configuration
multilingual config --edit    # Interactive config editor
```

### `multilingual github`

Manage GitHub Actions integration.

```bash
multilingual github --setup       # Setup GitHub Actions
multilingual github --pr-based    # Use PR-based workflow
multilingual github --remove      # Remove GitHub Actions
```

### `multilingual languages`

List all supported languages.

```bash
multilingual languages
```

### `multilingual validate`

Check translation files for completeness.

```bash
multilingual validate
```

### `multilingual clean`

Remove generated translation files.

```bash
multilingual clean           # With confirmation
multilingual clean --force   # Skip confirmation
```

## 🔧 Programmatic Usage

You can also use Multilingual as a library in your code:

```typescript
import Multilingual from 'multilingual-cli';

// Create instance
const i18n = new Multilingual({
  projectRoot: process.cwd(),
  config: {
    sourceLanguage: 'en',
    targetLanguages: ['es', 'fr', 'de', 'ja'],
    translationService: 'deepl',
    apiKey: process.env.DEEPL_API_KEY,
  }
});

// Initialize and run
await i18n.init();
const result = await i18n.run((stage, message, progress) => {
  console.log(`[${stage}] ${message} - ${progress}%`);
});

console.log(`Found ${result.scan.stats.totalStrings} strings`);
console.log(`Generated ${result.generation.outputFiles.length} files`);
```

### Scan Only

```typescript
const scanResult = await i18n.scan();
console.log('Strings found:', scanResult.strings);
```

### Translate a Single String

```typescript
const translated = await i18n.translateString(
  'Hello, World!',
  'es',  // target language
  'en'   // source language (optional)
);
console.log(translated); // "¡Hola, Mundo!"
```

### Available Methods

| Method | Description |
|--------|-------------|
| `init()` | Load configuration |
| `run(onProgress?)` | Run full scan and translation |
| `scan()` | Scan project for strings |
| `generate(onProgress?)` | Generate translation files |
| `translateString(text, target, source?)` | Translate a single string |
| `setTranslationService(service, apiKey?)` | Configure translation service |
| `setLanguages(source, targets)` | Set languages |
| `validateApiKey()` | Validate configured API key |
| `setupGitHubActions(options?)` | Setup GitHub Actions |
| `saveConfig()` | Save configuration to file |
| `getConfig()` | Get current configuration |

## ⚙️ Configuration

### Configuration File

Create `multilingual.config.json` in your project root:

```json
{
  "sourceLanguage": "en",
  "targetLanguages": ["es", "fr", "de", "ja", "zh", "ko"],
  "translationService": "deepl",
  "outputDir": "./locales",
  "outputFormat": "json",
  "include": ["src/**/*", "app/**/*", "components/**/*"],
  "exclude": ["node_modules/**", "dist/**", "*.test.*"],
  "fileTypes": [".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".html"],
  "flatKeys": false,
  "keyStyle": "auto",
  "preserveExisting": true,
  "sortKeys": true,
  "minStringLength": 2,
  "maxStringLength": 5000
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sourceLanguage` | string | `"en"` | Source language code |
| `targetLanguages` | string[] | `[]` | Target language codes |
| `translationService` | string | `"none"` | `"deepl"`, `"google"`, or `"none"` |
| `apiKey` | string | - | Translation API key (recommended: use env var) |
| `outputDir` | string | `"./locales"` | Output directory for translation files |
| `outputFormat` | string | `"json"` | `"json"`, `"ts"`, or `"js"` |
| `include` | string[] | `["src/**/*"]` | Glob patterns for files to scan |
| `exclude` | string[] | `["node_modules/**"]` | Glob patterns for files to ignore |
| `fileTypes` | string[] | `[".js", ".ts", ...]` | File extensions to scan |
| `flatKeys` | boolean | `false` | Use flat key structure |
| `keyStyle` | string | `"auto"` | `"nested"`, `"flat"`, or `"auto"` |
| `preserveExisting` | boolean | `true` | Preserve manually edited translations |
| `sortKeys` | boolean | `true` | Sort translation keys alphabetically |
| `autoMode` | boolean | `false` | Enable GitHub Actions auto-translation |

### Environment Variables

Store your API keys in environment variables:

```bash
# .env
DEEPL_API_KEY=your-deepl-api-key
GOOGLE_TRANSLATE_API_KEY=your-google-api-key

# Generic key (used if service-specific key not set)
MULTILINGUAL_API_KEY=your-api-key
```

## 🔑 API Key Setup

### DeepL

1. Go to [DeepL API](https://www.deepl.com/pro-api)
2. Sign up for a free or pro account
3. Navigate to your [account summary](https://www.deepl.com/account/summary)
4. Copy your Authentication Key

**Pricing:**
- **Free**: 500,000 characters/month
- **Pro**: $4.99/month + $20 per million characters

### Google Cloud Translation

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the [Cloud Translation API](https://console.cloud.google.com/apis/library/translate)
4. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
5. Create an API key

**Pricing:**
- First 500,000 characters/month: Free
- After: $20 per million characters

## 🤖 GitHub Actions Integration

Multilingual Auto-i18n can automatically translate new content on every push!

### Setup

```bash
multilingual github --setup
```

Choose between:
- **Direct commit**: Automatically commits translations to your branch
- **PR-based**: Creates a pull request with translations (safer for review)

### Required Secrets

Add your API key as a repository secret:

1. Go to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add `DEEPL_API_KEY` or `GOOGLE_TRANSLATE_API_KEY`

### Example Workflow

The generated workflow (`.github/workflows/multilingual-auto-translate.yml`):

```yaml
name: Multilingual Auto-Translate

on:
  push:
    branches: [main, master]
    paths:
      - 'src/**'
      - 'components/**'

jobs:
  translate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - run: npm ci
      - run: npm install -g multilingual-cli
      
      - run: multilingual run --auto
        env:
          DEEPL_API_KEY: ${{ secrets.DEEPL_API_KEY }}
      
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "🌐 Auto-update translations"
```

## 🌍 Supported Languages

| Code | Language | Native Name |
|------|----------|-------------|
| `en` | English | English |
| `es` | Spanish | Español |
| `fr` | French | Français |
| `de` | German | Deutsch |
| `it` | Italian | Italiano |
| `pt` | Portuguese | Português |
| `pt-BR` | Portuguese (Brazil) | Português (Brasil) |
| `ru` | Russian | Русский |
| `zh` | Chinese (Simplified) | 中文(简体) |
| `zh-TW` | Chinese (Traditional) | 中文(繁體) |
| `ja` | Japanese | 日本語 |
| `ko` | Korean | 한국어 |
| `ar` | Arabic | العربية |
| `hi` | Hindi | हिन्दी |
| `nl` | Dutch | Nederlands |
| `pl` | Polish | Polski |
| `sv` | Swedish | Svenska |
| `da` | Danish | Dansk |
| `fi` | Finnish | Suomi |
| `no` | Norwegian | Norsk |
| `tr` | Turkish | Türkçe |
| `cs` | Czech | Čeština |
| `el` | Greek | Ελληνικά |
| `he` | Hebrew | עברית |
| `hu` | Hungarian | Magyar |
| `id` | Indonesian | Bahasa Indonesia |
| `ms` | Malay | Bahasa Melayu |
| `th` | Thai | ไทย |
| `vi` | Vietnamese | Tiếng Việt |
| `uk` | Ukrainian | Українська |
| `bg` | Bulgarian | Български |
| `ro` | Romanian | Română |
| `sk` | Slovak | Slovenčina |
| `sl` | Slovenian | Slovenščina |
| `et` | Estonian | Eesti |
| `lv` | Latvian | Latviešu |
| `lt` | Lithuanian | Lietuvių |

## 🧩 Framework Support

Multilingual Auto-i18n works with any project type:

### Web Frameworks
- ⚛️ **React** / Next.js
- 💚 **Vue.js** / Nuxt.js
- 🧡 **Svelte** / SvelteKit
- 🔴 **Angular**
- ⚡ **Vite** projects

### Backend Frameworks
- 🟢 **Node.js** / Express
- 🐍 **Python** / Django / Flask
- 💎 **Ruby** / Rails
- 🐹 **Go**
- 🐘 **PHP** / Laravel

### Scanned Content

The scanner detects:
- String literals in JavaScript/TypeScript
- JSX text content and attributes (`title`, `placeholder`, `alt`, etc.)
- Vue/Svelte template text
- HTML content and attributes
- Python/Ruby/Go string literals
- PHP strings and HTML in templates

### Ignored Content

Automatically filtered out:
- Import/require statements
- URLs and file paths
- CSS class names
- Single-word identifiers
- Template variables (`{{var}}`, `${var}`)
- Already internationalized strings (using common i18n functions)

## 📁 Output Structure

### JSON Format (default)

```
locales/
├── en.json           # Source language
├── es.json           # Spanish translations
├── fr.json           # French translations
├── de.json           # German translations
└── types.d.ts        # TypeScript definitions
```

### Example Output

```json
// en.json
{
  "common": {
    "welcome": "Welcome to our app",
    "login": "Log in",
    "signup": "Sign up"
  },
  "errors": {
    "not_found": "Page not found",
    "server_error": "Something went wrong"
  }
}
```

```json
// es.json
{
  "common": {
    "welcome": "Bienvenido a nuestra aplicación",
    "login": "Iniciar sesión",
    "signup": "Registrarse"
  },
  "errors": {
    "not_found": "Página no encontrada",
    "server_error": "Algo salió mal"
  }
}
```

## 🔌 Integration Examples

### React with react-i18next

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import translations from './locales';

i18n
  .use(initReactI18next)
  .init({
    resources: translations,
    lng: 'en',
    fallbackLng: 'en',
  });

export default i18n;
```

### Vue with vue-i18n

```typescript
import { createI18n } from 'vue-i18n';
import translations from './locales';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: translations,
});

export default i18n;
```

### Next.js with next-intl

```typescript
// i18n.ts
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`./locales/${locale}.json`)).default
}));
```

## 🛠 Troubleshooting

### No strings found

1. Check your `include` patterns match your source files
2. Verify `fileTypes` includes your file extensions
3. Ensure strings are longer than `minStringLength` (default: 2)
4. Check that strings aren't matching `ignorePatterns`

### API key errors

1. Verify your API key is correct
2. Check you haven't exceeded rate limits
3. For DeepL, ensure you're using the right endpoint (free vs pro)
4. Run `multilingual config --edit` to update your key

### GitHub Actions not running

1. Verify secrets are set in your repository
2. Check the `paths` trigger matches your source files
3. Review workflow logs for errors

## 📄 License

MIT © [NagusameCS](https://github.com/NagusameCS)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📬 Support

- 🐛 [Report bugs](https://github.com/NagusameCS/Multilingual/issues)
- 💡 [Request features](https://github.com/NagusameCS/Multilingual/issues)
- 📖 [Documentation](https://github.com/NagusameCS/Multilingual#readme)

---

Made with ❤️ for the multilingual web