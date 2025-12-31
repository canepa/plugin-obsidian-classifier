import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { EmbeddingClassifierData } from './embedding-classifier';

export interface Collection {
  id: string;
  name: string;
  
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
  folderMode: 'all',
  includeFolders: [],
  excludeFolders: [],
  whitelist: [],
  blacklist: [],
  threshold: 0.3,
  maxTags: 5,
  classifierData: null,
  enabled: true,
  lastTrained: null
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
export function migrateSettings(data: any): AutoTaggerSettings {
  // Already migrated
  if (data.collections && Array.isArray(data.collections)) {
    return data;
  }
  
  // Create default collection from old settings
  const defaultCollection: Collection = {
    id: 'default',
    name: 'Default Collection',
    folderMode: data.folderMode || 'all',
    includeFolders: data.includeFolders || [],
    excludeFolders: data.excludeFolders || [],
    whitelist: data.whitelist || [],
    blacklist: data.blacklist || [],
    threshold: data.threshold ?? 0.3,
    maxTags: data.maxTags ?? 5,
    classifierData: data.classifierData || null,
    enabled: true,
    lastTrained: null
  };
  
  console.log('[Auto Tagger] Migrating settings to collection-based format');
  
  return {
    collections: [defaultCollection],
    activeCollectionId: 'default',
    autoTagOnSave: data.autoTagOnSave ?? false,
    debugToConsole: data.debugToConsole ?? false,
    defaultThreshold: data.threshold ?? 0.3,
    defaultMaxTags: data.maxTags ?? 5
  };
}

export class AutoTaggerSettingTab extends PluginSettingTab {
  plugin: Plugin & {
    settings: AutoTaggerSettings;
    classifiers: Map<string, any>;
    saveSettings(): Promise<void>;
    trainCollection(collectionId: string): Promise<void>;
  };

  constructor(app: App, plugin: any) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private generateCollectionId(): string {
    return 'collection_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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

    containerEl.createEl('h2', { text: 'Auto Tagger Settings' });
    
    const introText = containerEl.createEl('p', { 
      cls: 'setting-item-description'
    });
    introText.innerHTML = 'Create <strong>collections</strong> to organize your notes with specialized classifiers. ' +
      'Each collection has its own scope, tag filters, and trained classifier. ' +
      'When a note matches multiple collections, suggestions are merged. ' +
      '<br><br>💡 <strong>Quick Start:</strong> Click "+ New Collection", configure scope and filters, then click "Train".';
    introText.style.padding = '10px';
    introText.style.backgroundColor = 'var(--background-secondary)';
    introText.style.borderRadius = '4px';
    introText.style.marginBottom = '16px';

    // Global Settings
    containerEl.createEl('h3', { text: 'Global Settings' });

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
          await this.plugin.saveSettings();
        }));

    // Collections Section
    containerEl.createEl('h3', { text: 'Collections' });

    new Setting(containerEl)
      .setName('Add Collection')
      .setDesc('Create a new collection with its own scope, filters, and classifier')
      .addButton(button => button
        .setButtonText('+ New Collection')
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
    collectionContainer.style.border = '1px solid var(--background-modifier-border)';
    collectionContainer.style.borderRadius = '8px';
    collectionContainer.style.padding = '16px';
    collectionContainer.style.marginBottom = '16px';
    collectionContainer.style.backgroundColor = 'var(--background-secondary)';

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
      .setTooltip('Create a copy of this collection')
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
        this.display();
      }));

    // Delete button
    headerSetting.addButton(button => button
      .setButtonText('Delete')
      .setWarning()
      .setTooltip('Delete this collection')
      .onClick(async () => {
        if (confirm(`Are you sure you want to delete "${collection.name}"?`)) {
          this.plugin.settings.collections = this.plugin.settings.collections
            .filter(c => c.id !== collection.id);
          if (this.plugin.settings.activeCollectionId === collection.id) {
            this.plugin.settings.activeCollectionId = this.plugin.settings.collections[0]?.id || null;
          }
          await this.plugin.saveSettings();
          this.display();
        }
      }));

    // Collection Name
    new Setting(collectionContainer)
      .setName('Collection name')
      .addText(text => {
        text
          .setValue(collection.name)
          .setPlaceholder('Enter collection name')
          .onChange((value) => {
            collection.name = value || 'Unnamed Collection';
          });
        
        // Update header and save on blur
        text.inputEl.addEventListener('blur', async () => {
          // Update the header title
          const headerNameEl = headerSetting.nameEl;
          headerNameEl.textContent = collection.name;
          await this.plugin.saveSettings();
        });
      });

    // Status
    const classifier = this.plugin.classifiers?.get(collection.id);
    const stats = classifier?.getStats();
    if (stats && stats.totalTags > 0) {
      const statusText = `Trained on ${stats.totalDocs} documents with ${stats.totalTags} unique tags`;
      const lastTrainedText = collection.lastTrained 
        ? ` (Last trained: ${new Date(collection.lastTrained).toLocaleString()})`
        : '';
      
      collectionContainer.createEl('p', {
        text: statusText + lastTrainedText,
        cls: 'setting-item-description'
      }).style.fontStyle = 'italic';
    } else {
      collectionContainer.createEl('p', {
        text: 'Not trained yet. Use the "Train" button below.',
        cls: 'setting-item-description'
      }).style.fontStyle = 'italic';
    }

    // Folder Scope
    collectionContainer.createEl('h4', { text: 'Folder Scope' });

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
        .addTextArea(text => text
          .setPlaceholder('folder1, folder2/subfolder')
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
          .setPlaceholder('archive, templates')
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
    collectionContainer.createEl('h4', { text: 'Tag Filtering' });

    new Setting(collectionContainer)
      .setName('Tag whitelist')
      .setDesc('Only suggest these tags (comma-separated). Leave empty for all learned tags')
      .addTextArea(text => text
        .setPlaceholder('project, important, review')
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
      .setDesc('Never suggest or train on these tags (comma-separated)')
      .addTextArea(text => text
        .setPlaceholder('todo, draft, private')
        .setValue(collection.blacklist.join(', '))
        .onChange(async (value) => {
          collection.blacklist = value
            .split(',')
            .map(t => t.trim().toLowerCase())
            .filter(t => t.length > 0);
          await this.plugin.saveSettings();
        }));

    // Show existing tags with blacklist management
    if (stats && stats.totalTags > 0) {
      const allTags = Object.keys(classifier.tagDocCounts || {}).sort();
      
      if (allTags.length > 0) {
        const tagSection = collectionContainer.createEl('details');
        tagSection.createEl('summary', { text: `All Tags in Collection (${allTags.length})` });
        
        const tagsContainer = tagSection.createEl('div', { cls: 'auto-tagger-tags-list' });
        tagsContainer.style.maxHeight = '200px';
        tagsContainer.style.overflowY = 'auto';
        tagsContainer.style.border = '1px solid var(--background-modifier-border)';
        tagsContainer.style.borderRadius = '4px';
        tagsContainer.style.padding = '8px';
        tagsContainer.style.marginTop = '8px';
        
        for (const tag of allTags) {
          const tagSetting = new Setting(tagsContainer)
            .setName(tag)
            .setDesc(`Used in ${classifier.tagDocCounts[tag]} documents`);
          
          const isBlacklisted = collection.blacklist.includes(tag);
          
          if (isBlacklisted) {
            tagSetting.addButton(button => button
              .setButtonText('Remove from Blacklist')
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

    // Classification Parameters
    collectionContainer.createEl('h4', { text: 'Classification Parameters' });

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
    collectionContainer.createEl('h4', { text: 'Actions' });

    const actionsSetting = new Setting(collectionContainer)
      .setName('Classifier Actions');

    actionsSetting.addButton(button => button
      .setButtonText('Train')
      .setCta()
      .setTooltip('Train classifier on notes in scope')
      .onClick(async () => {
        await this.plugin.trainCollection(collection.id);
        this.display();
      }));

    actionsSetting.addButton(button => button
      .setButtonText('Debug Stats')
      .setTooltip('Show classifier statistics')
      .onClick(() => {
        const classifier = this.plugin.classifiers?.get(collection.id);
        if (classifier) {
          const stats = classifier.getStats();
          const msg = `Collection: ${collection.name}\nTags: ${stats.totalTags}\nDocuments: ${stats.totalDocs}`;
          alert(msg);
        } else {
          alert('Classifier not loaded');
        }
      }));
  }
}
