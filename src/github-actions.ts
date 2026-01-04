/**
 * GitHub Actions Setup - Creates and manages GitHub Actions workflows for auto-translation
 */

import * as fs from 'fs';
import * as path from 'path';
import { MultilingualConfig, DEFAULT_CONFIG } from './types';

export class GitHubActionsSetup {
    private config: MultilingualConfig;
    private workflowDir: string;

    constructor(config: Partial<MultilingualConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.workflowDir = path.join(this.config.projectRoot, '.github', 'workflows');
    }

    /**
     * Create GitHub Actions workflow for auto-translation
     */
    createWorkflow(): { success: boolean; filePath: string; message: string } {
        try {
            // Ensure .github/workflows directory exists
            this.ensureDirectoryExists(this.workflowDir);

            const workflowPath = path.join(this.workflowDir, 'multilingual-auto-translate.yml');
            const workflowContent = this.generateWorkflowContent();

            fs.writeFileSync(workflowPath, workflowContent, 'utf-8');

            return {
                success: true,
                filePath: workflowPath,
                message: 'GitHub Actions workflow created successfully!',
            };
        } catch (error) {
            return {
                success: false,
                filePath: '',
                message: `Failed to create workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }

    /**
     * Generate the workflow YAML content
     */
    private generateWorkflowContent(): string {
        const serviceName = this.config.translationService === 'deepl' ? 'DeepL' : 'Google';
        const apiKeyEnvVar = this.config.translationService === 'deepl'
            ? 'DEEPL_API_KEY'
            : 'GOOGLE_TRANSLATE_API_KEY';

        return `# multilingual-cli - Automated Translation Workflow
# This workflow automatically detects new content and translates it on every push

name: Multilingual Auto-Translate

on:
  push:
    branches:
      - main
      - master
      - develop
    paths:
      - 'src/**'
      - 'app/**'
      - 'pages/**'
      - 'components/**'
      - 'views/**'
      - '**/*.js'
      - '**/*.jsx'
      - '**/*.ts'
      - '**/*.tsx'
      - '**/*.vue'
      - '**/*.svelte'
      - '**/*.html'
  
  # Allow manual trigger
  workflow_dispatch:
    inputs:
      force_retranslate:
        description: 'Force re-translation of all strings'
        required: false
        default: 'false'
        type: boolean

# Prevent concurrent runs
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  translate:
    name: Scan and Translate
    runs-on: ubuntu-latest
    
    permissions:
      contents: write
      pull-requests: write
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: \${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install multilingual-cli
        run: npm install -g multilingual-cli

      - name: Run translation scan
        env:
          ${apiKeyEnvVar}: \${{ secrets.${apiKeyEnvVar} }}
          MULTILINGUAL_API_KEY: \${{ secrets.MULTILINGUAL_API_KEY }}
        run: |
          multilingual scan --auto
          multilingual translate --auto
      
      - name: Check for changes
        id: check_changes
        run: |
          git diff --quiet ${this.config.outputDir} || echo "changes=true" >> $GITHUB_OUTPUT

      - name: Commit and push changes
        if: steps.check_changes.outputs.changes == 'true'
        run: |
          git config --local user.email "github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git add ${this.config.outputDir}
          git commit -m "🌐 Auto-update translations [skip ci]"
          git push

      - name: Create summary
        if: always()
        run: |
          echo "## 🌐 Translation Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          if [ -f "${this.config.outputDir}/translation-report.json" ]; then
            echo "### Statistics" >> $GITHUB_STEP_SUMMARY
            cat "${this.config.outputDir}/translation-report.json" | jq -r '
              "- **Total Keys:** \\(.totalKeys)",
              "- **New Keys:** \\(.newKeys)",  
              "- **Languages:** \\(.languages | join(", "))"
            ' >> $GITHUB_STEP_SUMMARY
          else
            echo "No changes detected." >> $GITHUB_STEP_SUMMARY
          fi
`;
    }

    /**
     * Create a PR-based workflow (for safer updates)
     */
    createPRWorkflow(): { success: boolean; filePath: string; message: string } {
        try {
            this.ensureDirectoryExists(this.workflowDir);

            const workflowPath = path.join(this.workflowDir, 'multilingual-translation-pr.yml');
            const workflowContent = this.generatePRWorkflowContent();

            fs.writeFileSync(workflowPath, workflowContent, 'utf-8');

            return {
                success: true,
                filePath: workflowPath,
                message: 'PR-based workflow created successfully!',
            };
        } catch (error) {
            return {
                success: false,
                filePath: '',
                message: `Failed to create workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }

    /**
     * Generate PR-based workflow content
     */
    private generatePRWorkflowContent(): string {
        const apiKeyEnvVar = this.config.translationService === 'deepl'
            ? 'DEEPL_API_KEY'
            : 'GOOGLE_TRANSLATE_API_KEY';

        return `# multilingual-cli - Translation PR Workflow
# Creates a pull request with translation updates instead of direct commits

name: Multilingual Translation PR

on:
  push:
    branches:
      - main
      - master
  schedule:
    # Run weekly on Mondays at 9am UTC
    - cron: '0 9 * * 1'
  workflow_dispatch:

jobs:
  create-translation-pr:
    name: Create Translation PR
    runs-on: ubuntu-latest
    
    permissions:
      contents: write
      pull-requests: write
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install multilingual-cli
        run: npm install -g multilingual-cli

      - name: Run translation
        env:
          ${apiKeyEnvVar}: \${{ secrets.${apiKeyEnvVar} }}
          MULTILINGUAL_API_KEY: \${{ secrets.MULTILINGUAL_API_KEY }}
        run: |
          multilingual scan
          multilingual translate

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          token: \${{ secrets.GITHUB_TOKEN }}
          commit-message: '🌐 Update translations'
          title: '🌐 Translation Updates'
          body: |
            ## Automated Translation Update
            
            This PR contains automatically detected and translated strings.
            
            ### Changes
            - Scanned source files for new user-facing content
            - Translated new strings to configured languages
            - Updated translation files in \`${this.config.outputDir}\`
            
            ### Review Checklist
            - [ ] Verify translation accuracy
            - [ ] Check for context-sensitive translations
            - [ ] Review any placeholders/variables
            
            ---
            *Generated by [multilingual-cli](https://github.com/NagusameCS/Multilingual)*
          branch: multilingual/translation-updates
          delete-branch: true
          labels: |
            translations
            automated
`;
    }

    /**
     * Create a validation workflow for PRs
     */
    createValidationWorkflow(): { success: boolean; filePath: string; message: string } {
        try {
            this.ensureDirectoryExists(this.workflowDir);

            const workflowPath = path.join(this.workflowDir, 'multilingual-validate.yml');
            const workflowContent = `# multilingual-cli - Validation Workflow
# Validates translation files and checks for missing translations

name: Validate Translations

on:
  pull_request:
    paths:
      - '${this.config.outputDir}/**'
      - 'src/**'
      - 'multilingual.config.json'

jobs:
  validate:
    name: Validate Translation Files
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install multilingual-cli
        run: npm install -g multilingual-cli

      - name: Validate translations
        run: multilingual validate

      - name: Check for missing translations
        run: multilingual check --report

      - name: Add PR comment
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '⚠️ Translation validation failed. Please check the workflow logs for details.'
            })
`;

            fs.writeFileSync(workflowPath, workflowContent, 'utf-8');

            return {
                success: true,
                filePath: workflowPath,
                message: 'Validation workflow created successfully!',
            };
        } catch (error) {
            return {
                success: false,
                filePath: '',
                message: `Failed to create workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }

    /**
     * Check if GitHub Actions is already set up
     */
    isSetUp(): boolean {
        const workflowPath = path.join(this.workflowDir, 'multilingual-auto-translate.yml');
        return fs.existsSync(workflowPath);
    }

    /**
     * Remove GitHub Actions workflow
     */
    removeWorkflow(): boolean {
        try {
            const files = [
                'multilingual-auto-translate.yml',
                'multilingual-translation-pr.yml',
                'multilingual-validate.yml',
            ];

            for (const file of files) {
                const filePath = path.join(this.workflowDir, file);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }

            return true;
        } catch (error) {
            console.error('Error removing workflows:', error);
            return false;
        }
    }

    /**
     * Get setup instructions for repository secrets
     */
    getSecretsInstructions(): string {
        const apiKeyName = this.config.translationService === 'deepl'
            ? 'DEEPL_API_KEY'
            : 'GOOGLE_TRANSLATE_API_KEY';

        return `
╔════════════════════════════════════════════════════════════════════╗
║              GitHub Repository Secrets Setup                        ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  To enable automatic translations, you need to add your API key     ║
║  as a GitHub repository secret.                                     ║
║                                                                      ║
║  Steps:                                                              ║
║                                                                      ║
║  1. Go to your repository on GitHub                                 ║
║                                                                      ║
║  2. Click on "Settings" tab                                         ║
║                                                                      ║
║  3. In the left sidebar, click "Secrets and variables" > "Actions" ║
║                                                                      ║
║  4. Click "New repository secret"                                   ║
║                                                                      ║
║  5. Add the following secret:                                       ║
║     Name: ${apiKeyName.padEnd(30)}                                 ║
║     Value: Your ${this.config.translationService === 'deepl' ? 'DeepL' : 'Google'} API key                              ║
║                                                                      ║
║  6. Click "Add secret"                                              ║
║                                                                      ║
║  Alternative: You can also use MULTILINGUAL_API_KEY as the          ║
║  secret name if you prefer a generic name.                          ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════╝
`;
    }

    /**
     * Ensure directory exists
     */
    private ensureDirectoryExists(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * Create Dependabot config for keeping the package updated
     */
    createDependabotConfig(): { success: boolean; filePath: string } {
        try {
            const dependabotDir = path.join(this.config.projectRoot, '.github');
            this.ensureDirectoryExists(dependabotDir);

            const dependabotPath = path.join(dependabotDir, 'dependabot.yml');

            // Check if file exists and has npm config
            let content = '';
            if (fs.existsSync(dependabotPath)) {
                content = fs.readFileSync(dependabotPath, 'utf-8');
                if (content.includes('package-ecosystem: "npm"')) {
                    return { success: true, filePath: dependabotPath };
                }
            }

            const dependabotContent = `version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "deps"
    labels:
      - "dependencies"
    groups:
      multilingual:
        patterns:
          - "multilingual-auto-i18n"
`;

            fs.writeFileSync(dependabotPath, dependabotContent, 'utf-8');

            return { success: true, filePath: dependabotPath };
        } catch (error) {
            return { success: false, filePath: '' };
        }
    }
}
