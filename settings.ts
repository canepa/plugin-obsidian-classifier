import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { ClassifierData } from './classifier';

export interface AutoTaggerSettings {
  // Folder filtering
  folderMode: 'all' | 'include' | 'exclude';
  includeFolders: string[];
  excludeFolders: string[];
  
  // Tag filtering
  whitelist: string[];
  blacklist: string[];
  
  // Classification parameters
  threshold: number;
  maxTags: number;
  
  // Auto-tagging
  autoTagOnSave: boolean;
  
  // Classifier data
  classifierData: ClassifierData | null;
}

export const DEFAULT_SETTINGS: AutoTaggerSettings = {
  folderMode: 'all',
  includeFolders: [],
  excludeFolders: [],
  whitelist: [],
  blacklist: [],
  threshold: 0.1,
  maxTags: 5,
  autoTagOnSave: false,
  classifierData: null
};

export class AutoTaggerSettingTab extends PluginSettingTab {
  plugin: Plugin & {
    settings: AutoTaggerSettings;
    classifier: any;
    saveSettings(): Promise<void>;
    trainClassifier(): Promise<void>;
  };

  constructor(app: App, plugin: any) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Auto Tagger Settings' });

    // Folder Mode
    new Setting(containerEl)
      .setName('Folder mode')
      .setDesc('Choose which folders to process')
      .addDropdown(dropdown => dropdown
        .addOption('all', 'All folders')
        .addOption('include', 'Include specific folders')
        .addOption('exclude', 'Exclude specific folders')
        .setValue(this.plugin.settings.folderMode)
        .onChange(async (value) => {
          this.plugin.settings.folderMode = value as 'all' | 'include' | 'exclude';
          await this.plugin.saveSettings();
          this.display();
        }));

    // Include Folders
    if (this.plugin.settings.folderMode === 'include') {
      new Setting(containerEl)
        .setName('Include folders')
        .setDesc('Comma-separated list of folder paths to include')
        .addTextArea(text => text
          .setPlaceholder('folder1, folder2/subfolder')
          .setValue(this.plugin.settings.includeFolders.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.includeFolders = value
              .split(',')
              .map(f => f.trim())
              .filter(f => f.length > 0);
            await this.plugin.saveSettings();
          }));
    }

    // Exclude Folders
    if (this.plugin.settings.folderMode === 'exclude') {
      new Setting(containerEl)
        .setName('Exclude folders')
        .setDesc('Comma-separated list of folder paths to exclude')
        .addTextArea(text => text
          .setPlaceholder('archive, templates')
          .setValue(this.plugin.settings.excludeFolders.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.excludeFolders = value
              .split(',')
              .map(f => f.trim())
              .filter(f => f.length > 0);
            await this.plugin.saveSettings();
          }));
    }

    containerEl.createEl('h3', { text: 'Tag Filtering' });

    // Whitelist
    new Setting(containerEl)
      .setName('Tag whitelist')
      .setDesc('Only suggest these tags (comma-separated). Leave empty to suggest all tags.')
      .addTextArea(text => text
        .setPlaceholder('project, important, review')
        .setValue(this.plugin.settings.whitelist.join(', '))
        .onChange(async (value) => {
          this.plugin.settings.whitelist = value
            .split(',')
            .map(t => t.trim().toLowerCase())
            .filter(t => t.length > 0);
          await this.plugin.saveSettings();
        }));

    // Blacklist
    new Setting(containerEl)
      .setName('Tag blacklist')
      .setDesc('Never suggest or train on these tags (comma-separated)')
      .addTextArea(text => text
        .setPlaceholder('todo, draft, private')
        .setValue(this.plugin.settings.blacklist.join(', '))
        .onChange(async (value) => {
          this.plugin.settings.blacklist = value
            .split(',')
            .map(t => t.trim().toLowerCase())
            .filter(t => t.length > 0);
          await this.plugin.saveSettings();
        }));

    // Show all tags with blacklist buttons
    const classifierStats = this.plugin.classifier?.getStats();
    if (classifierStats && classifierStats.totalTags > 0) {
      containerEl.createEl('h4', { text: 'All Tags in Classifier' });
      
      const allTags = Object.keys(this.plugin.classifier.tagDocCounts || {}).sort();
      
      if (allTags.length > 0) {
        const tagsContainer = containerEl.createEl('div', { cls: 'auto-tagger-tags-list' });
        tagsContainer.style.maxHeight = '300px';
        tagsContainer.style.overflowY = 'auto';
        tagsContainer.style.border = '1px solid var(--background-modifier-border)';
        tagsContainer.style.borderRadius = '4px';
        tagsContainer.style.padding = '8px';
        tagsContainer.style.marginTop = '8px';
        
        for (const tag of allTags) {
          const tagSetting = new Setting(tagsContainer)
            .setName(tag)
            .setDesc(`Used in ${this.plugin.classifier.tagDocCounts[tag]} documents`);
          
          const isBlacklisted = this.plugin.settings.blacklist.includes(tag);
          
          if (isBlacklisted) {
            tagSetting.addButton(button => button
              .setButtonText('Remove from Blacklist')
              .onClick(async () => {
                this.plugin.settings.blacklist = this.plugin.settings.blacklist.filter(t => t !== tag);
                await this.plugin.saveSettings();
                this.display();
              }));
          } else {
            tagSetting.addButton(button => button
              .setButtonText('Add to Blacklist')
              .setWarning()
              .onClick(async () => {
                if (!this.plugin.settings.blacklist.includes(tag)) {
                  this.plugin.settings.blacklist.push(tag);
                  await this.plugin.saveSettings();
                  this.display();
                }
              }));
          }
        }
      }
    }

    containerEl.createEl('h3', { text: 'Classification Parameters' });

    // Threshold
    new Setting(containerEl)
      .setName('Confidence threshold')
      .setDesc('Minimum confidence (0-1) for tag suggestions')
      .addSlider(slider => slider
        .setLimits(0, 1, 0.05)
        .setValue(this.plugin.settings.threshold)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.threshold = value;
          await this.plugin.saveSettings();
        }));

    // Max Tags
    new Setting(containerEl)
      .setName('Maximum tags')
      .setDesc('Maximum number of tags to suggest per note')
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.maxTags)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.maxTags = value;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl('h3', { text: 'Auto-Tagging' });

    // Auto-tag on save
    new Setting(containerEl)
      .setName('Auto-tag on save')
      .setDesc('Automatically suggest and apply tags when saving notes')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoTagOnSave)
        .onChange(async (value) => {
          this.plugin.settings.autoTagOnSave = value;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl('h3', { text: 'Classifier Training' });

    const stats = this.plugin.classifier?.getStats();
    if (stats && stats.totalDocs > 0) {
      containerEl.createEl('p', { 
        text: `Trained on ${stats.totalDocs} documents with ${stats.totalTags} unique tags` 
      });
    } else {
      containerEl.createEl('p', { 
        text: 'Classifier not trained yet. Click "Train Classifier" to start.' 
      });
    }

    // Train classifier button
    new Setting(containerEl)
      .setName('Train classifier')
      .setDesc('Train the classifier on all your existing tagged notes')
      .addButton(button => button
        .setButtonText('Train Classifier')
        .setCta()
        .onClick(async () => {
          button.setDisabled(true);
          button.setButtonText('Training...');
          try {
            await this.plugin.trainClassifier();
            this.display(); // Refresh to show updated stats
          } catch (error) {
            console.error('Training failed:', error);
          } finally {
            button.setDisabled(false);
            button.setButtonText('Train Classifier');
          }
        }));

    // Clear classifier button
    new Setting(containerEl)
      .setName('Clear classifier data')
      .setDesc('Reset the classifier and remove all training data')
      .addButton(button => button
        .setButtonText('Clear')
        .setWarning()
        .onClick(async () => {
          this.plugin.classifier.reset();
          this.plugin.settings.classifierData = null;
          await this.plugin.saveSettings();
          this.display();
        }));
  }
}
