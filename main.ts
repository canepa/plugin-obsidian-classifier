import { App, Modal, Notice, Plugin, TFile, TFolder, parseYaml, stringifyYaml } from 'obsidian';
import { EmbeddingClassifier } from './embedding-classifier';
import { AutoTaggerSettings, AutoTaggerSettingTab, DEFAULT_SETTINGS } from './settings';

export default class AutoTaggerPlugin extends Plugin {
  settings: AutoTaggerSettings;
  classifier: EmbeddingClassifier;

  async onload() {
    console.log('[Auto Tagger] Loading plugin...');
    
    await this.loadSettings();
    
    this.classifier = new EmbeddingClassifier();
    if (this.settings.classifierData) {
      try {
        this.classifier.import(this.settings.classifierData);
        const stats = this.classifier.getStats();
        console.log(`[Auto Tagger] Loaded classifier with ${stats.totalTags} tags trained on ${stats.totalDocs} documents`);
      } catch (e) {
        console.error('[Auto Tagger] Failed to load classifier data:', e);
      }
    } else {
      console.log('[Auto Tagger] No trained classifier found. Use "Train classifier" command to get started.');
    }

    // Add ribbon icon
    this.addRibbonIcon('tag', 'Auto Tagger', () => {
      this.showTagSuggestions();
    });

    // Add commands
    this.addCommand({
      id: 'train-classifier',
      name: 'Train classifier on existing notes',
      callback: () => this.trainClassifier()
    });

    this.addCommand({
      id: 'debug-classifier',
      name: 'Debug classifier (show stats)',
      callback: () => this.debugClassifier()
    });

    this.addCommand({
      id: 'tag-current-note',
      name: 'Suggest tags for current note',
      callback: () => this.showTagSuggestions()
    });

    this.addCommand({
      id: 'auto-tag-current-integrate',
      name: 'Auto-tag current note',
      callback: () => this.autoTagCurrentNote('integrate')
    });

    this.addCommand({
      id: 'tag-all-notes-integrate',
      name: 'Batch tag all notes',
      callback: () => this.tagAllNotes('integrate')
    });

    this.addCommand({
      id: 'tag-folder-integrate',
      name: 'Batch tag folder',
      callback: () => this.tagCurrentFolder('integrate')
    });

    // Auto-tag on save
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (this.settings.autoTagOnSave && file instanceof TFile && file.extension === 'md') {
          if (this.shouldProcessFile(file)) {
            this.autoTagFile(file);
          }
        }
      })
    );

    // Settings tab
    this.addSettingTab(new AutoTaggerSettingTab(this.app, this));
    
    console.log('[Auto Tagger] Plugin loaded successfully');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Check if a file should be processed based on folder settings
   */
  shouldProcessFile(file: TFile): boolean {
    const filePath = file.path;
    
    if (this.settings.folderMode === 'all') {
      return true;
    }
    
    if (this.settings.folderMode === 'include') {
      return this.settings.includeFolders.some(folder => 
        filePath.startsWith(folder + '/') || filePath.startsWith(folder + '\\')
      );
    }
    
    if (this.settings.folderMode === 'exclude') {
      return !this.settings.excludeFolders.some(folder => 
        filePath.startsWith(folder + '/') || filePath.startsWith(folder + '\\')
      );
    }
    
    return true;
  }

  /**
   * Get all files in scope
   */
  getFilesInScope(): TFile[] {
    return this.app.vault.getMarkdownFiles().filter(file => this.shouldProcessFile(file));
  }

  /**
   * Extract frontmatter and content from a file
   */
  async parseFile(file: TFile): Promise<{ frontmatter: any, content: string, raw: string }> {
    const raw = await this.app.vault.read(file);
    
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    
    if (match) {
      try {
        const frontmatter = parseYaml(match[1]) || {};
        return { frontmatter, content: match[2], raw };
      } catch (e) {
        return { frontmatter: {}, content: raw, raw };
      }
    }
    
    return { frontmatter: {}, content: raw, raw };
  }

  /**
   * Get tags from frontmatter, filtering blacklist
   */
  getTagsFromFrontmatter(frontmatter: any): string[] {
    let tags: string[] = [];
    
    if (Array.isArray(frontmatter.tags)) {
      tags = frontmatter.tags.map((t: any) => String(t).toLowerCase());
    } else if (typeof frontmatter.tags === 'string') {
      tags = [frontmatter.tags.toLowerCase()];
    }
    
    // Filter out blacklisted tags
    return tags.filter(tag => !this.settings.blacklist.includes(tag));
  }

  /**
   * Train the classifier on existing tagged notes
   */
  async trainClassifier(): Promise<void> {
    const notice = new Notice('Training embedding classifier on tagged notes...', 0);
    
    this.classifier.reset();
    
    const files = this.getFilesInScope();
    const taggedFiles: TFile[] = [];
    
    // Train on explicitly tagged notes
    for (const file of files) {
      const { frontmatter, content } = await this.parseFile(file);
      const tags = this.getTagsFromFrontmatter(frontmatter);
      
      if (tags.length > 0) {
        await this.classifier.train(content, tags);
        taggedFiles.push(file);
      }
    }
    
    // Finalize training (average and normalize embeddings)
    await this.classifier.finalizeTraining();
    
    console.log(`[Training] Trained on ${taggedFiles.length} tagged notes`);
    
    // Save classifier data
    this.settings.classifierData = this.classifier.export();
    await this.saveSettings();
    
    notice.hide();
    
    const stats = this.classifier.getStats();
    const trainingMsg = `Training complete: ${taggedFiles.length} notes (${stats.totalTags} unique tags)`;
    
    console.log(`[EmbeddingClassifier] ${trainingMsg}`);
    new Notice(trainingMsg);
  }

  /**
   * Debug classifier information
   */
  debugClassifier(): void {
    const stats = this.classifier.getStats();
    const file = this.app.workspace.getActiveFile();
    
    // Get all known tags from the classifier
    const knownTags = this.classifier.getAllTags();
    
    let message = `Classifier Stats:\n`;
    message += `- Trained on: ${stats.totalDocs} documents\n`;
    message += `- Unique tags: ${stats.totalTags}\n`;
    message += `- Known tags: ${knownTags.join(', ')}\n`;
    message += `- Threshold: ${this.settings.threshold}\n`;
    message += `- Max tags: ${this.settings.maxTags}\n`;
    message += `- Whitelist: ${this.settings.whitelist.length > 0 ? this.settings.whitelist.join(', ') : 'none'}\n`;
    message += `- Blacklist: ${this.settings.blacklist.length > 0 ? this.settings.blacklist.join(', ') : 'none'}\n`;
    
    if (file) {
      message += `\nCurrent file: ${file.basename}\n`;
      message += `Open the console (Ctrl+Shift+I) to see detailed classification logs.`;
    }
    
    console.log(message);
    const exportedData = this.classifier.export();
    console.log('Tag counts:', exportedData.tagDocCounts);
    
    new Notice(message, 10000);
  }

  /**
   * Get tag suggestions for a file
   */
  async getSuggestions(file: TFile): Promise<Array<{tag: string, probability: number}>> {
    const { frontmatter, content } = await this.parseFile(file);
    const existingTags = this.getTagsFromFrontmatter(frontmatter);
    
    const whitelist = this.settings.whitelist.length > 0 ? this.settings.whitelist : undefined;
    
    return await this.classifier.classify(
      content, 
      whitelist, 
      this.settings.threshold, 
      this.settings.maxTags,
      existingTags
    );
  }

  /**
   * Show tag suggestions modal for current note
   */
  async showTagSuggestions(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    
    if (!file) {
      new Notice('No active file');
      return;
    }
    
    if (this.classifier.getStats().totalDocs === 0) {
      new Notice('Classifier not trained. Please train first.');
      return;
    }
    
    const suggestions = await this.getSuggestions(file);
    const { frontmatter } = await this.parseFile(file);
    const existingTags = this.getTagsFromFrontmatter(frontmatter);
    
    new TagSuggestionModal(this.app, this, file, suggestions, existingTags).open();
  }

  /**
   * Apply tags to a file
   */
  async applyTags(file: TFile, newTags: string[], mode: 'integrate' | 'overwrite' = 'integrate'): Promise<void> {
    const { frontmatter, content, raw } = await this.parseFile(file);
    
    let finalTags: string[];
    
    if (mode === 'overwrite') {
      // Replace existing tags with new ones
      finalTags = [...new Set(newTags)];
    } else {
      // Merge with existing tags and remove blacklisted tags
      const existingTags = this.getTagsFromFrontmatter(frontmatter);
      
      // Filter out blacklisted tags from existing tags
      const nonBlacklistedExisting = existingTags.filter(tag => 
        !this.settings.blacklist.some(b => b.toLowerCase() === tag.toLowerCase())
      );
      
      finalTags = [...new Set([...nonBlacklistedExisting, ...newTags])];
    }
    
    frontmatter.tags = finalTags;
    
    // Rebuild file content
    const newFrontmatter = stringifyYaml(frontmatter).trim();
    const newContent = `---\n${newFrontmatter}\n---\n${content}`;
    
    await this.app.vault.modify(file, newContent);
  }

  /**
   * Auto-tag a file silently
   */
  async autoTagFile(file: TFile): Promise<void> {
    if (this.classifier.getStats().totalDocs === 0) return;
    
    const suggestions = await this.getSuggestions(file);
    
    if (suggestions.length > 0) {
      const tags = suggestions.map(s => s.tag);
      await this.applyTags(file, tags, 'integrate');
    }
  }

  /**
   * Auto-tag current note with mode selection
   */
  async autoTagCurrentNote(mode: 'integrate' | 'overwrite'): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    
    if (!file) {
      new Notice('No active file');
      return;
    }
    
    if (this.classifier.getStats().totalDocs === 0) {
      new Notice('Classifier not trained. Please train first.');
      return;
    }
    
    const suggestions = await this.getSuggestions(file);
    
    if (suggestions.length === 0) {
      new Notice('No tag suggestions found.');
      return;
    }
    
    const tags = suggestions.map(s => s.tag);
    const modeText = mode === 'overwrite' ? 'replaced with' : 'added (blacklisted tags removed)';
    
    await this.applyTags(file, tags, mode);
    new Notice(`${tags.length} tags ${modeText}`);
  }

  /**
   * Tag all notes in scope
   */
  async tagAllNotes(mode: 'integrate' | 'overwrite' = 'integrate'): Promise<void> {
    if (this.classifier.getStats().totalDocs === 0) {
      new Notice('Classifier not trained. Please train first.');
      return;
    }
    
    const files = this.getFilesInScope();
    const modeText = mode === 'overwrite' ? 'Overwriting' : 'Integrating';
    const notice = new Notice(`${modeText} tags for ${files.length} files...`, 0);
    
    let tagged = 0;
    
    for (const file of files) {
      const suggestions = await this.getSuggestions(file);
      
      if (suggestions.length > 0) {
        const tags = suggestions.map(s => s.tag);
        await this.applyTags(file, tags, mode);
        tagged++;
      }
    }
    
    notice.hide();
    const actionText = mode === 'overwrite' ? 'overwritten' : 'updated (blacklisted tags removed)';
    new Notice(`${tagged} files ${actionText}`);
  }

  /**
   * Tag all notes in current folder
   */
  async tagCurrentFolder(mode: 'integrate' | 'overwrite' = 'integrate'): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    
    if (!file) {
      new Notice('No active file');
      return;
    }
    
    if (this.classifier.getStats().totalDocs === 0) {
      new Notice('Classifier not trained. Please train first.');
      return;
    }
    
    const folder = file.parent;
    if (!folder) {
      new Notice('Cannot determine folder');
      return;
    }
    
    const files = this.app.vault.getMarkdownFiles()
      .filter(f => f.parent?.path === folder.path);
    
    const modeText = mode === 'overwrite' ? 'Overwriting' : 'Integrating';
    const notice = new Notice(`${modeText} tags for ${files.length} files in ${folder.name}...`, 0);
    
    let tagged = 0;
    
    for (const f of files) {
      const suggestions = await this.getSuggestions(f);
      
      if (suggestions.length > 0) {
        const tags = suggestions.map(s => s.tag);
        await this.applyTags(f, tags, mode);
        tagged++;
      }
    }
    
    notice.hide();
    const actionText = mode === 'overwrite' ? 'overwritten' : 'updated (blacklisted tags removed)';
    new Notice(`${tagged} files ${actionText} in ${folder.name}`);
  }

  onunload() {
    // Save classifier on unload
    if (this.classifier.getStats().totalDocs > 0) {
      this.settings.classifierData = this.classifier.export();
      this.saveSettings();
    }
  }
}

/**
 * Modal for showing and selecting tag suggestions
 */
class TagSuggestionModal extends Modal {
  plugin: AutoTaggerPlugin;
  file: TFile;
  suggestions: Array<{tag: string, probability: number}>;
  existingTags: string[];
  selectedTags: Set<string>;
  blacklistedTags: string[];

  constructor(
    app: App, 
    plugin: AutoTaggerPlugin, 
    file: TFile, 
    suggestions: Array<{tag: string, probability: number}>,
    existingTags: string[]
  ) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.suggestions = suggestions;
    this.existingTags = existingTags;
    this.selectedTags = new Set(suggestions.map(s => s.tag));
    
    // Find blacklisted tags in existing tags
    this.blacklistedTags = existingTags.filter(tag => 
      plugin.settings.blacklist.some(b => b.toLowerCase() === tag.toLowerCase())
    );
  }

  onOpen() {
    const { contentEl } = this;
    
    contentEl.createEl('h2', { text: 'Tag Suggestions' });
    contentEl.createEl('p', { text: `File: ${this.file.basename}` });
    
    if (this.existingTags.length > 0) {
      contentEl.createEl('p', { text: `Existing tags: ${this.existingTags.join(', ')}` });
    }
    
    // Show warning about blacklisted tags that will be removed
    if (this.blacklistedTags.length > 0) {
      const warningEl = contentEl.createDiv({ cls: 'mod-warning' });
      warningEl.style.padding = '10px';
      warningEl.style.marginBottom = '10px';
      warningEl.style.backgroundColor = '#ffd70020';
      warningEl.style.border = '1px solid #ffd700';
      warningEl.style.borderRadius = '4px';
      warningEl.createEl('p', { 
        text: `⚠️ Blacklisted tags will be removed: ${this.blacklistedTags.join(', ')}` 
      });
    }
    
    if (this.suggestions.length === 0) {
      contentEl.createEl('p', { text: 'No tag suggestions found.' });
      return;
    }
    
    const list = contentEl.createEl('div', { cls: 'tag-suggestions-list' });
    
    for (const suggestion of this.suggestions) {
      const item = list.createEl('div', { cls: 'tag-suggestion-item' });
      
      const checkbox = item.createEl('input', { type: 'checkbox' });
      checkbox.checked = this.selectedTags.has(suggestion.tag);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selectedTags.add(suggestion.tag);
        } else {
          this.selectedTags.delete(suggestion.tag);
        }
      });
      
      const label = item.createEl('label');
      label.textContent = `${suggestion.tag} (${(suggestion.probability * 100).toFixed(1)}%)`;
      
      // Skip if already exists
      if (this.existingTags.includes(suggestion.tag)) {
        checkbox.disabled = true;
        checkbox.checked = false;
        label.style.textDecoration = 'line-through';
        label.style.opacity = '0.5';
        this.selectedTags.delete(suggestion.tag);
      }
    }
    
    const buttonContainer = contentEl.createEl('div', { cls: 'tag-suggestion-buttons' });
    
    const addButton = buttonContainer.createEl('button', { text: 'Add tags' });
    addButton.addClass('mod-cta');
    addButton.addEventListener('click', async () => {
      const tagsToAdd = Array.from(this.selectedTags);
      if (tagsToAdd.length > 0 || this.blacklistedTags.length > 0) {
        await this.plugin.applyTags(this.file, tagsToAdd, 'integrate');
        const messages = [];
        if (tagsToAdd.length > 0) {
          messages.push(`Added ${tagsToAdd.length} tags`);
        }
        if (this.blacklistedTags.length > 0) {
          messages.push(`removed ${this.blacklistedTags.length} blacklisted tags`);
        }
        new Notice(messages.join(', '));
      }
      this.close();
    });
    
    const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}