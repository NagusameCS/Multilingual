# 🌐 Multilingual CLI v2.0

**Automated i18n with FREE translation options** — 6 translation services (4 free!), 37 languages, multiple export formats, watch mode, and more.

[![npm version](https://img.shields.io/npm/v/multilingual-cli.svg)](https://www.npmjs.com/package/multilingual-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ What's New in v2.0

- **🆓 4 Free Translation Services** — No billing required!
- **📊 Statistics & Cost Estimation** — Plan before you translate
- **📦 Multiple Export Formats** — XLIFF, PO/gettext, CSV, Android, iOS, ARB
- **👀 Watch Mode** — Auto-translate during development
- **🧪 Pseudo-localization** — Test UI with fake translations
- **💾 Translation Memory** — Reuse translations with fuzzy matching
- **🔒 Enhanced Security** — API keys never exposed in logs

---

## 🚀 Quick Start

```bash
# Install globally
npm install -g multilingual-cli

# Initialize in your project
multilingual init

# Or use directly with npx
npx multilingual-cli init
```

---

## 📋 Translation Services

### 🆓 FREE (No Billing Required)

| Service | Description | Limit |
|---------|-------------|-------|
| **LibreTranslate** | Open source, uses public instances | Unlimited |
| **Lingva** | Privacy-focused Google Translate proxy | Unlimited |
| **MyMemory** | Crowd-sourced + machine translation | 10k chars/day |
| **Pseudo** | Fake translations for UI testing | N/A |

### 💳 Paid (Free Tier Available)

| Service | Description | Free Tier |
|---------|-------------|-----------|
| **DeepL** | High quality neural translation | 500k chars/month |
| **Google** | Wide language support | 500k chars/month |

```bash
# Use free LibreTranslate (no API key needed!)
multilingual translate-file -s en.json -o ./locales --service libretranslate

# View all service options
multilingual services
```

---

## 🛠️ CLI Commands

### Core Commands

```bash
multilingual init              # Interactive setup wizard
multilingual run               # Scan & translate project
multilingual scan              # Scan only, show strings
multilingual translate-file    # Translate existing JSON file
```

### Export & Import

```bash
# Export to XLIFF for translation tools
multilingual export -i en.json -o translations.xliff -f xliff

# Import translated XLIFF
multilingual import -i translated.xliff -o fr.json

# Supported formats: xliff, xliff2, po, csv, android, ios, arb
```

### Development Tools

```bash
multilingual watch             # Auto-translate on file changes
multilingual pseudo -s en.json # Generate pseudo-translations
multilingual stats             # View statistics & cost estimates
```

### Configuration

```bash
multilingual config --show     # View current config
multilingual config --edit     # Interactive config editor
multilingual config --set key=value
multilingual services          # List all translation services
multilingual languages         # List all 37 supported languages
```

---

## 🌍 Supported Languages (37)

| | | | |
|---|---|---|---|
| 🇺🇸 English | 🇪🇸 Spanish | 🇫🇷 French | 🇩🇪 German |
| 🇮🇹 Italian | 🇵🇹 Portuguese | 🇧🇷 Portuguese (BR) | 🇷🇺 Russian |
| 🇨🇳 Chinese (Simplified) | 🇹🇼 Chinese (Traditional) | 🇯🇵 Japanese | 🇰🇷 Korean |
| 🇸🇦 Arabic (RTL) | 🇮🇳 Hindi | 🇳🇱 Dutch | 🇵🇱 Polish |
| 🇸🇪 Swedish | 🇩🇰 Danish | 🇫🇮 Finnish | 🇳🇴 Norwegian |
| 🇹🇷 Turkish | 🇨🇿 Czech | 🇬🇷 Greek | 🇮🇱 Hebrew (RTL) |
| 🇭🇺 Hungarian | 🇮🇩 Indonesian | 🇲🇾 Malay | 🇹🇭 Thai |
| 🇻🇳 Vietnamese | 🇺🇦 Ukrainian | 🇧🇬 Bulgarian | 🇷🇴 Romanian |
| 🇸🇰 Slovak | 🇸🇮 Slovenian | 🇪🇪 Estonian | 🇱🇻 Latvian |
| 🇱🇹 Lithuanian | | | |

---

## 📦 Export Formats

### Supported Formats

| Format | Extension | Use Case |
|--------|-----------|----------|
| JSON | `.json` | Web apps, Node.js |
| XLIFF 1.2 | `.xliff` | Translation tools (SDL, Trados) |
| XLIFF 2.0 | `.xliff` | Modern CAT tools |
| PO/gettext | `.po` | Linux, WordPress, Python |
| CSV | `.csv` | Spreadsheets, bulk editing |
| Android | `strings.xml` | Android apps |
| iOS | `.strings` | iOS/macOS apps |
| ARB | `.arb` | Flutter apps |

```bash
# Convert JSON to XLIFF for professional translators
multilingual export -i en.json -o translations.xliff -f xliff

# Import back from translated XLIFF
multilingual import -i es.xliff -o es.json
```

---

## 🧪 Pseudo-localization

Test your UI's i18n readiness with fake translations:

```bash
# Generate pseudo-translations
multilingual pseudo -s en.json -o pseudo.json
```

**Before:** `"Hello World"`
**After:** `"[Ḥḛŀŀő Ẇőřŀḓ~~~]"`

This helps you:
- ✅ Find hardcoded strings
- ✅ Test text expansion (~30% longer)
- ✅ Verify special character support
- ✅ Identify concatenated strings

---

## 📊 Statistics & Cost Estimation

```bash
multilingual stats --report
```

```
╔══════════════════════════════════════════════════════════════╗
║              Translation Statistics Report                    ║
╠══════════════════════════════════════════════════════════════╣

📊 SUMMARY
──────────────────────────────────────────────────────────────
  Total strings:    245
  Total words:      1,847
  Total characters: 12,456
  Overall coverage: 78.3%

🌍 LANGUAGE COVERAGE
──────────────────────────────────────────────────────────────
  ✅ Spanish              [████████████████████] 100.0%
  🔄 French               [██████████████░░░░░░] 72.3%
  ⏳ German               [████░░░░░░░░░░░░░░░░] 23.1%

💰 COST ESTIMATES
──────────────────────────────────────────────────────────────
  DeepL Free tier: ~0.4 months of quota
  Google Free tier: ~0.4 months of quota
  ✅ Within free tier limits for both services
```

---

## 🔄 GitHub Actions Automation

```bash
multilingual github --setup
```

Automatically translate on every push:

```yaml
# .github/workflows/translate.yml
name: Auto-translate
on:
  push:
    paths:
      - 'src/**'
      - 'locales/en.json'

jobs:
  translate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install -g multilingual-cli
      - run: multilingual run --auto
        env:
          TRANSLATION_API_KEY: ${{ secrets.TRANSLATION_API_KEY }}
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: 'chore: update translations'
```

---

## 💻 Programmatic Usage

```typescript
import Multilingual, { 
  TranslationManager, 
  calculateStats,
  exportToFile,
  XLIFFFormat 
} from 'multilingual-cli';

// Basic usage
const ml = new Multilingual({
  config: {
    sourceLanguage: 'en',
    targetLanguages: ['es', 'fr', 'de'],
    translationService: 'none', // Use free service instead
  }
});

// Use free translation service
const manager = new TranslationManager();
manager.setExtendedService('libretranslate'); // No API key needed!

const result = await manager.translate('Hello World', 'es', 'en');
console.log(result.text); // "Hola Mundo"

// Pseudo-translation for testing
const pseudo = manager.generatePseudoTranslation('Hello World');
console.log(pseudo); // "[Ḥḛŀŀő Ẇőřŀḓ~~~]"

// Export to XLIFF
const doc = {
  sourceLanguage: 'en',
  targetLanguage: 'es',
  units: [
    { key: 'greeting', source: 'Hello', target: 'Hola' },
    { key: 'farewell', source: 'Goodbye', target: 'Adiós' },
  ]
};
const xliff = XLIFFFormat.export(doc);
```

---

## 🔒 Security

API keys are never exposed:

- ✅ Keys masked in logs (`AIza****...****V8Isd3A`)
- ✅ Uses environment variables
- ✅ `.env.example` template included
- ✅ Keys never written to translation files
- ✅ Error messages sanitized

```bash
# Use environment variable
export TRANSLATION_API_KEY="your-key-here"
multilingual run --auto
```

---

## 📁 Project Structure

```
your-project/
├── locales/
│   ├── en.json        # Source language
│   ├── es.json        # Auto-generated
│   ├── fr.json        # Auto-generated
│   └── ...
├── .multilingual/
│   ├── translation-memory.json  # Reusable translations
│   └── reports/                 # Statistics reports
├── multilingual.config.json     # Configuration
└── .env                         # API keys (git-ignored)
```

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

**Attribution Required:** Generated translation files must retain the `multilingual-cli` attribution comments.

---

## 🔗 Links

- **npm:** [npmjs.com/package/multilingual-cli](https://www.npmjs.com/package/multilingual-cli)
- **GitHub:** [github.com/NagusameCS/Multilingual](https://github.com/NagusameCS/Multilingual)
- **Documentation:** [nagusame.github.io/Multilingual](https://nagusame.github.io/Multilingual)

---

<p align="center">
  <sub>Built with ❤️ by developers, for developers</sub>
</p>
