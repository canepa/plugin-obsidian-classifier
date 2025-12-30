import { App, Modal, Notice, Plugin, TFile, TFolder, parseYaml, stringifyYaml } from 'obsidian';
import { NaiveBayesClassifier } from './classifier';
import { AutoTaggerSettings, AutoTaggerSettingTab, DEFAULT_SETTINGS } from './settings';

export default class AutoTaggerPlugin extends Plugin {
  settings: AutoTaggerSettings;
  classifier: NaiveBayesClassifier;

  async onload() {
    await this.loadSettings();
    
    this.classifier = new NaiveBayesClassifier();
    
    // Load saved classifier data
    if (this.settings.classifierData) {
      try {
        this.classifier.import(this.settings.classifierData);
      } catch (e) {
        console.error('Failed to load classifier data:', e);
      }
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
      id: 'tag-current-note',
      name: 'Suggest tags for current note',
      callback: () => this.showTagSuggestions()
    });

    this.addCommand({
      id: 'tag-all-notes',
      name: 'Tag all notes in scope',
      callback: () => this.tagAllNotes()
    });

    this.addCommand({
      id: 'tag-folder',
      name: 'Tag all notes in current folder',
      callback: () => this.tagCurrentFolder()
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
    const notice = new Notice('Training classifier...', 0);
    
    this.classifier.reset();
    
    const files = this.getFilesInScope();
    let trained = 0;
    
    for (const file of files) {
      const { frontmatter, content } = await this.parseFile(file);
      const tags = this.getTagsFromFrontmatter(frontmatter);
      
      if (tags.length > 0) {
        this.classifier.train(content, tags);
        trained++;
      }
    }
    
    // Save classifier data
    this.settings.classifierData = this.classifier.export();
    await this.saveSettings();
    
    notice.hide();
    
    const stats = this.classifier.getStats();
    new Notice(`Trained on ${trained} documents with ${stats.totalTags} unique tags`);
  }

  /**
   * Get tag suggestions for a file
   */
  async getSuggestions(file: TFile): Promise<Array<{tag: string, probability: number}>> {
    const { content } = await this.parseFile(file);
    
    const whitelist = this.settings.whitelist.length > 0 ? this.settings.whitelist : undefined;
    
    return this.classifier.classify(content, whitelist, this.settings.threshold)
      .slice(0, this.settings.maxTags);
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
  async applyTags(file: TFile, newTags: string[]): Promise<void> {
    const { frontmatter, content, raw } = await this.parseFile(file);
    
    // Merge with existing tags
    const existingTags = this.getTagsFromFrontmatter(frontmatter);
    const allTags = [...new Set([...existingTags, ...newTags])];
    
    frontmatter.tags = allTags;
    
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
      await this.applyTags(file, tags);
    }
  }

  /**
   * Tag all notes in scope
   */
  async tagAllNotes(): Promise<void> {
    if (this.classifier.getStats().totalDocs === 0) {
      new Notice('Classifier not trained. Please train first.');
      return;
    }
    
    const files = this.getFilesInScope();
    const notice = new Notice(`Tagging ${files.length} files...`, 0);
    
    let tagged = 0;
    
    for (const file of files) {
      const suggestions = await this.getSuggestions(file);
      
      if (suggestions.length > 0) {
        const tags = suggestions.map(s => s.tag);
        await this.applyTags(file, tags);
        tagged++;
      }
    }
    
    notice.hide();
    new Notice(`Tagged ${tagged} files`);
  }

  /**
   * Tag all notes in current folder
   */
  async tagCurrentFolder(): Promise<void> {
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
    
    const notice = new Notice(`Tagging ${files.length} files in ${folder.name}...`, 0);
    
    let tagged = 0;
    
    for (const f of files) {
      const suggestions = await this.getSuggestions(f);
      
      if (suggestions.length > 0) {
        const tags = suggestions.map(s => s.tag);
        await this.applyTags(f, tags);
        tagged++;
      }
    }
    
    notice.hide();
    new Notice(`Tagged ${tagged} files in ${folder.name}`);
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
  }

  onOpen() {
    const { contentEl } = this;
    
    contentEl.createEl('h2', { text: 'Tag Suggestions' });
    contentEl.createEl('p', { text: `File: ${this.file.basename}` });
    
    if (this.existingTags.length > 0) {
      contentEl.createEl('p', { text: `Existing tags: ${this.existingTags.join(', ')}` });
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
    
    const applyButton = buttonContainer.createEl('button', { text: 'Apply Selected Tags' });
    applyButton.addClass('mod-cta');
    applyButton.addEventListener('click', async () => {
      const tagsToAdd = Array.from(this.selectedTags);
      if (tagsToAdd.length > 0) {
        await this.plugin.applyTags(this.file, tagsToAdd);
        new Notice(`Added ${tagsToAdd.length} tags`);
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