import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import type { EmbeddingClassifierData, EmbeddingClassifier } from './embedding-classifier';

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
export function migrateSettings(data: unknown): AutoTaggerSettings {
  const oldData = data as Record<string, unknown>;
  
  // Already migrated
  if (oldData.collections && Array.isArray(oldData.collections)) {
    return data as AutoTaggerSettings;
  }
  
  // Create default collection from old settings
  const defaultCollection: Collection = {
    id: 'default',
    name: 'Default Collection',
    folderMode: (oldData.folderMode as 'all' | 'include' | 'exclude') || 'all',
    includeFolders: (oldData.includeFolders as string[]) || [],
    excludeFolders: (oldData.excludeFolders as string[]) || [],
    whitelist: (oldData.whitelist as string[]) || [],
    blacklist: (oldData.blacklist as string[]) || [],
    threshold: (oldData.threshold as number) ?? 0.3,
    maxTags: (oldData.maxTags as number) ?? 5,
    classifierData: (oldData.classifierData as EmbeddingClassifierData) || null,
    enabled: true,
    lastTrained: null
  };
  
  console.debug('[Auto Tagger] Migrating settings to collection-based format');
  
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
  plugin: Plugin & {
    settings: AutoTaggerSettings;
    classifiers: Map<string, EmbeddingClassifier>;
    saveSettings(): Promise<void>;
    trainCollection(collectionId: string): Promise<void>;
  };

  constructor(app: App, plugin: Plugin & {
    settings: AutoTaggerSettings;
    classifiers: Map<string, EmbeddingClassifier>;
    saveSettings(): Promise<void>;
    trainCollection(collectionId: string): Promise<void>;
  }) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private generateCollectionId(): string {
    return 'collection_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
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

    new Setting(containerEl)
      .setName('Configuration')
      .setHeading();
    
    const introText = containerEl.createEl('div', { 
      cls: 'setting-item-description auto-tagger-intro'
    });
    introText.createEl('span', { text: 'Create ' });
    introText.createEl('strong', { text: 'Collections' });
    introText.createEl('span', { text: ' to organize your notes with specialized classifiers. Each Collection has its own scope, tag filters, and trained classifier. When a note matches multiple Collections, suggestions are merged' });
    introText.createEl('br');
    introText.createEl('br');
    introText.createEl('span', { text: '💡 ' });
    introText.createEl('strong', { text: 'Quick Start:' });
    introText.createEl('span', { text: ' Click the "+ New Collection" button, configure scope and filters, then click "Train"' });

    // Global Settings
    new Setting(containerEl)
      .setName('Global settings')
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
        const collectionName = collection.name;
        new Notice(`Delete collection "${collectionName}"? This cannot be undone. Save your work first!`);
        // Give user time to cancel by clicking away
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        this.plugin.settings.collections = this.plugin.settings.collections
          .filter(c => c.id !== collection.id);
        if (this.plugin.settings.activeCollectionId === collection.id) {
          this.plugin.settings.activeCollectionId = this.plugin.settings.collections[0]?.id || null;
        }
        await this.plugin.saveSettings();
        this.display();
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
        cls: 'setting-item-description auto-tagger-status'
      });
    } else {
      collectionContainer.createEl('p', {
        text: 'Not trained. Use the "Train" button below.',
        cls: 'setting-item-description auto-tagger-status'
      });
    }

    // Folder Scope
    new Setting(collectionContainer)
      .setName('Folder scope')
      .setHeading();

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
          .setPlaceholder('Folder1, Folder2/Subfolder')
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
          .setPlaceholder('Archive, Templates')
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

    new Setting(collectionContainer)
      .setName('Tag whitelist')
      .setDesc('Only suggest these tags (comma-separated). Leave empty for all learned tags')
      .addTextArea(text => text
        .setPlaceholder('Project, Important, Review')
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
        .setPlaceholder('Todo, Draft, Private')
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

    // Classification Parameters
    new Setting(collectionContainer)
      .setName('Classification parameters')
      .setHeading();

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
    new Setting(collectionContainer)
      .setName('Actions')
      .setHeading();

    const actionsSetting = new Setting(collectionContainer)
      .setName('Classifier actions');

    actionsSetting.addButton(button => button
      .setButtonText('Train')
      .setCta()
      .setTooltip('Train classifier on notes in scope')
      .onClick(async () => {
        await this.plugin.trainCollection(collection.id);
        this.display();
      }));

    actionsSetting.addButton(button => button
      .setButtonText('Debug stats')
      .setTooltip('Show classifier statistics')
      .onClick(() => {
        const classifier = this.plugin.classifiers?.get(collection.id);
        if (classifier) {
          const stats = classifier.getStats();
          const msg = `Collection: ${collection.name}\nTags: ${stats.totalTags}\nDocuments: ${stats.totalDocs}`;
          new Notice(msg, 5000);
        } else {
          new Notice('Classifier not loaded');
        }
      }));
  }
}
