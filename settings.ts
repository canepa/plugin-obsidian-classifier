import { App, FuzzySuggestModal, Plugin, PluginSettingTab, Setting, Notice, Modal, TFile, requestUrl } from 'obsidian';
import type { EmbeddingClassifierData, EmbeddingClassifier } from './embedding-classifier';
import { readDictionaryRaw } from './dictionary-utils';

/**
 * Confirmation modal for destructive actions
 */
class ConfirmModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private message: string,
    private onConfirm: () => void | Promise<void>
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    contentEl.createEl('h2', { text: this.title });
    contentEl.createEl('p', { text: this.message });
    
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    
    const confirmButton = buttonContainer.createEl('button', { 
      text: 'Confirm',
      cls: 'mod-warning'
    });
    confirmButton.addEventListener('click', () => {
      confirmButton.disabled = true;
      this.close();
      void this.onConfirm();
    });
    
    const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => {
      this.close();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Vault file picker for dictionary files (.json and .md).
 */
class VaultDictionaryPickerModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private onChoose: (file: TFile) => void) {
    super(app);
    this.setPlaceholder('Search for .json or .md dictionary file…');
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter(f => f.extension === 'json' || f.extension === 'md');
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}

/**
 * Schema for JSON tag dictionaries (local .json files or remote URLs).
 * All fields except `tags` are optional for backward compatibility.
 */
export interface TagDictionary {
  /** Schema version, currently 1 */
  schemaVersion: number;
  /** Unique identifier for the dictionary */
  id?: string;
  /** Human-readable name */
  name?: string;
  /** Description of the dictionary's purpose */
  description?: string;
  /** BCP-47 language code, e.g. "en", "it" */
  language?: string;
  /** Tags to suggest / use for matching during training */
  tags: string[];
  /** Words to ignore during keyword extraction (language stopwords) */
  stopwords?: string[];
  /** Tags that should never be learned or suggested */
  blacklist?: string[];
  /** If non-empty, restrict suggestions to only these tags */
  whitelist?: string[];
  /** Alias map: key is alias, value is canonical tag, e.g. { "js": "javascript" } */
  aliases?: Record<string, string>;
  /** Optional macro-to-micro mapping for hierarchical suggestions in static mode */
  macros?: Record<string, string[]>;
  /** ISO date of last update, e.g. "2026-05-16" */
  updatedAt?: string;
}

export type AutoTaggerPlugin = Plugin & {
  settings: AutoTaggerSettings;
  classifiers: Map<string, EmbeddingClassifier | import('./advanced-classifier').AdvancedEmbeddingClassifier>;
  saveSettings(): Promise<void>;
  trainCollection(collectionId: string): Promise<void>;
  removeAllTagsFromCollection(collectionId: string): Promise<void>;
};

export interface Collection {
  id: string;
  name: string;
  
  // Classifier type
  classifierType: 'basic' | 'advanced';
  
  // Scope definition
  folderMode: 'all' | 'include' | 'exclude';
  includeFolders: string[];
  excludeFolders: string[];
  
  // Tag filtering
  whitelist: string[];
  blacklist: string[];
  
  // Classification parameters
  threshold: number;
  maxTags: number;
  
  // Trained classifier
  classifierData: EmbeddingClassifierData | null;
  
  // Tag dictionary (optional path to file with allowed tags)
  tagDictionaryPath: string;
  // Embedded raw copy of dictionary content, used if file/url becomes unavailable
  tagDictionarySnapshot: string;

  // Source mode: 'learning' = train on vault notes; 'static' = use dictionary only, no training
  dictionaryMode: 'learning' | 'static';

  // Static mode extras — merged with dictionary at suggestion time
  additionalTags: string[];
  additionalStopwords: string[];

  // Metadata
  enabled: boolean;
  lastTrained: number | null;
}

export interface AutoTaggerSettings {
  collections: Collection[];
  activeCollectionId: string | null;
  
  // Global settings
  autoTagOnSave: boolean;
  debugToConsole: boolean;
  
  // Defaults for new collections
  defaultThreshold: number;
  defaultMaxTags: number;
}

export const DEFAULT_COLLECTION: Omit<Collection, 'id' | 'name'> = {
  classifierType: 'basic',
  folderMode: 'all',
  includeFolders: [],
  excludeFolders: [],
  whitelist: [],
  blacklist: [],
  threshold: 0.3,
  maxTags: 5,
  classifierData: null,
  enabled: true,
  lastTrained: null,
  tagDictionaryPath: '',
  tagDictionarySnapshot: '',
  dictionaryMode: 'learning',
  additionalTags: [],
  additionalStopwords: [],
};

export const DEFAULT_SETTINGS: AutoTaggerSettings = {
  collections: [],
  activeCollectionId: null,
  autoTagOnSave: false,
  debugToConsole: false,
  defaultThreshold: 0.3,
  defaultMaxTags: 5
};

/**
 * Migrate old settings format to new collection-based format
 */
export function migrateSettings(data: unknown): AutoTaggerSettings {
  const oldData = data as Record<string, unknown>;
  
  // Already migrated to multi-collection format — patch any missing fields added later
  if (oldData.collections && Array.isArray(oldData.collections)) {
    const settings = data as AutoTaggerSettings;
    for (const col of settings.collections) {
      if (col.tagDictionaryPath === undefined)    col.tagDictionaryPath    = '';
      if (col.tagDictionarySnapshot === undefined) col.tagDictionarySnapshot = '';
      if (col.dictionaryMode === undefined)        col.dictionaryMode        = 'learning';
      if (col.additionalTags === undefined)        col.additionalTags        = [];
      if (col.additionalStopwords === undefined)   col.additionalStopwords   = [];
    }
    return settings;
  }
  
  // Create default collection from old settings
  const defaultCollection: Collection = {
    id: 'default',
    name: 'Default Collection',
    classifierType: 'basic',
    folderMode: (oldData.folderMode as 'all' | 'include' | 'exclude') || 'all',
    includeFolders: (oldData.includeFolders as string[]) || [],
    excludeFolders: (oldData.excludeFolders as string[]) || [],
    whitelist: (oldData.whitelist as string[]) || [],
    blacklist: (oldData.blacklist as string[]) || [],
    threshold: (oldData.threshold as number) ?? 0.3,
    maxTags: (oldData.maxTags as number) ?? 5,
    classifierData: (oldData.classifierData as EmbeddingClassifierData) || null,
    tagDictionaryPath: '',
    tagDictionarySnapshot: '',
    dictionaryMode: 'learning',
    additionalTags: [],
    additionalStopwords: [],
    enabled: true,
    lastTrained: null
  };
  
  return {
    collections: [defaultCollection],
    activeCollectionId: 'default',
    autoTagOnSave: (oldData.autoTagOnSave as boolean) ?? false,
    debugToConsole: (oldData.debugToConsole as boolean) ?? false,
    defaultThreshold: (oldData.threshold as number) ?? 0.3,
    defaultMaxTags: (oldData.maxTags as number) ?? 5
  };
}

export class AutoTaggerSettingTab extends PluginSettingTab {
  plugin: AutoTaggerPlugin;

  constructor(app: App, plugin: AutoTaggerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private generateCollectionId(): string {
    return 'collection_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
  }

  /** Read raw text from vault path, absolute fs path, or remote URL — used by the preview panel. */
  private async _readDictionaryRaw(source: string): Promise<string> {
    return readDictionaryRaw(this.app, source);
  }

  private async _captureDictionarySnapshot(collection: Collection, rawOverride?: string): Promise<void> {
    try {
      const raw = rawOverride ?? await this._readDictionaryRaw(collection.tagDictionaryPath);
      collection.tagDictionarySnapshot = raw;
    } catch {
      // Keep the previous snapshot if refresh fails.
    }
  }

  private createNewCollection(): Collection {
    return {
      id: this.generateCollectionId(),
      name: 'New Collection',
      ...DEFAULT_COLLECTION
    };
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('auto-tagger-settings');

    // Version identifier for debugging
    containerEl.createEl('div', { 
      cls: 'auto-tagger-version',
      text: 'Build: 2.0.14'
    });

    new Setting(containerEl)
      .setName('Configuration')
      .setHeading();
    
    const introText = containerEl.createEl('div', { 
      cls: 'setting-item-description auto-tagger-intro'
    });
    introText.createEl('span', { text: 'Create ' });
    introText.createEl('strong', { text: 'Collections' });
    introText.createEl('span', { text: ' To organize your notes with specialized classifiers. Each collection has its own scope, tag filters, and trained classifier. When a note matches multiple collections, suggestions are merged' });
    introText.createEl('br');
    introText.createEl('br');
    introText.createEl('span', { text: '💡 ' });
    introText.createEl('strong', { text: 'Quick start:' });
    introText.createEl('span', { text: ' Click the "+ new collection" button, configure scope and filters, then click "train"' });

    // Global Settings
    new Setting(containerEl)
      .setName('Global')
      .setHeading();

    new Setting(containerEl)
      .setName('Auto-tag on save')
      .setDesc('Automatically suggest and apply tags from all applicable collections when saving notes')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoTagOnSave)
        .onChange(async (value) => {
          this.plugin.settings.autoTagOnSave = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Debug to console')
      .setDesc('Show detailed debug messages in the developer console (Ctrl+Shift+I)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.debugToConsole)
        .onChange(async (value) => {
          this.plugin.settings.debugToConsole = value;
          // Update all loaded classifiers
          for (const classifier of this.plugin.classifiers.values()) {
            classifier.setDebugEnabled(value);
          }
          await this.plugin.saveSettings();
        }));

    // Collections Section
    new Setting(containerEl)
      .setName('Collections')
      .setHeading();

    new Setting(containerEl)
      .setName('Add collection')
      .setDesc('Create a new collection with its own scope, filters, and classifier')
      .addButton(button => button
        .setButtonText('+ new collection')
        .setCta()
        .onClick(async () => {
          const newCollection = this.createNewCollection();
          this.plugin.settings.collections.push(newCollection);
          this.plugin.settings.activeCollectionId = newCollection.id;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Display each collection
    if (this.plugin.settings.collections.length === 0) {
      containerEl.createEl('p', {
        text: 'No collections yet. Create one to start training and classifying notes.',
        cls: 'setting-item-description'
      });
    } else {
      for (const collection of this.plugin.settings.collections) {
        this.displayCollection(containerEl, collection);
      }
    }
  }

  private displayCollection(containerEl: HTMLElement, collection: Collection): void {
    const collectionContainer = containerEl.createEl('div', { 
      cls: 'auto-tagger-collection' 
    });

    // Collection Header
    const headerSetting = new Setting(collectionContainer)
      .setName(collection.name)
      .setClass('auto-tagger-collection-header');

    // Enabled toggle
    headerSetting.addToggle(toggle => toggle
      .setValue(collection.enabled)
      .setTooltip(collection.enabled ? 'Collection is active' : 'Collection is disabled')
      .onChange(async (value) => {
        collection.enabled = value;
        await this.plugin.saveSettings();
      }));

    // Duplicate button
    headerSetting.addButton(button => button
      .setButtonText('Duplicate')
      .setTooltip('Create a copy of this collection (trained data will not be copied)')
      .onClick(async () => {
        const newCollection: Collection = {
          ...collection,
          id: this.generateCollectionId(),
          name: collection.name + ' (Copy)',
          classifierData: null,
          lastTrained: null
        };
        this.plugin.settings.collections.push(newCollection);
        await this.plugin.saveSettings();
        new Notice(`Created copy: "${newCollection.name}" (needs training)`);
        this.display();
      }));

    // Delete button
    headerSetting.addButton(button => button
      .setButtonText('Delete')
      .setWarning()
      .setTooltip('Delete this collection')
      .onClick(() => {
        const modal = new ConfirmModal(
          this.app,
          `Delete collection "${collection.name}"?`,
          `This will permanently remove the collection and its trained classifier. This action cannot be undone.`,
          async () => {
            this.plugin.settings.collections = this.plugin.settings.collections
              .filter(c => c.id !== collection.id);
            
            if (this.plugin.settings.activeCollectionId === collection.id) {
              this.plugin.settings.activeCollectionId = this.plugin.settings.collections[0]?.id || null;
            }
          
          this.plugin.classifiers.delete(collection.id);
          await this.plugin.saveSettings();
          new Notice(`Deleted collection "${collection.name}"`);
          this.display();
        });
        modal.open();
      }));

    // Collection Name
    new Setting(collectionContainer)
      .setName('Collection name')
      .addText(text => {
        text
          .setValue(collection.name)
          .setPlaceholder('Enter collection name')
          .onChange((value) => {
            const trimmed = value.trim();
            collection.name = trimmed.length > 0 ? trimmed : 'Unnamed Collection';
          });
        
        // Update header and save on blur
        text.inputEl.addEventListener('blur', () => {
          void (async () => {
            // Ensure name is not empty
            if (!collection.name.trim()) {
              collection.name = 'Unnamed Collection';
              text.setValue(collection.name);
            }
            
            // Update the header title
            const headerNameEl = headerSetting.nameEl;
            headerNameEl.textContent = collection.name;
            await this.plugin.saveSettings();
          })();
        });
      });

    // Source mode
    new Setting(collectionContainer)
      .setName('Source mode')
      .setDesc('Learning: train a classifier on vault notes. Static dictionary: match tags directly from a dictionary file — no training needed.')
      .addDropdown(dropdown => dropdown
        .addOption('learning', 'Learning (train classifier on notes)')
        .addOption('static', 'Static dictionary (no training)')
        .setValue(collection.dictionaryMode ?? 'learning')
        .onChange(async (value) => {
          collection.dictionaryMode = value as 'learning' | 'static';
          await this.plugin.saveSettings();
          this.display();
        }));

    // Status (learning mode only)
    const classifier = this.plugin.classifiers?.get(collection.id);
    const stats = classifier?.getStats();
    if (collection.dictionaryMode !== 'static') {
      if (stats && stats.totalTags > 0) {
        const statusText = `Trained on ${stats.totalDocs} documents with ${stats.totalTags} unique tags`;
        const lastTrainedText = collection.lastTrained 
          ? ` (Last trained: ${new Date(collection.lastTrained).toLocaleString()})`
          : '';
        
        collectionContainer.createEl('p', {
          text: statusText + lastTrainedText,
          cls: 'setting-item-description auto-tagger-status'
        });
      } else {
        collectionContainer.createEl('p', {
          text: 'Not trained. Use the "train" button below.',
          cls: 'setting-item-description auto-tagger-status'
        });
      }
    } else {
      const dictStatus = collection.tagDictionaryPath
        ? `Static dictionary: ${collection.tagDictionaryPath}`
        : 'Static dictionary mode — configure a dictionary source below.';
      collectionContainer.createEl('p', {
        text: dictStatus,
        cls: 'setting-item-description auto-tagger-status'
      });
    }

    // Folder Scope
    new Setting(collectionContainer)
      .setName('Folder scope')
      .setHeading();

    // Classifier Type Selection (learning mode only)
    if (collection.dictionaryMode !== 'static') {
      new Setting(collectionContainer)
        .setName('Classifier type')
        .setDesc('Choose between basic (faster, simpler) or advanced (enhanced filtering, semantic understanding)')
        .addDropdown(dropdown => {
          dropdown
            .addOption('basic', 'Basic (frequency & inverse document frequency)')
            .addOption('advanced', 'Advanced (enhanced)')
            .setValue(collection.classifierType || 'basic')
            .onChange((value) => {
              void (async () => {
                collection.classifierType = value as 'basic' | 'advanced';
                collection.classifierData = null;
                collection.lastTrained = null;
                await this.plugin.saveSettings();
                new Notice(`Switched to ${value} classifier. Please retrain this collection.`);
                this.display();
              })();
            });
          return dropdown;
        });
    }

    new Setting(collectionContainer)
      .setName('Folder mode')
      .setDesc('Which folders to include in training and classification')
      .addDropdown(dropdown => dropdown
        .addOption('all', 'All folders')
        .addOption('include', 'Include specific folders')
        .addOption('exclude', 'Exclude specific folders')
        .setValue(collection.folderMode)
        .onChange(async (value) => {
          collection.folderMode = value as 'all' | 'include' | 'exclude';
          await this.plugin.saveSettings();
          this.display();
        }));

    if (collection.folderMode === 'include') {
      new Setting(collectionContainer)
        .setName('Include folders')
        .setDesc('Comma-separated list of folder paths')
        .addText(text => text
          .setPlaceholder('Folder1, folder2/subfolder')
          .setValue(collection.includeFolders.join(', '))
          .onChange(async (value) => {
            collection.includeFolders = value
              .split(',')
              .map(f => f.trim())
              .filter(f => f.length > 0);
            await this.plugin.saveSettings();
          }));
    }

    if (collection.folderMode === 'exclude') {
      new Setting(collectionContainer)
        .setName('Exclude folders')
        .setDesc('Comma-separated list of folder paths')
        .addTextArea(text => text
          .setPlaceholder('Archive, templates')
          .setValue(collection.excludeFolders.join(', '))
          .onChange(async (value) => {
            collection.excludeFolders = value
              .split(',')
              .map(f => f.trim())
              .filter(f => f.length > 0);
            await this.plugin.saveSettings();
          }));
    }

    // Tag Filtering
    new Setting(collectionContainer)
      .setName('Tag filtering')
      .setHeading();

    // ── Dictionary source ──────────────────────────────────────────────────
    new Setting(collectionContainer)
      .setName(collection.dictionaryMode === 'static' ? 'Dictionary source (required)' : 'Tag dictionary (optional)')
      .setDesc(
        collection.dictionaryMode === 'static'
          ? 'Load a local file or import from URL. Obsidian keeps a local copy.'
          : 'Optionally attach a JSON dictionary (tags, stopwords, blacklist, aliases). Leave empty to auto-extract from training.'
      )
      .setHeading();

    const _isUrl = (s: string) => s.startsWith('http://') || s.startsWith('https://');

    if (collection.dictionaryMode === 'static') {
      const examplesUrl = 'https://github.com/canepa/plugin-obsidian-classifier/tree/main/dictionaries';
      new Setting(collectionContainer)
        .setName('Example dictionaries')
        .setDesc('Download ready-to-use JSON dictionaries from the plugin repository')
        .addButton(btn => btn
          .setButtonText('Open on GitHub')
          .onClick(() => {
            window.open(examplesUrl, '_blank');
          }));
    }

    if (!collection.tagDictionaryPath) {
      // ── CONFIGURE STATE: no dictionary set yet ──────────────────────────

      // Local file
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isDesktop = !!(window as any).require;
      const localSetting = new Setting(collectionContainer)
        .setName('Local file')
        .setDesc('Pick a .json or .md file from the vault, or enter an absolute path')
        .addText(text => {
          text.setPlaceholder('dictionaries/tags.json').onChange(async (value) => {
            const v = value.trim();
            if (v) {
              collection.tagDictionaryPath = v;
              await this._captureDictionarySnapshot(collection);
              await this.plugin.saveSettings();
              this.display();
            }
          });
          text.inputEl.style.flex = '1';
          return text;
        })
        .addButton(btn => btn
          .setButtonText('Browse vault')
          .onClick(() => {
            new VaultDictionaryPickerModal(this.app, async (file) => {
              collection.tagDictionaryPath = file.path;
              await this._captureDictionarySnapshot(collection);
              await this.plugin.saveSettings();
              this.display();
            }).open();
          }));

      if (isDesktop) {
        localSetting.addButton(btn => btn
          .setButtonText('Browse filesystem')
          .onClick(async () => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { dialog } = (window as any).require('electron').remote
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ?? (window as any).require('@electron/remote');
              const result = await dialog.showOpenDialog({
                title: 'Select dictionary file',
                filters: [{ name: 'Dictionary', extensions: ['json', 'md'] }],
                properties: ['openFile']
              });
              if (!result.canceled && result.filePaths.length > 0) {
                collection.tagDictionaryPath = result.filePaths[0] as string;
                await this._captureDictionarySnapshot(collection);
                await this.plugin.saveSettings();
                this.display();
              }
            } catch {
              new Notice('Filesystem picker unavailable — enter the path manually');
            }
          }));
      }

      // Remote URL import
      let _pendingUrl = '';
      new Setting(collectionContainer)
        .setName('Import from URL')
        .setDesc('Download a JSON dictionary from a public HTTPS endpoint — Obsidian saves a local copy')
        .addText(text => {
          text.setPlaceholder('https://example.com/tags.json').onChange((v) => { _pendingUrl = v.trim(); });
          text.inputEl.style.flex = '1';
          return text;
        })
        .addButton(btn => btn
          .setButtonText('Import to vault')
          .onClick(async () => {
            const url = _pendingUrl;
            if (!_isUrl(url)) { new Notice('Enter a valid https:// URL'); return; }
            btn.setButtonText('Downloading…').setDisabled(true);
            try {
              const resp = await requestUrl({ url, method: 'GET' });
              if (resp.status !== 200) { new Notice(`HTTP ${resp.status}: download failed`); return; }

              const urlPath = new URL(url).pathname;
              const rawName = urlPath.split('/').filter(Boolean).pop() ?? 'dictionary.json';
              const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
              const destFolder = 'dictionaries';
              const destPath = `${destFolder}/${safeName}`;

              if (!this.app.vault.getFolderByPath(destFolder)) {
                await this.app.vault.createFolder(destFolder);
              }
              const existing = this.app.vault.getFileByPath(destPath);
              if (existing) { await this.app.vault.modify(existing, resp.text); }
              else          { await this.app.vault.create(destPath, resp.text); }

              collection.tagDictionaryPath = destPath;
              await this._captureDictionarySnapshot(collection, resp.text);
              await this.plugin.saveSettings();
              this.display();
            } catch (e) {
              new Notice(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
              btn.setButtonText('Import to vault').setDisabled(false);
            }
          }));

    } else {
      // ── LOADED STATE: dictionary is configured — show metadata card ──────

      const card = collectionContainer.createDiv({ cls: 'auto-tagger-dict-card' });
      const loadingEl = card.createEl('p', {
        text: 'Loading dictionary…',
        cls: 'setting-item-description auto-tagger-dict-loading'
      });

      // "Change" button
      const actionsRow = new Setting(collectionContainer)
        .setClass('auto-tagger-dict-card-actions')
        .addButton(btn => btn
          .setButtonText('Change dictionary')
          .onClick(async () => {
            collection.tagDictionaryPath = '';
            collection.tagDictionarySnapshot = '';
            await this.plugin.saveSettings();
            this.display();
          }));

      if (_isUrl(collection.tagDictionaryPath)) {
        actionsRow.addButton(btn => btn
          .setButtonText('Save local copy')
          .setTooltip('Download and save as vault file')
          .onClick(async () => {
            const url = collection.tagDictionaryPath;
            btn.setButtonText('Downloading…').setDisabled(true);
            try {
              const resp = await requestUrl({ url, method: 'GET' });
              if (resp.status !== 200) { new Notice(`HTTP ${resp.status}`); return; }
              const rawName = new URL(url).pathname.split('/').filter(Boolean).pop() ?? 'dictionary.json';
              const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
              const destPath = `dictionaries/${safeName}`;
              if (!this.app.vault.getFolderByPath('dictionaries')) {
                await this.app.vault.createFolder('dictionaries');
              }
              const ex = this.app.vault.getFileByPath(destPath);
              if (ex) { await this.app.vault.modify(ex, resp.text); }
              else    { await this.app.vault.create(destPath, resp.text); }
              collection.tagDictionaryPath = destPath;
              await this._captureDictionarySnapshot(collection, resp.text);
              await this.plugin.saveSettings();
              this.display();
            } catch (e) {
              new Notice(`Failed: ${e instanceof Error ? e.message : String(e)}`);
              btn.setButtonText('Save local copy').setDisabled(false);
            }
          }));
      }

      // Async: fill the card with dictionary metadata
      setTimeout(() => {
        void (async () => {
          try {
            let raw = '';
            try {
              raw = await this._readDictionaryRaw(collection.tagDictionaryPath);
            } catch {
              if (collection.tagDictionarySnapshot) {
                raw = collection.tagDictionarySnapshot;
              } else {
                throw new Error(`Unable to load dictionary from ${collection.tagDictionaryPath}`);
              }
            }
            let data: Record<string, unknown> = {};
            if (collection.tagDictionaryPath.toLowerCase().endsWith('.json')) {
              data = JSON.parse(raw) as Record<string, unknown>;
            } else {
              const tags = raw.split('\n').map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#'));
              data = { tags };
            }

            const tags        = Array.isArray(data['tags'])      ? (data['tags']      as string[]) : [];
            const stopwords   = Array.isArray(data['stopwords']) ? (data['stopwords'] as string[]) : [];
            const blacklist   = Array.isArray(data['blacklist']) ? (data['blacklist'] as string[]) : [];
            const aliasesRaw  = (data['aliases'] && typeof data['aliases'] === 'object' && !Array.isArray(data['aliases']))
              ? data['aliases'] as Record<string, string> : {};
            const aliasEntries = Object.entries(aliasesRaw);
            const dictName    = typeof data['name']        === 'string' ? data['name']        : null;
            const dictDesc    = typeof data['description'] === 'string' ? data['description'] : null;
            const updatedAt   = typeof data['updatedAt']   === 'string' ? data['updatedAt']   : null;

            loadingEl.remove();

            if (dictName) {
              const nameEl = card.createEl('p', { cls: 'auto-tagger-dict-name' });
              nameEl.createEl('strong', { text: dictName });
              if (updatedAt) nameEl.createSpan({ text: ` · ${updatedAt}`, cls: 'auto-tagger-dict-date' });
            }
            if (dictDesc) {
              card.createEl('p', { text: dictDesc, cls: 'setting-item-description auto-tagger-dict-desc' });
            }

            // Summary bar
            const summary = card.createEl('p', { cls: 'setting-item-description auto-tagger-dict-summary' });
            summary.innerHTML =
              `<strong>${tags.length}</strong> tags` +
              (stopwords.length   ? ` · <strong>${stopwords.length}</strong> stopwords`         : '') +
              (blacklist.length   ? ` · <strong>${blacklist.length}</strong> blacklisted`        : '') +
              (aliasEntries.length ? ` · <strong>${aliasEntries.length}</strong> aliases`        : '');

            const renderAccordion = (title: string, items: string[]) => {
              if (items.length === 0) return;
              const det = card.createEl('details', { cls: 'auto-tagger-dict-accordion' });
              det.createEl('summary', { text: `${title} (${items.length})` });
              const box = det.createDiv({ cls: 'auto-tagger-tags-container' });
              items.forEach(item => box.createEl('code', { text: item, cls: 'auto-tagger-tag-chip' }));
            };
            renderAccordion('Tags', tags);
            renderAccordion('Stopwords', stopwords);
            renderAccordion('Blacklist', blacklist);
            if (aliasEntries.length > 0) {
              const det = card.createEl('details', { cls: 'auto-tagger-dict-accordion' });
              det.createEl('summary', { text: `Aliases (${aliasEntries.length})` });
              const box = det.createDiv({ cls: 'auto-tagger-tags-container' });
              aliasEntries.forEach(([from, to]) =>
                box.createEl('code', { text: `${from} → ${to}`, cls: 'auto-tagger-tag-chip' }));
            }

          } catch (e) {
            loadingEl.setText(`Error loading dictionary: ${e instanceof Error ? e.message : String(e)}`);
            loadingEl.classList.add('mod-warning');
          }
        })();
      }, 50);
    }

    if (collection.dictionaryMode === 'static') {
      // Static mode: additional tags / stopwords to supplement the dictionary
      new Setting(collectionContainer)
        .setName('Additional tags')
        .setDesc('Extra tags to include on top of the dictionary (comma-separated)')
        .addText(text => text
          .setPlaceholder('project, review, inbox')
          .setValue((collection.additionalTags ?? []).join(', '))
          .onChange(async (value) => {
            collection.additionalTags = value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
            await this.plugin.saveSettings();
          }));

      new Setting(collectionContainer)
        .setName('Additional stopwords')
        .setDesc('Extra words to ignore when matching content to tags (comma-separated)')
        .addText(text => text
          .setPlaceholder('the, and, or, is')
          .setValue((collection.additionalStopwords ?? []).join(', '))
          .onChange(async (value) => {
            collection.additionalStopwords = value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
            await this.plugin.saveSettings();
          }));
    } else {
      // Learning mode: whitelist, blacklist, all-tags panel
      new Setting(collectionContainer)
        .setName('Tag whitelist')
        .setDesc('Restrict suggestions to only these tags (comma-separated). Leave empty to allow all learned tags')
        .addTextArea(text => text
          .setPlaceholder('Project, important, review')
          .setValue(collection.whitelist.join(', '))
          .onChange(async (value) => {
            collection.whitelist = value
              .split(',')
              .map(t => t.trim().toLowerCase())
              .filter(t => t.length > 0);
            await this.plugin.saveSettings();
          }));

      new Setting(collectionContainer)
        .setName('Tag blacklist')
        .setDesc('Exclude from training and remove from notes if present (comma-separated)')
        .addTextArea(text => text
          .setPlaceholder('Todo, draft, private')
          .setValue(collection.blacklist.join(', '))
          .onChange(async (value) => {
            collection.blacklist = value
              .split(',')
              .map(t => t.trim().toLowerCase())
              .filter(t => t.length > 0);
            await this.plugin.saveSettings();
          }));

      // All tags panel with blacklist management
      if (stats && stats.totalTags > 0) {
        const allTags = classifier?.getAllTags() || [];
        if (allTags.length > 0) {
          const tagSection = collectionContainer.createEl('details');
          tagSection.createEl('summary', { text: `All Tags in Collection (${allTags.length})` });
          const tagsContainer = tagSection.createEl('div', { cls: 'auto-tagger-tags-container' });
          for (const tag of allTags) {
            const tagSetting = new Setting(tagsContainer)
              .setName(tag)
              .setDesc(`Used in ${classifier?.getTagDocCount(tag)} documents`);
            const isBlacklisted = collection.blacklist.includes(tag);
            if (isBlacklisted) {
              tagSetting.addButton(button => button
                .setButtonText('Remove from blacklist')
                .onClick(async () => {
                  collection.blacklist = collection.blacklist.filter(t => t !== tag);
                  await this.plugin.saveSettings();
                  this.display();
                }));
            } else {
              tagSetting.addButton(button => button
                .setButtonText('Blacklist')
                .setWarning()
                .onClick(async () => {
                  if (!collection.blacklist.includes(tag)) {
                    collection.blacklist.push(tag);
                    await this.plugin.saveSettings();
                    this.display();
                  }
                }));
            }
          }
        }
      }
    }

    // Classification Parameters
    new Setting(collectionContainer)
      .setName('Classification parameters')
      .setHeading();

    // Threshold only relevant for the trained classifier (learning mode)
    if (collection.dictionaryMode !== 'static') {
      new Setting(collectionContainer)
        .setName('Similarity threshold')
        .setDesc('Minimum embedding similarity (0.1-0.7). Lower = more tags suggested')
        .addSlider(slider => slider
          .setLimits(0.1, 0.7, 0.05)
          .setValue(collection.threshold)
          .setDynamicTooltip()
          .onChange(async (value) => {
            collection.threshold = value;
            await this.plugin.saveSettings();
          }));
    }

    new Setting(collectionContainer)
      .setName('Maximum tags')
      .setDesc('Maximum number of tags to suggest per note')
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(collection.maxTags)
        .setDynamicTooltip()
        .onChange(async (value) => {
          collection.maxTags = value;
          await this.plugin.saveSettings();
        }));

    // Actions
    new Setting(collectionContainer)
      .setName('Actions')
      .setHeading();

    const actionsSetting = new Setting(collectionContainer)
      .setName(collection.dictionaryMode === 'static' ? 'Collection actions' : 'Classifier actions');

    // Train / Clear / Debug only available in learning mode
    if (collection.dictionaryMode !== 'static') {
      actionsSetting.addButton(button => button
        .setButtonText('Train')
        .setCta()
        .setTooltip('Train classifier on notes in scope')
        .onClick(async () => {
          await this.plugin.trainCollection(collection.id);
          this.display();
        }));

      actionsSetting.addButton(button => {
        const isTrained = collection.classifierData !== null;
        button
          .setButtonText('Clear training')
          .setWarning()
          .setTooltip(isTrained ? 'Delete trained data and start fresh' : 'No training data to clear')
          .setDisabled(!isTrained)
          .onClick(() => {
            const modal = new ConfirmModal(
              this.app,
              `Clear all training data for "${collection.name}"?`,
              `This will delete the trained classifier. You'll need to retrain.`,
              async () => {
                collection.classifierData = null;
                collection.lastTrained = null;
                this.plugin.classifiers.delete(collection.id);
                await this.plugin.saveSettings();
                new Notice(`Cleared training data for "${collection.name}"`);
                this.display();
              }
            );
            modal.open();
          });
      });

      actionsSetting.addButton(button => button
        .setButtonText('Debug stats')
        .setTooltip('Show detailed classifier statistics')
        .onClick(() => {
          const classifier = this.plugin.classifiers?.get(collection.id);
          if (classifier) {
            const stats = classifier.getStats();
            const detailedStats: {
              avgDocsPerTag?: number;
              vocabularySize?: number;
              topTags?: Array<{ tag: string; count: number }>;
              tagDistinctiveWordsCount?: number;
            } = (classifier as EmbeddingClassifier).getDetailedStats?.() || {};
            
            let msg = `📊 Collection: ${collection.name}\n`;
            msg += `━━━━━━━━━━━━━━━━━━━━\n`;
            msg += `🏷️  Tags: ${stats.totalTags}\n`;
            msg += `📄 Documents: ${stats.totalDocs}\n`;
            msg += `🔧 Classifier: ${collection.classifierType}\n`;
            
            if (detailedStats.avgDocsPerTag) {
              msg += `📊 Avg docs/tag: ${detailedStats.avgDocsPerTag.toFixed(1)}\n`;
            }
            if (detailedStats.vocabularySize) {
              msg += `📚 Vocabulary: ${detailedStats.vocabularySize} words\n`;
            }
            if (collection.lastTrained) {
              const date = new Date(collection.lastTrained);
              msg += `⏰ Trained: ${date.toLocaleString()}\n`;
            }
            
            if (detailedStats.topTags && detailedStats.topTags.length > 0) {
              msg += `\n🔝 Top 5 tags by docs:\n`;
              detailedStats.topTags.slice(0, 5).forEach((t: { tag: string; count: number }) => {
                msg += `   ${t.tag}: ${t.count} docs\n`;
              });
            }
            
            if (detailedStats.tagDistinctiveWordsCount) {
              msg += `\n🎯 Avg distinctive words/tag: ${detailedStats.tagDistinctiveWordsCount.toFixed(1)}`;
            }
            
            new Notice(msg, 8000);
          } else {
            new Notice('Classifier not loaded. Train first.');
          }
        }));
    }

    actionsSetting.addButton(button => button
      .setButtonText('Remove all tags')
      .setWarning()
      .setTooltip('Remove all tags from files in scope')
      .onClick(() => {
        const modal = new ConfirmModal(
          this.app,
          `Remove all tags from "${collection.name}"?`,
          `This will remove ALL tags from all files in this collection's scope. This action cannot be undone.`,
          async () => {
            await this.plugin.removeAllTagsFromCollection(collection.id);
          }
        );
        modal.open();
      }));
  }
}
