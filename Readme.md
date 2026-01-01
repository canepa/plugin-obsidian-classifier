# Auto Tagger for Obsidian

![Version](https://img.shields.io/badge/version-2.0.8-blue)
![License](https://img.shields.io/badge/license-MIT-green)

Automatically suggest and apply tags to your notes using multiple semantic classifiers. Create specialized collections for different note types, each with its own training scope and tag vocabulary.

## ✨ Features

- **🗂️ Collection-Based Organization** - Multiple classifiers, each trained on different note collections
- **🤖 Semantic Understanding** - Embedding-based classifier using TF-IDF for multi-label classification
- **🎯 Smart Filtering** - Only suggests tags when notes contain distinctive keywords (40% minimum overlap)
- **🔄 Multi-Classifier Aggregation** - Combines suggestions from all applicable collections
- **🌐 Batch Operations** - Train or debug all collections at once
- **⚙️ Flexible Configuration** - Per-collection scope, thresholds, whitelist/blacklist
- **🚫 Duplicate Prevention** - Never suggests tags already in your note
- **🎨 Clean Interface** - Interactive modal showing suggestions with collection sources

## 📦 Installation

### From Community Plugins (Recommended)

1. Open **Settings** → **Community plugins**
2. Click **Browse** and search for "Auto Tagger"
3. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/canepa/plugin-obsidian-classifier/releases)
2. Create folder: `<vault>/.obsidian/plugins/auto-tagger/`
3. Copy the three files into this folder
4. Reload Obsidian and enable the plugin in **Settings** → **Community plugins**

## 🚀 Quick Start

### 1. Create Your First Collection

1. Go to **Settings** → **Auto Tagger**
2. Click **+ New Collection**
3. Configure:
   - **Name**: "My Notes"
   - **Folder scope**: All folders
   - **Blacklist**: `todo, draft, private`

### 2. Train the Classifier

1. Click **Train** button
2. Wait for training to complete
3. Check status: "Trained on X documents with Y unique tags"

### 3. Get Tag Suggestions

1. Open any untagged note
2. Press `Ctrl/Cmd + P` → "Suggest tags for current note"
3. Review suggestions and select tags to add

## 📖 Usage Guide

### Collection Setup

Collections let you organize notes with specialized classifiers. Each collection has:
- **Independent scope** - Which folders to process
- **Tag filters** - Whitelist/blacklist for this collection
- **Training data** - Learned from notes within scope
- **Parameters** - Threshold and max tags

**Example Configuration:**

```yaml
Collection: "Technical Docs"
  Scope: Include folders (programming, tutorials, docs)
  Whitelist: python, javascript, api, database, git
  Threshold: 0.3
  Max tags: 5

Collection: "Research Papers"  
  Scope: Include folders (research, papers)
  Whitelist: machine-learning, nlp, statistics, dataset
  Threshold: 0.4
  Max tags: 3

Collection: "General Notes"
  Scope: All folders
  Blacklist: todo, draft, private
  Threshold: 0.3
  Max tags: 5
```

### Commands

Access via Command Palette (`Ctrl/Cmd + P`):

| Command | Description |
|---------|-------------|
| **Train classifier** | Select collection or "All Collections" to train |
| **Debug classifier stats** | View training statistics |
| **Suggest tags for current note** | Get suggestions from applicable collections |
| **Auto-tag current note** | Automatically apply suggestions |
| **Batch tag all notes** | Tag all notes based on collection scopes |
| **Batch tag folder** | Tag notes in current folder |

### Multi-Collection Workflow

When a note matches multiple collections:
1. All applicable classifiers are queried
2. Suggestions are merged (highest probability per tag)
3. UI shows source: `machine-learning (85%) [Technical Docs]`
4. Blacklisted tags from any collection are removed

## ⚙️ Configuration

### Global Settings

- **Auto-tag on save** - Automatically apply tags when saving notes
- **Debug to console** - Show detailed logs in developer console

### Per-Collection Settings

**Folder Scope:**
- **All folders** - Process entire vault
- **Include specific** - Only process listed folders
- **Exclude specific** - Process all except listed folders

**Tag Filtering:**
- **Whitelist** - Only suggest these tags (empty = suggest all)
- **Blacklist** - Never train on or suggest these tags

**Classification Parameters:**
- **Similarity threshold** (0.1-0.7)
  - 0.1-0.2: Very liberal
  - 0.3-0.4: Balanced (recommended)
  - 0.5-0.7: Very strict
- **Maximum tags** (1-10) - Limit suggestions per collection

### Collection Management

- **Enable/Disable** - Toggle collections without deleting
- **Duplicate** - Copy configuration to new collection
- **Delete** - Permanently remove collection
- **All Tags View** - See trained tags with document counts

## 🔧 How It Works

### Architecture

The plugin uses **embedding-based semantic classification** with TF-IDF vectors:

1. **Collection-Based**: Each collection maintains an independent classifier
2. **Two-Pass Training**: 
   - Pass 1: Build vocabulary and document frequency statistics
   - Pass 2: Generate 1024-dimensional embeddings for each tag
3. **TF-IDF Vectors**: Combines term frequency with inverse document frequency
4. **Cosine Similarity**: Measures semantic similarity between note and tags
5. **Word Overlap Filter**: Requires 40% of tag's distinctive words in document
6. **Multi-Classifier Query**: Aggregates suggestions from all applicable collections

### Why This Works

- **Multi-label support** - Handles notes with multiple relevant tags
- **Semantic understanding** - Captures meaning through word co-occurrence
- **Discriminative filtering** - Prevents false positives via keyword requirements
- **Collection isolation** - Technical notes don't interfere with creative writing
- **Scalability** - Add collections without retraining everything

## 💡 Tips & Best Practices

### Training

- Start with **50+ tagged notes** per collection for best results
- Use **consistent, meaningful tags** in frontmatter
- **Retrain regularly** as you add more notes
- **Specialized collections** produce more accurate suggestions

### Optimization

- **Adjust thresholds** per collection (conservative vs liberal)
- **Check console logs** (`Ctrl+Shift+I`) to see similarity scores
- **Word overlap is critical** - 40%+ needed for reliable suggestions
- **Use whitelists** to focus on important tags per collection

### Collection Strategy

- Start with one general collection
- Add specialized collections as themes emerge
- Overlapping scopes are OK - suggestions merge
- Use "All Collections" for batch operations

## 🐛 Troubleshooting

**No suggestions appearing:**
- Verify note is in scope of an enabled collection
- Check that collections are trained
- Look for blacklisted tags
- Review console logs for word overlap details

**Irrelevant suggestions:**
- Increase similarity threshold (0.4-0.5)
- Check which collection suggested it (shown in brackets)
- Add to blacklist or narrow collection scope

**Collection selector empty:**
- Ensure at least one collection is enabled
- Verify collections have been trained

**"All Collections" option missing:**
- Need at least 2 enabled collections

## 🛠️ Development

### Setup

```bash
git clone https://github.com/canepa/plugin-obsidian-classifier.git
cd plugin-obsidian-classifier
npm install
```

### Scripts

```bash
npm run dev      # Development build
npm run build    # Production build with linting and type checking
npm run lint     # Check code for guideline violations
npm run lint:fix # Auto-fix linting issues where possible
npm run deploy   # Build and deploy to vault
npm run watch    # Development build + deploy
```

### Code Quality

The project uses ESLint with the official [Obsidian ESLint plugin](https://github.com/obsidianmd/eslint-plugin) to enforce community plugin guidelines:

- **Automatic checks** - Linting runs on every build
- **Obsidian rules** - Catches violations before submission
  - No forbidden DOM elements (innerHTML security)
  - No inline styles (use CSS classes)
  - Proper heading APIs (Setting.setHeading())
  - Sentence case for UI text
  - iOS-compatible regex patterns
- **TypeScript rules** - Unused variables, explicit any types
- **Auto-fix** - Many issues can be fixed automatically with `npm run lint:fix`

### Configuration

For development deployment:

1. Copy the example configuration:
   ```bash
   cp deploy.config.example.ps1 deploy.config.ps1
   ```

2. Update `deploy.config.ps1` with your vault path:
   ```powershell
   $pluginDir = "C:\path\to\vault\.obsidian\plugins\obsidian-auto-tagger"
   ```

3. The `deploy.config.ps1` file is git-ignored to keep your local paths private

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 👤 Author

**Alessandro Canepa**

- GitHub: [@canepa](https://github.com/canepa)
- Repository: [plugin-obsidian-classifier](https://github.com/canepa/plugin-obsidian-classifier)

## 🙏 Acknowledgments

Built with the [Obsidian API](https://github.com/obsidianmd/obsidian-api)

---

**Minimum Obsidian Version:** 0.15.0