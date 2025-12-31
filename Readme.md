# Auto Tagger Plugin for Obsidian

Automatically suggest and apply tags to your notes using multiple embedding-based semantic classifiers, each trained on different collections of your notes.

## Features

- 🗂️ **Collection-Based Organization** - Create multiple collections, each with its own scope, filters, and trained classifier
- 🤖 **Smart Tag Suggestions** - Uses embedding-based semantic classifier with TF-IDF for multi-label document understanding
- 🎯 **Discriminative Word Filtering** - Only suggests tags when document contains their distinctive words (40% minimum overlap)
- 🔄 **Multi-Classifier Aggregation** - Combines suggestions from all applicable collections for comprehensive tagging
- 🌐 **Batch Operations** - Train or debug all collections at once with "All Collections" option
- 📋 **Tag Management** - Per-collection whitelist/blacklist, view all tags with document counts
- ⚙️ **Flexible Configuration** - Control scope, similarity thresholds, and maximum tags per collection
- 🚫 **Existing Tag Filtering** - Never suggests tags you've already added to a note
- 🔄 **Two Tagging Modes** - Integrate (add new tags) or Overwrite (replace all tags)
- 🎨 **Clean UI** - Interactive modal for reviewing and selecting suggested tags with collection indicators

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
2. Click **+ New Collection** to create your first collection
3. Configure each collection:
   - **Name** - Give it a descriptive name (e.g., "Research Papers", "Work Notes")
   - **Folder scope** - Choose which folders this collection covers
     - **All folders** - Process all notes
     - **Include specific** - Only process notes in specified folders
     - **Exclude specific** - Process all notes except those in specified folders
   - **Tag filters** - Set up whitelist/blacklist for this collection
   - **Classification parameters** - Adjust threshold and max tags
4. Click **Train** to train the classifier on existing tagged notes in scope
5. Repeat for additional collections if needed

### Working with Collections

**Collections allow you to:**
- Have specialized classifiers for different areas (e.g., work vs personal, technical vs creative)
- Apply different tag vocabularies to different note types
- Keep tag suggestions relevant by training on focused subsets of notes

**Example Setup:**
```
Collection: "Technical Notes"
  Scope: include (programming, tutorials, documentation)
  Whitelist: python, javascript, api, database, git, debugging
  Blacklist: todo, draft
  
Collection: "Research Papers"
  Scope: include (research, papers)
  Whitelist: machine-learning, nlp, computer-vision, dataset
  Blacklist: todo, draft
  
Collection: "General Knowledge"
  Scope: all
  Blacklist: todo, draft, private
```

### Commands

Access via Command Palette (`Ctrl/Cmd + P`):

- **Train classifier on existing notes** - Select a collection or "All Collections" to train
- **Debug classifier (show stats)** - View statistics for a collection or all collections
- **Suggest tags for current note** - Get tag suggestions from all applicable collections
- **Auto-tag current note** - Automatically apply suggestions with integration or overwrite mode
- **Batch tag all notes** - Tag all notes based on collection scopes
- **Batch tag folder** - Tag only notes in the current folder

### Settings Overview

#### Global Settings
- **Auto-tag on save** - Automatically apply tags from applicable collections when saving notes

#### Collections Management
- **Add Collection** - Create a new collection with its own configuration
- **Enable/Disable** - Toggle collections on/off without deleting them
- **Duplicate** - Copy settings from existing collection (training data not copied)
- **Delete** - Remove collection permanently

#### Per-Collection Settings

**Folder Scope:**
- **Folder mode** - Choose which folders this collection processes:
  - **All folders**: Process every markdown file in your vault
  - **Include specific**: Only process notes in specified folders (focus on specific content)
  - **Exclude specific**: Process all notes except those in specified folders (skip templates/archives)
- **Include/Exclude folders** - Comma-separated folder paths (e.g., `Projects, Work/Active`)
**Tag Filtering:**
- **Tag whitelist** - Only suggest these tags from this collection (leave empty to suggest all learned tags)
  - Useful when you want to focus on a core set of tags per collection
  - The classifier will still learn all tags during training but only suggest whitelisted ones
- **Tag blacklist** - Never train on or suggest these tags in this collection
  - Filters out meta tags like "todo", "draft", "private" during both training and classification
  - Blacklisted tags are completely ignored by this collection's classifier
- **All Tags in Collection** - View all trained tags with document counts and quick blacklist actions (collapsible)

**Classification Parameters:**
- **Similarity threshold** (0.1-0.7) - Minimum similarity score for tag suggestions from this collection
  - Default: 0.3 (30%)
  - **0.1-0.2**: Very liberal (many suggestions)
  - **0.2-0.3**: Liberal (good for exploration)
  - **0.3-0.4**: Balanced (recommended - good precision/recall)
  - **0.4-0.5**: Conservative (high confidence only)
  - **0.5-0.7**: Very strict (near-perfect matches)
  - Works in combination with 40% word overlap requirement
- **Maximum tags** (1-10) - Max number of tags to suggest per note from this collection
  - Default: 5
  - Limits suggestions even if more tags exceed the threshold

**Actions:**
- **Train** - Train this collection's classifier on notes in scope
- **Debug Stats** - View detailed statistics for this collection

### Multi-Collection Workflow

When a note matches multiple collections:
1. All applicable collections' classifiers are queried
2. Tag suggestions are merged, keeping the highest probability for each tag
3. Tag suggestions show which collection they came from: `machine-learning (85.2%) [Technical Notes]`
4. BlCreate your first collection**:
   ```
   Name: General Notes
   Scope: All folders
   Blacklist: todo, draft, private
   ```

2. **Train and test**:
   - Click "Train" for the collection
   - Open an untagged note
   - Run "Suggest tags for current note"
   - Review suggestions

3. **Add specialized collections** as needed:
   ```
   Collection: "Technical Docs"
     Scope: include (programming, tutorials)
     Whitelist: python, javascript, api, database, git
     Blacklist: todo, draft
   
   Collection: "Research"
     Scope: include (papers, research, notes/academic)
     Whitelist: machine-learning, nlp, statistics, dataset
     Blacklist: todo, draft
   ```

4. **Train all collections**:
   - Run "Train classifier on existing notes"
   - Select "🌐 All Collections"
   - Wait for batch training to complete

5. **Use tag suggestions**:
   - Open any note
   - Run "Suggest tags for current note"
   - See suggestions from all applicable collections with source indicators
   - Review and select tags in the modal

6. **Batch operations**:
   - Train all: Select "All Collections" when training
   - Debug all: Select "All Collections" to see stats for all collections
   - Tag notes: Use batch tagging commands

5. **Batch tag notes** (optional):
   - Run "Tag all notes in scope" to process multiple notes
   - Or "Tag all notes in current folder" for a specific folder

## Development

### Available Scripts

- `npm run dev` - Build in development mode
- `npm run build` - Build for production
- `npm run deploy` - Build and deploy to Obsidian vault
- `npm run watch` - Build in development mode and deploy

### Project Struc **collection-based architecture** where each collection has its own **embedding-based semantic classifier** with TF-IDF vector representations. When suggesting tags for a note, the plugin queries all applicable collections and merges their suggestions.

### Collection Matching
1. **Scope Evaluation**: For each enabled collection, check if the note's path matches the collection's folder scope
2. **Applicable Collections**: Gather all collections that include the note in their scope
3. **Multi-Classifier Query**: Query each applicable collection's classifier for tag suggestions
4. **Aggregation**: Merge suggestions, keeping the highest probability score for each tag
5. **Source Tracking**: Display which collection suggested each tag in the UI

### Training Phase (Per Collection, Two-Pass Process)
1. **First Pass - Vocabulary Building**: Scans all tagged notes in scope to build complete document frequency statistics
2. **Second Pass - Embedding Generation**: Creates 1024-dimensional vector embeddings for each document using:
   - **TF (Term Frequency)**: How often words appear in the document (with BM25 saturation)
   - **IDF (Inverse Document Frequency)**: How rare/distinctive each word is across all documents
### Key Advantages
- **Specialized Classifiers**: Each collection learns from relevant notes only, improving accuracy
- **Multi-label Support**: Naturally handles documents with multiple relevant tags (no "winner takes all")
- **Semantic Understanding**: Captures meaning through word co-occurrence patterns
- **Better Generalization**: Related words contribute to similar dimensions
- **Flexible Organization**: Different tag vocabularies for different content types
- **Reduced Noise**: Hash collision reduction and BM25 saturation prevent common words from dominating

### Collection Benefits
- **Domain Separation**: Technical notes don't interfere with creative writing suggestions
- **Specialized Vocabularies**: Work tags stay separate from personal tags
- **Scalability**: Add new collections without retraining everything
- **Focused Training**: Each classifier learns from smaller, more relevant datasets
- **Overlap Handling**: Notes can benefit from multiple collections simultaneously
5. **User Review**: Show suggestions with collection indicators in interactive modal


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
Collections Strategy
- **Start simple**: Begin with one general collection covering all folders
- **Add specialized collections** as your vault grows and themes emerge
- **Overlap is OK**: Collections can cover overlapping folders - suggestions will be merged
- **Enable/disable**: Toggle collections on/off to test different configurations without deleting them
- **Use "All Collections"**: When training, select "All Collections" to update everything at once

### Training
- **Start with 50+ tagged notes** per collection for each major tag category
- **Use consistent, meaningful tags** - classifiers learn semantic patterns from your tagging
- **Train per collection** or use "All Collections" option for batch training
- **Retrain regularly** as you add more tagged notes - classifiers improve with more examples
- **Specialized training**: Collections trained on focused content produce more accurate suggestions
Per-collection thresholds**: Adjust threshold independently for each collection
- **Conservative collections**: Use 0.4-0.5 for high-precision collections
- **Liberal collections**: Use 0.2-0.3 for exploratory collections
- **Check console logs** (Ctrl+Shift+I) to see similarity scores and word overlap percentages
- **Word overlap is critical**: Tags need 40%+ overlap for reliable suggestions

### Multi-Collection Optimization
- **Complementary collections**: Create collections with different tag vocabularies for better coverage
- **Hierarchical collections**: Have a general collection + specialized collections for specific areas
- **Debug all collections**: Use "Debug classifier" → "All Collections" to see stats at a glance
- **Batch operations**: Train all collections together to save time
### Training
- **Start with 50+ tagged notes** for each major tag category for best accuracy
- **Use consistent, meaningful tags** - the classifier learns semantic patterns from your existing tagging
- **Regularly retrain** as you add more tagged notes - the classifier improves with more examples
- **Tag variety matters** - having notes with different writing styles helps the classifier generalize better

### Tag Management
- **Use the whitelist** to focus on your most important tags (project-specific, content categories)
- No collections available**
- Go to Settings → Auto Tagger → Click "+ New Collection"
- Configure and train your first collection
- Existing settings from older versions are automatically migrated to a "Default Collection"

**Collection selector appears empty**
- Make sure at least one collection is enabled (toggle switch)
- Check that collections have been trained (click "Train" button)
- Verify collections have notes in their scope

**Getting no suggestions**
- Ensure the note is in scope of at least one enabled collection
- Check that collections are trained (go to Settings → Auto Tagger)
- Verify tags aren't all blacklisted in applicable collections
- Check console logs (Ctrl+Shift+I) for word overlap details

**Getting irrelevant suggestions**
- Adjust per-collection threshold to be more conservative (0.4-0.5)
- Check which collection is suggesting the tag (shown in brackets)
- Add unwanted tags to that collection's blacklist
- Consider narrowing the collection's scope to more relevant folders

**"All Collections" option doesn't appear**
- You need at least 2 enabled collections for this option
- Check that multiple collections are enabled (not just created)

**Want to reset everything**
- Delete all collections and create new ones
- Or disable collections you don't want and create new ones
- Training data is stored per collection, so deleting removes it

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

2.0.0
