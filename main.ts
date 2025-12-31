import { App, Modal, Notice, Plugin, TFile, TFolder, parseYaml, stringifyYaml } from 'obsidian';
import { EmbeddingClassifier } from './embedding-classifier';
import { AutoTaggerSettings, AutoTaggerSettingTab, DEFAULT_SETTINGS, migrateSettings, Collection } from './settings';

export default class AutoTaggerPlugin extends Plugin {
  settings: AutoTaggerSettings;
  classifiers: Map<string, EmbeddingClassifier> = new Map();

  private debug(...args: any[]) {
    if (this.settings?.debugToConsole) {
      console.log(...args);
    }
  }

  async onload() {
    console.log('[Auto Tagger] Loading plugin...');
    
    await this.loadSettings();
    
    // Load all collection classifiers
    for (const collection of this.settings.collections) {
      if (collection.classifierData) {
        const classifier = new EmbeddingClassifier();
        classifier.setDebugEnabled(this.settings.debugToConsole);
        try {
          classifier.import(collection.classifierData);
          this.classifiers.set(collection.id, classifier);
          const stats = classifier.getStats();
          this.debug(`[Auto Tagger] Loaded classifier for "${collection.name}" with ${stats.totalTags} tags trained on ${stats.totalDocs} documents`);
        } catch (e) {
          console.error(`[Auto Tagger] Failed to load classifier for "${collection.name}":`, e);
        }
      }
    }
    
    if (this.settings.collections.length === 0) {
      this.debug('[Auto Tagger] No collections found. Create one in settings to get started.');
    }

    // Add ribbon icon
    this.addRibbonIcon('tag', 'Auto Tagger: Suggest tags', () => {
      this.showTagSuggestions();
    });

    // Add commands
    this.addCommand({
      id: 'train-classifier',
      name: 'Train classifier (select collection or all)',
      callback: () => this.showCollectionSelector('train')
    });

    this.addCommand({
      id: 'debug-classifier',
      name: 'Debug classifier stats (select collection or all)',
      callback: () => this.showCollectionSelector('debug')
    });

    this.addCommand({
      id: 'tag-current-note',
      name: 'Suggest tags for current note',
      callback: () => this.showTagSuggestions()
    });

    this.addCommand({
      id: 'auto-tag-current-integrate',
      name: 'Auto-tag current note (integrate mode)',
      callback: () => this.autoTagCurrentNote('integrate')
    });

    this.addCommand({
      id: 'tag-all-notes-integrate',
      name: 'Batch tag all notes (from all collections)',
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
    
    this.debug('[Auto Tagger] Plugin loaded successfully');
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data ? migrateSettings(data) : DEFAULT_SETTINGS);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Get collections that apply to a given file
   */
  getApplicableCollections(file: TFile): Collection[] {
    return this.settings.collections.filter(collection => {
      if (!collection.enabled) return false;
      return this.shouldProcessFileForCollection(file, collection);
    });
  }

  /**
   * Check if a file should be processed for a specific collection
   */
  shouldProcessFileForCollection(file: TFile, collection: Collection): boolean {
    const filePath = file.path;
    
    if (collection.folderMode === 'all') {
      return true;
    }
    
    if (collection.folderMode === 'include') {
      return collection.includeFolders.some(folder => 
        filePath.startsWith(folder + '/') || filePath.startsWith(folder + '\\')
      );
    }
    
    if (collection.folderMode === 'exclude') {
      return !collection.excludeFolders.some(folder => 
        filePath.startsWith(folder + '/') || filePath.startsWith(folder + '\\')
      );
    }
    
    return true;
  }

  /**
   * Get all files in scope for a collection
   */
  getFilesInScopeForCollection(collection: Collection): TFile[] {
    return this.app.vault.getMarkdownFiles().filter(file => 
      this.shouldProcessFileForCollection(file, collection)
    );
  }

  /**
   * Legacy method for backward compatibility
   */
  shouldProcessFile(file: TFile): boolean {
    // Check if file applies to any enabled collection
    return this.getApplicableCollections(file).length > 0;
  }

  /**
   * Legacy method for backward compatibility
   */
  getFilesInScope(): TFile[] {
    // Get all files that belong to at least one enabled collection
    const filesSet = new Set<TFile>();
    for (const collection of this.settings.collections) {
      if (collection.enabled) {
        const files = this.getFilesInScopeForCollection(collection);
        files.forEach(f => filesSet.add(f));
      }
    }
    return Array.from(filesSet);
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
   * Get tags from frontmatter, filtering blacklist for a specific collection
   */
  getTagsFromFrontmatter(frontmatter: any, collection: Collection): string[] {
    let tags: string[] = [];
    
    if (Array.isArray(frontmatter.tags)) {
      tags = frontmatter.tags.map((t: any) => String(t).toLowerCase());
    } else if (typeof frontmatter.tags === 'string') {
      tags = [frontmatter.tags.toLowerCase()];
    }
    
    // Filter out blacklisted tags
    return tags.filter(tag => !collection.blacklist.includes(tag));
  }

  /**
   * Train a specific collection's classifier
   */
  async trainCollection(collectionId: string): Promise<void> {
    const collection = this.settings.collections.find(c => c.id === collectionId);
    if (!collection) {
      new Notice('Collection not found');
      return;
    }

    const notice = new Notice(`Training classifier for "${collection.name}"...`, 0);
    
    const classifier = new EmbeddingClassifier();
    classifier.setDebugEnabled(this.settings.debugToConsole);
    const files = this.getFilesInScopeForCollection(collection);
    const taggedFiles: TFile[] = [];
    
    // Train on explicitly tagged notes
    for (const file of files) {
      const { frontmatter, content } = await this.parseFile(file);
      const tags = this.getTagsFromFrontmatter(frontmatter, collection);
      
      if (tags.length > 0) {
        await classifier.train(content, tags);
        taggedFiles.push(file);
      }
    }
    
    // Finalize training
    await classifier.finalizeTraining();
    
    this.debug(`[Training] Collection "${collection.name}": trained on ${taggedFiles.length} tagged notes`);
    
    // Save classifier data
    collection.classifierData = classifier.export();
    collection.lastTrained = Date.now();
    this.classifiers.set(collectionId, classifier);
    await this.saveSettings();
    
    notice.hide();
    
    const stats = classifier.getStats();
    const trainingMsg = `Training complete: ${taggedFiles.length} notes (${stats.totalTags} unique tags)`;
    
    this.debug(`[Collection: ${collection.name}] ${trainingMsg}`);
    new Notice(trainingMsg);
  }

  /**
   * Train all enabled collections
   */
  async trainAllCollections(): Promise<void> {
    const enabledCollections = this.settings.collections.filter(c => c.enabled);
    
    if (enabledCollections.length === 0) {
      new Notice('No enabled collections to train.');
      return;
    }

    const notice = new Notice(`Training ${enabledCollections.length} collections...`, 0);
    let successCount = 0;
    
    for (const collection of enabledCollections) {
      try {
        await this.trainCollection(collection.id);
        successCount++;
      } catch (e) {
        console.error(`Failed to train collection "${collection.name}":`, e);
      }
    }
    
    notice.hide();
    new Notice(`Training complete: ${successCount}/${enabledCollections.length} collections trained successfully`);
  }

  /**
   * Legacy method - now trains first collection if available
   */
  async trainClassifier(): Promise<void> {
    if (this.settings.collections.length === 0) {
      new Notice('No collections found. Create one in settings first.');
      return;
    }
    await this.trainCollection(this.settings.collections[0].id);
  }

  /**
   * Show collection selector for operations
   */
  showCollectionSelector(operation: 'train' | 'debug'): void {
    const enabledCollections = this.settings.collections.filter(c => c.enabled);
    
    if (enabledCollections.length === 0) {
      new Notice('No enabled collections. Create one in settings first.');
      return;
    }
    
    // Always show selector with "All Collections" option
    new CollectionSelectorModal(
      this.app, 
      enabledCollections, 
      (collectionId) => {
        if (collectionId === 'ALL') {
          // Execute for all collections
          if (operation === 'train') {
            this.trainAllCollections();
          } else {
            this.debugAllCollections();
          }
        } else {
          // Execute for single collection
          if (operation === 'train') {
            this.trainCollection(collectionId);
          } else {
            this.debugCollection(collectionId);
          }
        }
      },
      true // Show "All Collections" option
    ).open();
  }

  /**
   * Debug classifier information for a specific collection
   */
  debugCollection(collectionId: string): void {
    const collection = this.settings.collections.find(c => c.id === collectionId);
    if (!collection) {
      new Notice('Collection not found');
      return;
    }

    const classifier = this.classifiers.get(collectionId);
    if (!classifier) {
      new Notice(`Collection "${collection.name}" has no trained classifier`);
      return;
    }

    const stats = classifier.getStats();
    const knownTags = classifier.getAllTags();
    
    let message = `Collection: ${collection.name}\n\n`;
    message += `Classifier Stats:\n`;
    message += `- Trained on: ${stats.totalDocs} documents\n`;
    message += `- Unique tags: ${stats.totalTags}\n`;
    message += `- Known tags: ${knownTags.join(', ')}\n`;
    message += `\nScope: ${collection.folderMode}`;
    
    if (collection.folderMode === 'include') {
      message += `\nIncluded folders: ${collection.includeFolders.join(', ')}`;
    } else if (collection.folderMode === 'exclude') {
      message += `\nExcluded folders: ${collection.excludeFolders.join(', ')}`;
    }
    
    new Notice(message, 10000);
    this.debug(message);
  }

  /**
   * Debug all enabled collections
   */
  debugAllCollections(): void {
    const enabledCollections = this.settings.collections.filter(c => c.enabled);
    
    if (enabledCollections.length === 0) {
      new Notice('No enabled collections.');
      return;
    }

    let message = `=== All Collections Debug Info ===\n\n`;
    
    for (const collection of enabledCollections) {
      const classifier = this.classifiers.get(collection.id);
      message += `📁 ${collection.name} (${collection.enabled ? 'enabled' : 'disabled'})\n`;
      
      if (classifier) {
        const stats = classifier.getStats();
        message += `   Tags: ${stats.totalTags} | Docs: ${stats.totalDocs}\n`;
        message += `   Scope: ${collection.folderMode}`;
        
        if (collection.folderMode === 'include') {
          message += ` (${collection.includeFolders.join(', ')})`;
        } else if (collection.folderMode === 'exclude') {
          message += ` (excluded: ${collection.excludeFolders.join(', ')})`;
        }
        message += `\n`;
        
        if (collection.lastTrained) {
          message += `   Last trained: ${new Date(collection.lastTrained).toLocaleString()}\n`;
        }
      } else {
        message += `   Not trained\n`;
      }
      message += `\n`;
    }
    
    this.debug(message);
    new Notice(message, 15000);
  }

  /**
   * onst classifier = this.classifiers.get(collectionId);
    if (!classifier) {
      new Notice(`Collection "${collection.name}" has no trained classifier`);
      return;
    }

    const stats = classifier.getStats();
    const knownTags = classifier.getAllTags();
    
    let message = `Collection: ${collection.name}\n\n`;
    message += `Classifier Stats:\n`;
    message += `- Trained on: ${stats.totalDocs} documents\n`;
    message += `- Unique tags: ${stats.totalTags}\n`;
    message += `- Known tags: ${knownTags.join(', ')}\n`;
    message += `\nScope: ${collection.folderMode}`;
    
    if (collection.folderMode === 'include') {
      message += `\nIncluded folders: ${collection.includeFolders.join(', ')}`;
    } else if (collection.folderMode === 'exclude') {
      message += `\nExcluded folders: ${collection.excludeFolders.join(', ')}`;
    }
    
    new Notice(message, 10000);
    console.log(message);
  }

  /**
   * Legacy method - debug first collection
   */
  debugClassifier(): void {
    if (this.settings.collections.length === 0) {
      new Notice('No collections found. Create one in settings first.');
      return;
    }
    this.debugCollection(this.settings.collections[0].id);
  }

  /**
   * Get tag suggestions for a file from all applicable collections
   */
  async getSuggestions(file: TFile): Promise<Array<{tag: string, probability: number, collectionName: string}>> {
    const applicableCollections = this.getApplicableCollections(file);
    
    if (applicableCollections.length === 0) {
      return [];
    }

    const { frontmatter, content } = await this.parseFile(file);
    const tagScores = new Map<string, {probability: number, collectionName: string}>();
    
    // Get suggestions from each applicable collection
    for (const collection of applicableCollections) {
      const classifier = this.classifiers.get(collection.id);
      if (!classifier || classifier.getStats().totalDocs === 0) {
        continue;
      }

      const existingTags = this.getTagsFromFrontmatter(frontmatter, collection);
      const whitelist = collection.whitelist.length > 0 ? collection.whitelist : undefined;
      
      const suggestions = await classifier.classify(
        content,
        whitelist,
        collection.threshold,
        collection.maxTags,
        existingTags
      );
      
      // Merge suggestions - keep highest probability for each tag
      for (const sug of suggestions) {
        const existing = tagScores.get(sug.tag);
        if (!existing || sug.probability > existing.probability) {
          tagScores.set(sug.tag, {
            probability: sug.probability,
            collectionName: collection.name
          });
        }
      }
    }
    
    // Convert to array and sort by probability
    return Array.from(tagScores.entries())
      .map(([tag, data]) => ({ tag, ...data }))
      .sort((a, b) => b.probability - a.probability);
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
    
    const applicableCollections = this.getApplicableCollections(file);
    if (applicableCollections.length === 0) {
      new Notice('⚠️ File is not in scope of any enabled collection.');
      return;
    }
    
    const hasTrainedClassifier = applicableCollections.some(c => {
      const classifier = this.classifiers.get(c.id);
      return classifier && classifier.getStats().totalDocs > 0;
    });
    
    if (!hasTrainedClassifier) {
      new Notice('No trained classifiers for this file. Please train collections first.');
      return;
    }
    
    const suggestions = await this.getSuggestions(file);
    const { frontmatter } = await this.parseFile(file);
    
    // Collect all existing tags (using first collection's blacklist for compatibility)
    const firstCollection = applicableCollections[0];
    const existingTags = this.getTagsFromFrontmatter(frontmatter, firstCollection);
    
    new TagSuggestionModal(this.app, this, file, suggestions, existingTags).open();
  }

  /**
   * Apply tags to a file (collection-aware)
   */
  async applyTags(file: TFile, newTags: string[], mode: 'integrate' | 'overwrite' = 'integrate'): Promise<void> {
    const { frontmatter, content, raw } = await this.parseFile(file);
    const applicableCollections = this.getApplicableCollections(file);
    
    let finalTags: string[];
    
    if (mode === 'overwrite') {
      finalTags = [...new Set(newTags)];
    } else {
      // Get existing tags and filter out blacklisted ones from any applicable collection
      let existingTags: string[] = [];
      if (Array.isArray(frontmatter.tags)) {
        existingTags = frontmatter.tags.map((t: any) => String(t).toLowerCase());
      } else if (typeof frontmatter.tags === 'string') {
        existingTags = [frontmatter.tags.toLowerCase()];
      }
      
      // Collect all blacklisted tags from applicable collections
      const allBlacklist = new Set<string>();
      for (const collection of applicableCollections) {
        collection.blacklist.forEach(tag => allBlacklist.add(tag));
      }
      
      // Filter out blacklisted tags
      const filteredExisting = existingTags.filter(tag => !allBlacklist.has(tag));
      
      // Merge and deduplicate
      finalTags = [...new Set([...filteredExisting, ...newTags])];
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
    
    const applicableCollections = this.getApplicableCollections(file);
    if (applicableCollections.length === 0) {
      new Notice('⚠️ File is not in scope of any enabled collection.');
      return;
    }
    
    const hasTrainedClassifier = applicableCollections.some(c => {
      const classifier = this.classifiers.get(c.id);
      return classifier && classifier.getStats().totalDocs > 0;
    });
    
    if (!hasTrainedClassifier) {
      new Notice('No trained classifiers for this file. Please train collections first.');
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
    if (this.classifiers.size === 0) {
      new Notice('No trained classifiers. Please train collections first.');
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
    
    if (this.classifiers.size === 0) {
      new Notice('No trained classifiers. Please train collections first.');
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
    // Save all classifier data on unload
    for (const collection of this.settings.collections) {
      const classifier = this.classifiers.get(collection.id);
      if (classifier && classifier.getStats().totalDocs > 0) {
        collection.classifierData = classifier.export();
      }
    }
    this.saveSettings();
  }
}

/**
 * Modal for showing and selecting tag suggestions
 */
class TagSuggestionModal extends Modal {
  plugin: AutoTaggerPlugin;
  file: TFile;
  suggestions: Array<{tag: string, probability: number, collectionName?: string}>;
  existingTags: string[];
  selectedTags: Set<string>;
  blacklistedTags: string[];

  constructor(
    app: App, 
    plugin: AutoTaggerPlugin, 
    file: TFile, 
    suggestions: Array<{tag: string, probability: number, collectionName?: string}>,
    existingTags: string[]
  ) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.suggestions = suggestions;
    this.existingTags = existingTags;
    this.selectedTags = new Set(suggestions.map(s => s.tag));
    
    // Find blacklisted tags in existing tags (from all applicable collections)
    const applicableCollections = plugin.getApplicableCollections(file);
    const allBlacklist = new Set<string>();
    for (const collection of applicableCollections) {
      collection.blacklist.forEach(tag => allBlacklist.add(tag));
    }
    
    this.blacklistedTags = existingTags.filter(tag => allBlacklist.has(tag.toLowerCase()));
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
      const warningEl = contentEl.createDiv({ cls: 'auto-tagger-warning' });
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
      const labelText = `${suggestion.tag} (${(suggestion.probability * 100).toFixed(1)}%)`;
      const collectionInfo = suggestion.collectionName ? ` [${suggestion.collectionName}]` : '';
      label.textContent = labelText + collectionInfo;
      
      // Skip if already exists
      if (this.existingTags.includes(suggestion.tag)) {
        checkbox.disabled = true;
        checkbox.checked = false;
        item.addClass('auto-tagger-tag-item excluded');
        this.selectedTags.delete(suggestion.tag);
      } else if (suggestion.collectionName) {
        item.addClass('auto-tagger-tag-item');
      }
    }
    
    const buttonContainer = contentEl.createEl('div', { cls: 'tag-suggestion-buttons' });
    
    const addButton = buttonContainer.createEl('button', { text: 'Add tags' });
    addButton.addClass('mod-cta');
    addButton.addEventListener('click', async () => {
      const tagsToAdd = Array.from(this.selectedTags);
      if (tagsToAdd.length > 0 || this.blacklistedTags.length > 0) {
        await this.plugin.applyTags(this.file, tagsToAdd, 'integrate');
        const messages: string[] = [];
        if (tagsToAdd.length > 0) {
          messages.push(`added ${tagsToAdd.length} tags`);
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

/**
 * Modal for selecting a collection
 */
class CollectionSelectorModal extends Modal {
  collections: Collection[];
  onSelect: (collectionId: string) => void;
  showAllOption: boolean;

  constructor(
    app: App, 
    collections: Collection[], 
    onSelect: (collectionId: string) => void,
    showAllOption: boolean = false
  ) {
    super(app);
    this.collections = collections;
    this.onSelect = onSelect;
    this.showAllOption = showAllOption;
  }

  onOpen() {
    const { contentEl } = this;
    
    contentEl.createEl('h2', { text: 'Select Collection' });
    contentEl.createEl('p', { text: 'Choose which collection to use:' });
    
    const listContainer = contentEl.createEl('div', { cls: 'auto-tagger-collection-list' });
    
    // Add "All Collections" option if enabled
    if (this.showAllOption && this.collections.length > 1) {
      const allItem = listContainer.createEl('div', { cls: 'auto-tagger-collection-item-all' });
      
      allItem.addEventListener('click', () => {
        this.onSelect('ALL');
        this.close();
      });
      
      const allTitle = allItem.createEl('div', { cls: 'setting-item-name auto-tagger-collection-title' });
      allTitle.textContent = '🌐 All Collections';
      
      const allDesc = allItem.createEl('div', { cls: 'setting-item-description' });
      allDesc.textContent = `Execute operation on all ${this.collections.length} enabled collections`;
    }
    
    // Add individual collections
    for (const collection of this.collections) {
      const item = listContainer.createEl('div', { cls: 'auto-tagger-collection-item' });
      
      item.addEventListener('click', () => {
        this.onSelect(collection.id);
        this.close();
      });
      
      item.createEl('div', { text: collection.name, cls: 'setting-item-name' });
      
      const desc = item.createEl('div', { cls: 'setting-item-description' });
      desc.textContent = `Scope: ${collection.folderMode}`;
      
      if (collection.lastTrained) {
        const date = new Date(collection.lastTrained).toLocaleString();
        desc.textContent += ` | Last trained: ${date}`;
      } else {
        desc.textContent += ' | Not trained yet';
      }
    }
    
    const buttonContainer = contentEl.createEl('div');
    buttonContainer.style.marginTop = '20px';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    
    const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}