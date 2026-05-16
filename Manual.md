# Auto Tagger - User Manual

**Version 2.0.11** | [GitHub](https://github.com/canepa/plugin-obsidian-classifier) | [Report Issues](https://github.com/canepa/plugin-obsidian-classifier/issues)

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Core Concepts](#core-concepts)
- [Configuration Guide](#configuration-guide)
- [Using the Plugin](#using-the-plugin)
- [Advanced Features](#advanced-features)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Technical Details](#technical-details)
- [FAQ](#faq)

---

## Overview

Auto Tagger is an Obsidian plugin that automatically suggests and applies tags to your notes using semantic classifiers with advanced filtering. It uses machine learning (TF-IDF embeddings) to understand your note content and suggest relevant tags based on your existing tagging patterns.

### Key Features

- **🗂️ Collection-Based Organization** - Create multiple specialized classifiers for different note types
- **🤖 Dual Classifier Types** - Choose between Basic (fast) or Advanced (precise) classifiers
- **🎯 Smart Filtering** - Advanced overlap detection prevents false positives
- **🔄 Multi-Classifier Aggregation** - Combine suggestions from multiple collections
- **📊 Detailed Statistics** - View comprehensive training statistics and tag distributions
- **🚫 Duplicate Prevention** - Never suggests tags already in your note
- **🧹 Auto-Cleanup** - Automatically removes blacklisted tags from notes
- **📋 Batch Summaries** - Detailed reports for batch operations

---

## Installation

### Method 1: Community Plugins (Recommended)

1. Open Obsidian **Settings**
2. Navigate to **Community plugins**
3. Click **Browse**
4. Search for **"Auto Tagger"**
5. Click **Install**
6. Click **Enable**

### Method 2: Manual Installation

1. Download the latest release files from [GitHub Releases](https://github.com/canepa/plugin-obsidian-classifier/releases):
   - `main.js`
   - `manifest.json`
   - `styles.css`

2. Navigate to your vault's plugins folder:

   ```text
   <your-vault>/.obsidian/plugins/
   ```

3. Create a new folder called `auto-tagger`

4. Copy the three downloaded files into this folder

5. Restart Obsidian or reload the app

6. Enable the plugin in **Settings** → **Community plugins**

---

## Getting Started

### Step 1: Create Your First Collection

A **collection** is a specialized classifier that learns from a specific set of notes.

1. Open **Settings** → **Auto Tagger**
2. Click the **+ New Collection** button
3. Configure your collection:
   - **Name**: Give it a descriptive name (e.g., "My Notes")
   - **Classifier Type**: Start with **Basic** (you can change this later)
   - **Folder Scope**: Choose **All folders** for your first collection
   - **Blacklist**: Add any tags you want to exclude (e.g., `todo, draft, private`)

4. Click **Save**

### Step 2: Train the Classifier

Training teaches the classifier to recognize patterns in your tagged notes.

1. In the collection settings, click the **Train** button
2. Wait for training to complete (usually a few seconds)
3. Check the status message: "Trained on X documents with Y unique tags"

**Requirements:**

- Minimum **50+ tagged notes** recommended for good results
- Tags must be in YAML frontmatter format:

  ```yaml
  ---
  tags: [python, machine-learning, tutorial]
  ---
  ```

### Step 3: Get Tag Suggestions

Now you're ready to start getting suggestions!

1. Open any note (tagged or untagged)
2. Press `Ctrl/Cmd + P` to open the Command Palette
3. Type and select **"Suggest tags for current note"**
4. Review the suggestions in the modal
5. Click on tags to add them to your note

**That's it!** You're now using Auto Tagger.

---

## Core Concepts

### Collections

Collections are independent classifiers that each maintain their own:

- **Training scope** - Which folders to learn from
- **Tag vocabulary** - Which tags are allowed/forbidden
- **Parameters** - Thresholds and limits
- **Type** - Basic or Advanced classifier

You can have multiple collections for different note types (e.g., "Technical Docs", "Personal Notes", "Research Papers").

### Classifier Types

#### Basic (TF-IDF)

- **Speed**: Fast
- **Coverage**: Broader (more suggestions)
- **Best for**: General use, smaller collections, quick training
- **Technical**: 40% overlap threshold, 70/30 similarity/overlap weighting

#### Advanced (Enhanced)

- **Precision**: Higher (fewer false positives)
- **Coverage**: Stricter (quality over quantity)
- **Best for**: Specialized content, avoiding irrelevant tags
- **Technical**: Dual filtering (55% threshold OR 45%+25% overlap), adaptive weighting

### Folder Scope

Controls which notes a collection processes:

- **All folders** - Process entire vault
- **Include specific** - Only process listed folders (e.g., `programming, tutorials`)
- **Exclude specific** - Process all folders except listed ones (e.g., `archive, templates`)

### Tag Filtering

#### Whitelist

Restricts suggestions to only specified tags. Empty = allow all learned tags.

**Example**: `python, javascript, api, database, git`

#### Blacklist

Excludes tags from training, suggestions, and **automatically removes them** from notes if present.

**Example**: `todo, draft, private, wip`

---

## Configuration Guide

### Global Settings

Access via **Settings** → **Auto Tagger**

#### Auto-tag on Save

- **Default**: Off
- **Description**: Automatically applies tag suggestions when you save a note
- **Use case**: Hands-free tagging workflow

#### Debug to Console

- **Default**: Off
- **Description**: Shows detailed logs in developer console (`F12` or `Ctrl+Shift+I`)
- **Use case**: Troubleshooting, understanding classifier decisions, optimizing thresholds

### Collection Settings

Each collection has its own configuration:

#### Basic Information

- **Name**: Display name for the collection
- **Enabled**: Toggle collection on/off without deleting

#### Classifier Configuration

- **Type**: Basic or Advanced
- **Similarity Threshold** (0.1-0.7):
  - `0.1-0.2`: Very liberal (many suggestions)
  - `0.3-0.4`: Balanced (recommended)
  - `0.5-0.7`: Very strict (high confidence only)
- **Maximum Tags** (1-10): Limit suggestions per collection

#### Scope & Filters

- **Folder Scope**: All/Include/Exclude folders
- **Whitelist**: Allowed tags (comma-separated)
- **Blacklist**: Forbidden tags (comma-separated)

#### Collection Actions

Each collection provides several action buttons:

- **Train** - Train or retrain the classifier on notes in scope
- **Clear training** - Delete all trained data (requires confirmation)
- **Debug stats** - View detailed statistics (vocabulary size, top tags, training date)
- **Remove all tags** - Remove all tags from this collection from files in scope (requires confirmation)
  - Only enabled when collection has trained data
  - Removes any tags that were trained in the collection
  - Shows a detailed summary of files modified and tags removed
  - Useful for cleaning up after changing collection scope or reorganizing tags

### Example Configurations

#### Configuration 1: Technical Documentation

```yaml
Name: "Technical Docs"
Type: Advanced
Scope: Include folders (programming, tutorials, docs)
Whitelist: python, javascript, typescript, api, database, git, docker
Threshold: 0.35
Max Tags: 5
```

#### Configuration 2: Research Papers

```yaml
Name: "Research Papers"
Type: Advanced
Scope: Include folders (research, papers, academic)
Whitelist: machine-learning, nlp, statistics, dataset, paper-review
Threshold: 0.40
Max Tags: 3
```

#### Configuration 3: General Notes

```yaml
Name: "General Notes"
Type: Basic
Scope: All folders
Blacklist: todo, draft, private, wip, archive
Threshold: 0.30
Max Tags: 5
```

---

## Using the Plugin

### Commands

All commands are accessible via Command Palette (`Ctrl/Cmd + P`):

| Command | Description | Use Case |
| ------- | ----------- | -------- |
| **Train classifier** | Trains selected collection or all collections | After adding new tagged notes |
| **Debug classifier stats** | View training statistics and tag distributions | Verify training, check vocabulary |
| **Suggest tags for current note** | Get tag suggestions in interactive modal | Manual tagging workflow |
| **Auto-tag current note** | Automatically apply all suggestions | Quick tagging |
| **Batch tag all notes** | Tag all notes in vault with summary | Initial setup, bulk operations |
| **Batch tag folder** | Tag all notes in current folder with summary | Organize specific folder |

### Suggesting Tags (Interactive)

1. Open a note
2. Run **"Suggest tags for current note"**
3. Review suggestions with probabilities and sources
4. Click tags to add them to your note's frontmatter

**Example Modal Display**:

```text
machine-learning (85%) [Technical Docs]
python (78%) [Technical Docs]
tutorial (72%) [General Notes]
api (65%) [Technical Docs]
```

### Auto-Tagging (Automatic)

1. Open a note
2. Run **"Auto-tag current note"**
3. All high-confidence suggestions are added automatically
4. Notification shows which tags were added

### Batch Operations

#### Batch Tag All Notes

- Processes entire vault
- Shows summary modal with statistics
- Reports files modified, tags added/removed
- Expandable details show per-file changes

#### Batch Tag Folder

- Processes current folder and subfolders
- Same summary modal as "all notes"
- Useful for organizing specific sections

**Summary Modal Includes**:

- ✅ **Files modified**: Total count
- ➕ **Tags added**: Total count
- 🗑️ **Tags removed**: Total count (blacklisted)
- 📋 **View details**: File-by-file breakdown

---

## Advanced Features

### Multi-Collection Workflow

When a note matches multiple collections:

1. **Blacklist removal** - Blacklisted tags are removed first
2. **All classifiers queried** - Each applicable collection suggests tags
3. **Suggestions merged** - Highest probability per tag wins
4. **Source displayed** - UI shows which collection suggested each tag

**Example**:

```text
Note in "programming/python/" folder matches:
- "Technical Docs" collection (includes programming/)
- "General Notes" collection (all folders)

Result:
python (85%) [Technical Docs]
tutorial (72%) [General Notes]
```

### Blacklist Auto-Cleanup

Blacklisted tags are **automatically removed** from notes when:

- Getting suggestions
- Auto-tagging
- Batch operations

You'll see a notification: "Removed blacklisted tags: todo, draft"

### Debug Mode

Enable in settings to see detailed classification pipeline:

**Console Output Includes**:

- Document embeddings (dimensions, magnitude)
- Tag embeddings (dimensions, magnitude)
- Similarity scores for each candidate tag
- Overlap percentages with distinctive words
- Filter condition evaluation (pass/fail reasons)
- Final suggested tags with probabilities

**How to Use**:

1. Enable **Debug to console** in settings
2. Open Developer Console (`F12` or `Ctrl+Shift+I`)
3. Run any command (suggest, auto-tag, batch)
4. Review detailed logs

### Viewing Classifier Statistics

Click **Debug stats** button in collection settings to see:

- **Training date**: When classifier was last trained
- **Classifier type**: Basic or Advanced
- **Vocabulary size**: Total unique words learned
- **Tag count**: Number of unique tags
- **Average docs per tag**: Distribution of tags across notes
- **Top tags**: Most common tags by document count
- **Distinctive words per tag**: Average count

---

## Best Practices

### Training

✅ **DO:**

- Start with **50+ tagged notes** per collection
- Use **consistent, meaningful tags** in frontmatter
- **Retrain regularly** as you add more notes (monthly)
- Create **specialized collections** for different topics

❌ **DON'T:**

- Train on untagged notes
- Use inconsistent tag names (e.g., `ml` vs `machine-learning`)
- Forget to retrain after major vault changes
- Mix very different topics in one collection

### Classifier Selection

**Use Basic When**:

- You want more tag suggestions
- Working with general-purpose collections
- Vault has consistent tagging patterns
- Performance is priority

**Use Advanced When**:

- You need high precision (few false positives)
- Working with specialized collections
- Notes have very specific topics
- Quality is more important than quantity

### Threshold Tuning

| Threshold | Behavior | Best For |
| --------- | -------- | -------- |
| 0.1-0.2 | Very liberal, many suggestions | Exploration, discovery |
| 0.3-0.4 | Balanced, moderate suggestions | Most users (recommended) |
| 0.5-0.7 | Very strict, high confidence only | Critical tagging, specialized topics |

**Tip**: Enable debug mode and review similarity scores to find optimal threshold for your collection.

### Collection Strategy

**Recommended Approach**:

1. **Start simple**: Create one general collection (Basic, all folders)
2. **Train and test**: Tag 50+ notes, train, test suggestions
3. **Identify patterns**: Notice which notes get irrelevant suggestions
4. **Add specialized collections**: Create focused collections for specific topics
5. **Use Advanced selectively**: Switch to Advanced for specialized collections

**Example Progression**:

```text
Week 1: "General Notes" (Basic, all folders)
Week 2: Add "Technical Docs" (Advanced, programming folders)
Week 3: Add "Meeting Notes" (Basic, meetings folder)
Week 4: Fine-tune thresholds based on results
```

### Organizing Large Vaults

For vaults with 1000+ notes:

1. **Use folder-scoped collections** instead of "all folders"
2. **Separate by topic**: Technical, Personal, Work, Research
3. **Use blacklists liberally** to prevent tag pollution
4. **Batch operations cautiously**: Test on small folder first
5. **Monitor batch summaries**: Verify changes before accepting

---

## Troubleshooting

### No Suggestions Appearing

**Possible Causes & Solutions**:

1. **Collection not trained**
   - Solution: Click "Train" button in collection settings
   - Verify: Check for "Trained on X documents" status

2. **Note out of scope**
   - Solution: Check collection folder scope settings
   - Verify: Enable debug mode and check console

3. **All tags blacklisted**
   - Solution: Review blacklist settings
   - Verify: Click "All Tags View" to see available tags

4. **Threshold too high**
   - Solution: Lower similarity threshold to 0.3
   - Verify: Enable debug mode to see similarity scores

5. **Insufficient training data**
   - Solution: Add more tagged notes (aim for 50+)
   - Verify: Click "Debug stats" to see tag count

### Irrelevant Suggestions

**Solutions**:

1. **Switch to Advanced classifier**
   - Higher precision, fewer false positives
   - 55% threshold with dual filtering

2. **Increase similarity threshold**
   - Try 0.4-0.5 for stricter filtering
   - Monitor results and adjust

3. **Use whitelist**
   - Restrict to relevant tags only
   - Example: `python, api, database` for tech notes

4. **Add to blacklist**
   - Remove common false positives
   - Example: Add `general, misc, other`

5. **Narrow collection scope**
   - Use folder includes/excludes
   - Create specialized collections

### Too Few Suggestions

**Solutions**:

1. **Switch to Basic classifier**
   - Broader coverage, 40% threshold
   - 70/30 similarity/overlap weighting

2. **Lower similarity threshold**
   - Try 0.2-0.3 for more suggestions
   - Balance with quality

3. **Remove whitelist restriction**
   - Allow all learned tags
   - Use blacklist for exclusions only

4. **Add more training data**
   - Aim for 50+ tagged notes minimum
   - Ensure tags are diverse and relevant

5. **Check folder scope**
   - Verify note is included in scope
   - Expand scope if too narrow

### Training Issues

**Common Issues**:

1. **"Trained on 0 documents"**
   - Cause: No tagged notes in scope
   - Solution: Add tags to notes in frontmatter, retrain

2. **Warning: "Skipping word 'constructor'"**
   - Cause: JavaScript reserved word protection
   - Solution: Ignore (safe, expected behavior)

3. **NaN errors in console**
   - Cause: Corrupted embeddings
   - Solution: Retrain collection (defensive checks will fix)

4. **Training very slow**
   - Cause: Large vault (1000+ notes)
   - Solution: Use folder-scoped collections, be patient

### Performance Issues

**If plugin feels slow**:

1. **Reduce collection count**
   - Each collection adds overhead
   - Consolidate similar collections

2. **Use folder scopes**
   - Don't train on entire vault if unnecessary
   - Scope to relevant folders only

3. **Lower max tags**
   - Reduces processing time
   - Set to 3-5 instead of 10

4. **Disable auto-tag on save**
   - Manual control for better performance
   - Use batch operations when needed

---

## Technical Details

### How It Works

#### 1. Training Phase (Two-Pass)

##### Pass 1: Vocabulary Building

- Tokenize all notes in scope
- Build word frequency statistics
- Calculate document frequencies (DF)
- Create vocabulary (unique words)

##### Pass 2: Embedding Generation

- Generate 1024-dimensional TF-IDF vectors for each tag
- Calculate term frequency (TF) with BM25 saturation
- Calculate inverse document frequency (IDF) with boost
- Store embeddings for fast inference

#### 2. Inference Phase

**When suggesting tags**:

1. Generate document embedding for current note
2. Calculate cosine similarity with all tag embeddings
3. Extract distinctive words (top 20 high-IDF terms per tag)
4. Calculate overlap percentage with note words
5. Apply classifier-specific filtering:
   - **Basic**: 40% overlap + weighted score (70% sim, 30% overlap)
   - **Advanced**: Dual filter (55% sim OR 45% sim + 25% overlap)
6. Rank by probability (similarity score)
7. Return top N suggestions (max tags setting)

#### 3. Multi-Collection Aggregation

When multiple collections apply:

1. Query each applicable collection
2. Merge suggestions (keep highest probability per tag)
3. Sort by probability descending
4. Limit to highest max tags across collections

### TF-IDF Formula

**Term Frequency (with BM25 saturation)**:

```text
TF(t,d) = (freq(t,d) * (k1 + 1)) / (freq(t,d) + k1)
where k1 = 1.5 (saturation parameter)
```

**Inverse Document Frequency (boosted)**:

```text
IDF(t) = log((N + 1) / (DF(t) + 1)) + 1
where N = total documents, DF(t) = documents containing term t
```

**TF-IDF**:

```text
TF-IDF(t,d) = TF(t,d) * IDF(t)
```

### Cosine Similarity

```text
similarity(doc, tag) = (doc · tag) / (||doc|| * ||tag||)
where · is dot product, ||x|| is magnitude
```

### Defensive Programming

- **Object.create(null)** - Prevents prototype pollution in embeddings
- **NaN detection** - Skips corrupted embeddings, logs warnings
- **Word filtering** - Excludes JavaScript reserved words (`constructor`, etc.)
- **Magnitude checks** - Verifies non-zero embeddings before calculation

---

## FAQ

### General Questions

**Q: How many notes do I need to train?**  
A: Minimum 50+ tagged notes recommended. More is better. Quality matters too - consistent, meaningful tags improve results.

**Q: Can I use multiple collections?**  
A: Yes! Create as many as needed. Suggestions from all applicable collections are merged automatically.

**Q: Does it work with nested tags?**  
A: Yes, nested tags like `programming/python` work fine. The plugin treats them as single tags.

**Q: Can I use it with existing tags?**  
A: Yes! It learns from your existing tagging patterns and suggests additional relevant tags.

**Q: Does it modify my notes automatically?**  
A: Only if you enable "Auto-tag on save" or use batch operations. Default is manual review via suggestion modal.

### Technical Questions

**Q: What's the difference between Basic and Advanced?**  
A: Basic is faster with broader coverage (40% overlap). Advanced is more precise with stricter filtering (55% threshold + dual filter).

**Q: How does the blacklist auto-removal work?**  
A: Whenever the plugin processes a note (suggestions, auto-tag, batch), it checks for blacklisted tags in frontmatter and removes them automatically.

**Q: Can I export trained classifiers?**  
A: Not currently. Classifiers are stored in plugin data directory. Backup your `.obsidian/plugins/auto-tagger/` folder.

**Q: Does it work offline?**  
A: Yes! All processing is local. No internet connection or external API required.

**Q: What happens if I have duplicate tags?**  
A: The plugin automatically prevents suggesting tags already present in your note.

### Troubleshooting Questions

**Q: Why am I getting warnings in the console?**  
A: "Skipping word 'constructor'" is expected (JavaScript reserved word). Other warnings may indicate training issues - try retraining.

**Q: Suggestions seem random - why?**  
A: Likely insufficient training data or threshold too low. Add more tagged notes (50+) and try threshold 0.3-0.4.

**Q: Can I undo batch operations?**  
A: Use Obsidian's undo feature immediately after. Otherwise, restore from backup or manually review changes via Git if versioned.

**Q: Plugin is slow - how to fix?**  
A: Use folder-scoped collections instead of "all folders". Reduce number of collections. Lower max tags setting.

---

## Support & Contributing

### Getting Help

- **Issues**: [GitHub Issues](https://github.com/canepa/plugin-obsidian-classifier/issues)
- **Discussions**: [GitHub Discussions](https://github.com/canepa/plugin-obsidian-classifier/discussions)
- **Documentation**: [GitHub Wiki](https://github.com/canepa/plugin-obsidian-classifier/wiki)

### Reporting Bugs

Please include:

1. Plugin version (check manifest.json)
2. Obsidian version
3. Operating system
4. Steps to reproduce
5. Console logs (if applicable)

### Feature Requests

Open an issue with:

1. Clear description of desired feature
2. Use case / problem it solves
3. Example workflow (if applicable)

### Contributing

See [CONTRIBUTING.md](https://github.com/canepa/plugin-obsidian-classifier/blob/main/CONTRIBUTING.md) for development setup and guidelines.

---

## License & Credits

**License**: MIT License  
**Author**: Alessandro Canepa ([@canepa](https://github.com/canepa))  
**Repository**: [plugin-obsidian-classifier](https://github.com/canepa/plugin-obsidian-classifier)

Built with the [Obsidian API](https://github.com/obsidianmd/obsidian-api)

---

**Last Updated**: January 2026  
**Plugin Version**: 2.0.11  
**Minimum Obsidian Version**: 0.15.0
