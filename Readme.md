# Auto Tagger Plugin for Obsidian

Automatically suggest and apply tags to your notes using a Naive Bayes classifier trained on your existing tagged notes.

## Features

- 🤖 **Smart Tag Suggestions** - Uses machine learning to suggest relevant tags based on note content
- 🎯 **Customizable Training** - Train on your existing tagged notes with folder filtering
- 📋 **Tag Management** - Whitelist/blacklist tags, view all tags with quick actions
- ⚙️ **Flexible Configuration** - Control which folders to process and how aggressive the tagging should be
- 🔄 **Auto-tagging** - Optionally auto-tag notes when saving
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
- **Folder mode** - Choose which folders to process
- **Include/Exclude folders** - Comma-separated folder paths

#### Tag Filtering
- **Tag whitelist** - Only suggest these tags (leave empty for all)
- **Tag blacklist** - Never suggest or train on these tags
- **All Tags in Classifier** - View all trained tags with quick blacklist actions

#### Classification Parameters
- **Confidence threshold** (0-1) - Minimum confidence for suggestions (default: 0.1)
- **Maximum tags** (1-10) - Max number of tags to suggest per note (default: 5)

#### Auto-Tagging
- **Auto-tag on save** - Automatically apply tags when saving notes

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
├── main.ts              # Main plugin file
├── classifier.ts        # Naive Bayes classifier implementation
├── settings.ts          # Settings tab and interface
├── manifest.json        # Plugin manifest
├── package.json         # NPM dependencies and scripts
├── esbuild.config.mjs   # Build configuration
├── tsconfig.json        # TypeScript configuration
├── deploy.ps1           # Deployment script
└── styles.css           # Plugin styles
```

## How It Works

The plugin uses a **Naive Bayes classifier** to learn patterns from your existing tagged notes:

1. **Training Phase**: Analyzes the content of your tagged notes and learns which words are associated with which tags
2. **Classification Phase**: When you request suggestions, it analyzes the current note's content and calculates probability scores for each tag
3. **Filtering**: Applies whitelist/blacklist and confidence threshold to produce final suggestions
4. **User Review**: Shows suggestions in an interactive modal for you to review and select

## Tips

- Train on at least 20-30 tagged notes for better accuracy
- Use consistent, meaningful tags across your notes
- Regularly retrain the classifier as you add more tagged notes
- Use the whitelist to focus on your most important tags
- Use the blacklist to exclude meta tags like "todo" or "draft"
- Adjust the confidence threshold if you're getting too many or too few suggestions

## Troubleshooting

**Plugin doesn't appear in Obsidian**
- Make sure manifest.json is present and valid
- Restart Obsidian completely
- Check that "Restricted mode" is off

**Training fails or gives no suggestions**
- Ensure you have notes with tags in frontmatter (YAML format)
- Check that folders are not excluded by your settings
- Verify tags aren't all in the blacklist

**File size is too large**
- The built main.js should be around 12-15KB
- If it's much larger, check that external dependencies are properly configured

## License

MIT

## Author

Alessandro Canepa

## Version

1.0.0
