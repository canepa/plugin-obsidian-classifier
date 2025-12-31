# Release Instructions

## Initial Setup (One Time)

1. **Enable workflow permissions** on GitHub:
   - Go to your repository on GitHub
   - Navigate to **Settings** → **Actions** → **General**
   - Scroll to **Workflow permissions**
   - Select **Read and write permissions**
   - Click **Save**

## Creating a New Release

1. **Update version** in these files:
   - `manifest.json` → `version` field
   - `package.json` → `version` field

2. **Commit your changes**:
   ```bash
   git add .
   git commit -m "Release version X.Y.Z"
   git push origin main
   ```

3. **Create and push a tag** (must match the version in manifest.json):
   ```bash
   git tag -a 2.0.0 -m "2.0.0"
   git push origin 2.0.0
   ```

4. **Monitor the workflow**:
   - Go to your repository on GitHub
   - Click the **Actions** tab
   - Wait for the workflow to complete

5. **Publish the release**:
   - Go to **Releases** (right sidebar)
   - Click **Edit** on the draft release
   - Add release notes describing changes
   - Click **Publish release**

## Release Notes Template

```markdown
## What's New in X.Y.Z

### Features
- 

### Improvements
- 

### Bug Fixes
- 

### Breaking Changes
- 
```

## Current Version

Version: **2.0.0** (ready for first release with collections!)

### Release Notes for 2.0.0

```markdown
## What's New in 2.0.0

### Major Features
- **Collection-Based Architecture**: Organize notes with multiple specialized classifiers
- **Multi-Collection Workflow**: Each collection has independent scope, filters, and trained classifier
- **Batch Operations**: "All Collections" option for training and debugging multiple collections at once
- **Tag Aggregation**: Automatically merge suggestions from all applicable collections
- **Per-Collection Configuration**: Individual threshold, maxTags, whitelist/blacklist per collection

### Improvements
- Enhanced settings UI with collection management
- Quick start guide in settings
- Better command descriptions showing collection support
- Debug to console toggle for troubleshooting
- Collection duplication for easy setup
- Live header updates when renaming collections

### Breaking Changes
- Settings automatically migrate from v1.x single-classifier format to collections
- Old "Default Collection" created automatically from previous settings
```
