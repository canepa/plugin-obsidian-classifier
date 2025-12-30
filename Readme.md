# Auto Tagger Plugin for Obsidian

Automatically suggest and apply tags to your notes using an embedding-based semantic classifier trained on your existing tagged notes.

## Features

- 🤖 **Smart Tag Suggestions** - Uses embedding-based semantic classifier with TF-IDF for multi-label document understanding
- 🎯 **Discriminative Word Filtering** - Only suggests tags when document contains their distinctive words (15% minimum overlap)
- 🔄 **Synonym Detection** - Avoids suggesting tags already present or their synonyms (e.g., won't suggest "ai" if "artificial-intelligence" exists)
- 📋 **Tag Management** - Whitelist/blacklist tags, view all tags with document counts and quick blacklist actions
- ⚙️ **Flexible Configuration** - Control which folders to process, similarity thresholds, and maximum tags
- 🚫 **Existing Tag Filtering** - Never suggests tags you've already added to a note
- 🔄 **Two Tagging Modes** - Integrate (add new tags) or Overwrite (replace all tags)
- 🎨 **Clean UI** - Interactive modal for reviewing and selecting suggested tags

## Installation

### For Development

1. Clone this repository to your development folder:
```bash
git clone <your-repo-url> plugin-obsidian-classifier
cd plugin-obsidian-classifier
```

2. Install dependencies:
```bash
npm install
```

3. Build and deploy to your Obsidian vault:
```bash
npm run deploy
```

4. In Obsidian:
   - Go to **Settings** → **Community plugins**
   - Turn off **Restricted mode** if it's on
   - Find **Auto Tagger** in the list and enable it

### Manual Installation

1. Create the plugin folder:
```
<your-vault>/.obsidian/plugins/obsidian-auto-tagger/
```

2. Copy these files to that folder:
   - `main.js`
   - `manifest.json`
   - `styles.css`

3. Reload Obsidian and enable the plugin

## Configuration

Update the deployment path in `deploy.ps1` to match your Obsidian vault:
```powershell
$pluginDir = "C:\path\to\your\vault\.obsidian\plugins\obsidian-auto-tagger"
```

## Usage

### Initial Setup

1. Go to **Settings** → **Auto Tagger**
2. Configure folder mode:
   - **All folders** - Process all notes
   - **Include specific** - Only process notes in specified folders
   - **Exclude specific** - Process all notes except those in specified folders
3. Set up **whitelist** (optional) - Only suggest these tags
4. Set up **blacklist** - Never train on or suggest these tags
5. Click **Train Classifier** to train on your existing tagged notes

### Commands

Access via Command Palette (`Ctrl/Cmd + P`):

- **Train classifier on existing notes** - Train the AI on your tagged notes
- **Suggest tags for current note** - Get tag suggestions for the active note
- **Tag all notes in scope** - Automatically tag all notes based on settings
- **Tag all notes in current folder** - Tag only notes in the current folder

### Settings Overview

#### Folder Configuration
- **Folder mode** - Choose which folders to process:
  - **All folders**: Process every markdown file in your vault
  - **Include specific**: Only process notes in specified folders (useful for focusing on main content)
  - **Exclude specific**: Process all notes except those in specified folders (useful for skipping templates/archives)
- **Include/Exclude folders** - Comma-separated folder paths (e.g., `Projects, Work/Active`)

#### Tag Filtering
- **Tag whitelist** - Only suggest these tags (leave empty to suggest all learned tags)
  - Useful when you want to focus on a core set of tags
  - The classifier will still learn all tags during training but only suggest whitelisted ones
- **Tag blacklist** - Never train on or suggest these tags
  - Filters out meta tags like "todo", "draft", "private" during both training and classification
  - Blacklisted tags are completely ignored by the classifier
- **All Tags in Classifier** - View all trained tags with document counts and quick blacklist actions

#### Classification Parameters
- **Similarity threshold** (0.1-0.7) - Minimum similarity score for tag suggestions
  - Default: 0.3 (30%)
  - **0.1-0.2**: Very liberal (many suggestions)
  - **0.2-0.3**: Liberal (good for exploration)
  - **0.3-0.4**: Balanced (recommended - good precision/recall)
  - **0.4-0.5**: Conservative (high confidence only)
  - **0.5-0.7**: Very strict (near-perfect matches)
  - Works in combination with 15% word overlap requirement
- **Maximum tags** (1-10) - Max number of tags to suggest per note
  - Default: 5
  - Limits suggestions even if more tags exceed the threshold

#### Auto-Tagging
- **Auto-tag on save** - Automatically apply tags when saving notes
  - Opens modal with suggestions after each save
  - Only triggers for notes in scope (based on folder settings)

#### Classifier Training
- **Train Classifier** button - Train on all existing tagged notes
- **Clear** button - Reset all training data

### Recommended Workflow

1. **Set up tag filters**:
   ```
   Whitelist: project, important, review, tutorial, reference
   Blacklist: todo, draft, private, archive
   ```

2. **Configure folders**:
   - Use "Include" mode with your main content folders
   - Or use "Exclude" mode to skip templates and archives

3. **Train the classifier**:
   - Click "Train Classifier" in settings
   - Wait for training to complete (shows document count)

4. **Use tag suggestions**:
   - Open a note
   - Run "Suggest tags for current note" command
   - Review and select tags in the modal
   - Click "Apply Selected Tags"

5. **Batch tag notes** (optional):
   - Run "Tag all notes in scope" to process multiple notes
   - Or "Tag all notes in current folder" for a specific folder

## Development

### Available Scripts

- `npm run dev` - Build in development mode
- `npm run build` - Build for production
- `npm run deploy` - Build and deploy to Obsidian vault
- `npm run watch` - Build in development mode and deploy

### Project Structure

```
plugin-obsidian-classifier/
├── main.ts                  # Main plugin file
├── embedding-classifier.ts  # Embedding-based semantic classifier
├── settings.ts              # Settings tab and interface
├── modal.ts                 # Tag suggestion modal UI
├── manifest.json            # Plugin manifest
├── package.json             # NPM dependencies and scripts
├── esbuild.config.mjs       # Build configuration
├── tsconfig.json            # TypeScript configuration
├── deploy.ps1               # Deployment script
└── styles.css               # Plugin styles
```

## How It Works

The plugin uses an **embedding-based semantic classifier** with TF-IDF vector representations to learn patterns from your existing tagged notes:

### Training Phase (Two-Pass Process)
1. **First Pass - Vocabulary Building**: Scans all tagged notes to build complete document frequency statistics (which words appear in how many documents)
2. **Second Pass - Embedding Generation**: Creates 1024-dimensional vector embeddings for each document using:
   - **TF (Term Frequency)**: How often words appear in the document (with sublinear scaling to reduce impact of very frequent words)
   - **IDF (Inverse Document Frequency)**: How rare/distinctive each word is across all documents
   - **Multiple Hash Functions**: Each word contributes to 3 dimensions (50%, 30%, 20%) to reduce hash collisions
3. **Tag Embeddings**: Averages all document embeddings for each tag, then normalizes to create a semantic "fingerprint" for that tag

### Classification Phase
1. **Generate Document Embedding**: Creates a 1024-dimensional vector for the current note using the same TF-IDF approach
2. **Cosine Similarity**: Compares the document embedding to each tag embedding using cosine similarity (measures angle between vectors)
3. **Discriminative Word Filtering**: Checks if document contains at least 40% of the tag's most distinctive words
   - Each tag has a cache of its top 20 most distinctive words (high IDF = rare across corpus)
   - Filters out tags with weak word overlap even if embedding similarity is high
   - Tags with <60% overlap need 25% higher similarity to compensate
   - Example: Technical tags like "git" won't be suggested for management articles
4. **Existing Tag Filtering**: Automatically excludes tags already present in the document (including synonyms)
   - Won't suggest "ai" if document has "artificial-intelligence"
   - Won't suggest "machine-learning" if document has "ml"
5. **Combined Scoring**: Ranks suggestions using 70% word overlap + 30% similarity
   - Heavily prioritizes concrete word evidence over semantic similarity
   - Higher overlap threshold ensures only genuinely relevant tags pass
6. **Threshold Filtering**: Applies similarity threshold to produce final suggestions
7. **User Review**: Shows suggestions in an interactive modal for you to review and select

### Key Advantages Over Naive Bayes
- **Multi-label Support**: Naturally handles documents with multiple relevant tags (no "winner takes all" effect)
- **Semantic Understanding**: Captures meaning through word co-occurrence patterns, not just individual word probabilities
- **Better Generalization**: Related words contribute to similar dimensions, helping recognize content variations
- **Reduced Noise**: Hash collision reduction and sublinear TF scaling prevent common words from dominating

### Tag Behavior
- **Existing tags ARE filtered during classification**: The classifier automatically excludes tags already present in the document
- **Synonym detection**: Tags with similar normalized forms (spaces/dashes removed) are considered duplicates
  - Example: "artificial-intelligence", "artificial_intelligence", and "artificialintelligence" are all normalized to "ai"
- **Discriminative word filtering**: Tags must have at least 40% word overlap with their distinctive vocabulary
  - Each tag's distinctive words are the top 20 rarest words (high IDF) from its training documents
  - Tags with <60% overlap need significantly higher similarity scores (25% boost required)
  - Prevents suggesting technical tags for non-technical content
- **Blacklisted tags**: Excluded from both training and suggestions
- **Integrate mode**: Adds new suggested tags while preserving existing ones (avoids duplicates)
- **Overwrite mode**: Replaces all existing tags with suggestions

## Tips

### Training
- **Start with 50+ tagged notes** for each major tag category for best accuracy
- **Use consistent, meaningful tags** - the classifier learns semantic patterns from your existing tagging
- **Regularly retrain** as you add more tagged notes - the classifier improves with more examples
- **Tag variety matters** - having notes with different writing styles helps the classifier generalize better

### Tag Management
- **Use the whitelist** to focus on your most important tags (project-specific, content categories)
- **Use the blacklist** to exclude meta tags ("todo", "draft", "private", workflow tags)
- **Review tag suggestions** before applying - the classifier is a tool to help, not replace your judgment
- **Synonym awareness**: The classifier treats "ai", "artificial-intelligence", and "artificial_intelligence" as the same tag

### Threshold Tuning
- **Getting too many suggestions?** Increase threshold to 0.4-0.5
- **Getting too few suggestions?** Decrease threshold to 0.2-0.25
- **Check console logs** (Ctrl+Shift+I) to see similarity scores AND word overlap percentages
- **Word overlap is critical**: Tags need 30%+ overlap; tags with <50% overlap need extra high similarity

### Multi-Label Documents
- The embedding classifier excels at documents with multiple topics (e.g., "AI + Management" articles)
- Expect relevant tags to score 40-70% similarity with 50-100% word overlap
- Irrelevant tags are filtered by low word overlap (<40%) or need much higher similarity
- Tags need at least 8 of their 20 distinctive words present (40% threshold)

### Performance
- **Vocabulary size**: With ~20,000 unique words, you'll see ~19 words per dimension (reduced collisions)
- **Training time**: ~2-3 seconds for 300 notes (includes vocabulary building + distinctive word caching)
- **Classification speed**: Near-instant (<100ms per note)
- **Memory efficient**: Distinctive word cache uses ~20 words per tag instead of storing all training data

## Troubleshooting

**Plugin doesn't appear in Obsidian**
- Make sure manifest.json is present and valid
- Restart Obsidian completely
- Check that "Restricted mode" is off

**Training fails or gives no suggestions**
- Ensure you have notes with tags in frontmatter (YAML format)
- Check that folders are not excluded by your settings
- Verify tags aren't all in the blacklist
- If suggestions seem wrong, check console logs to see word overlap percentages
- Low word overlap (<30%) means the document doesn't contain the tag's distinctive vocabulary

**Getting irrelevant tag suggestions**
- Check console logs to see both similarity % and overlap %
- Tags need 30% word overlap minimum - if irrelevant tags pass, they may share common words
- Tags with <50% overlap need 20% higher similarity to be suggested
- Increase similarity threshold (0.4-0.5) to be more conservative
- Add unwanted tags to the blacklist
- Retrain after accumulating more tagged notes for better distinctive word identification

**File size is too large**
- The built main.js should be around 12-15KB
- If it's much larger, check that external dependencies are properly configured

## License

MIT

## Author

Alessandro Canepa

## Version

1.0.0
