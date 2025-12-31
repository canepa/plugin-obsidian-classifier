# Contributing to Auto Tagger for Obsidian

Thank you for your interest in contributing to Auto Tagger! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- Node.js (LTS version recommended)
- npm
- Git
- An Obsidian vault for testing

### Development Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/plugin-obsidian-classifier.git
   cd plugin-obsidian-classifier
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure deployment path in `deploy.ps1` (Windows) or create equivalent for your OS:
   ```powershell
   $pluginDir = "C:\path\to\your\vault\.obsidian\plugins\auto-tagger"
   ```

4. Build and deploy:
   ```bash
   npm run watch   # Development build + deploy
   ```

## Development Workflow

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development build |
| `npm run build` | Production build with linting and type checking |
| `npm run lint` | Check code for guideline violations |
| `npm run lint:fix` | Auto-fix linting issues where possible |
| `npm run deploy` | Build and deploy to vault |
| `npm run watch` | Development build + deploy |

### Code Quality

This project uses ESLint with the official [Obsidian ESLint plugin](https://github.com/obsidianmd/eslint-plugin). Before submitting a PR, ensure your code passes linting:

```bash
npm run lint
```

Key rules enforced:

- No `innerHTML` (security)
- No inline styles (use CSS classes in `styles.css`)
- Use `Setting.setHeading()` for headings
- Sentence case for UI text
- iOS-compatible regex patterns
- No unused variables or explicit `any` types

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Use a clear, descriptive title
3. Include:
   - Obsidian version
   - Plugin version
   - Steps to reproduce
   - Expected vs actual behavior
   - Console errors (Ctrl+Shift+I)

### Suggesting Features

1. Check existing issues and discussions
2. Describe the use case and problem you're solving
3. If possible, outline how the feature might work with the existing collection-based architecture

### Submitting Pull Requests

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes, following the coding style

3. Test thoroughly:
   - Create/train collections
   - Test tag suggestions
   - Verify batch operations work
   - Check settings UI renders correctly

4. Run quality checks:
   ```bash
   npm run build
   ```

5. Write a clear commit message:
   ```
   feat: add support for nested tag hierarchies
   
   - Updated classifier to handle parent/child tags
   - Added UI toggle in collection settings
   - Updated documentation
   ```

6. Push and open a PR against `main`

## Coding Guidelines

### TypeScript

- Use explicit types; avoid `any`
- Prefer `interface` over `type` for object shapes
- Use `async/await` over raw promises

### Obsidian API

- Use Obsidian's APIs for file operations (`vault.read`, `vault.modify`)
- Register commands in `onload()`, clean up in `onunload()`
- Use `Setting` API for the settings tab

### CSS

- Add styles to `styles.css`, not inline
- Prefix custom classes with `auto-tagger-` to avoid conflicts
- Support both light and dark themes

### Architecture Notes

The plugin uses a collection-based architecture with TF-IDF embeddings:

- Each collection maintains an independent classifier
- Collections can have overlapping scopes
- Suggestions from multiple collections are merged
- Training is a two-pass process (vocabulary building, then embedding generation)

When adding features, consider how they interact with this multi-collection design.

## Testing

Currently, testing is manual. When testing changes:

1. Create at least two collections with different scopes
2. Train both collections
3. Test notes that fall into one collection, both collections, and neither
4. Verify settings persist after Obsidian restart
5. Check console for errors during all operations

## Questions?

Open an issue or start a discussion on GitHub. For general Obsidian plugin development questions, the [Obsidian Discord](https://discord.gg/obsidianmd) is also helpful.

---

Thank you for contributing!
