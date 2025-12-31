var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { PluginSettingTab, Setting, Notice } from 'obsidian';
export const DEFAULT_COLLECTION = {
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
export const DEFAULT_SETTINGS = {
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
export function migrateSettings(data) {
    var _a, _b, _c, _d, _e, _f;
    const oldData = data;
    // Already migrated
    if (oldData.collections && Array.isArray(oldData.collections)) {
        return data;
    }
    // Create default collection from old settings
    const defaultCollection = {
        id: 'default',
        name: 'Default Collection',
        folderMode: oldData.folderMode || 'all',
        includeFolders: oldData.includeFolders || [],
        excludeFolders: oldData.excludeFolders || [],
        whitelist: oldData.whitelist || [],
        blacklist: oldData.blacklist || [],
        threshold: (_a = oldData.threshold) !== null && _a !== void 0 ? _a : 0.3,
        maxTags: (_b = oldData.maxTags) !== null && _b !== void 0 ? _b : 5,
        classifierData: oldData.classifierData || null,
        enabled: true,
        lastTrained: null
    };
    console.debug('[Auto Tagger] Migrating settings to collection-based format');
    return {
        collections: [defaultCollection],
        activeCollectionId: 'default',
        autoTagOnSave: (_c = oldData.autoTagOnSave) !== null && _c !== void 0 ? _c : false,
        debugToConsole: (_d = oldData.debugToConsole) !== null && _d !== void 0 ? _d : false,
        defaultThreshold: (_e = oldData.threshold) !== null && _e !== void 0 ? _e : 0.3,
        defaultMaxTags: (_f = oldData.maxTags) !== null && _f !== void 0 ? _f : 5
    };
}
export class AutoTaggerSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    generateCollectionId() {
        return 'collection_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
    }
    createNewCollection() {
        return Object.assign({ id: this.generateCollectionId(), name: 'New Collection' }, DEFAULT_COLLECTION);
    }
    display() {
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
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.autoTagOnSave = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName('Debug to console')
            .setDesc('Show detailed debug messages in the developer console (Ctrl+Shift+I)')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.debugToConsole)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.debugToConsole = value;
            yield this.plugin.saveSettings();
        })));
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
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            const newCollection = this.createNewCollection();
            this.plugin.settings.collections.push(newCollection);
            this.plugin.settings.activeCollectionId = newCollection.id;
            yield this.plugin.saveSettings();
            this.display();
        })));
        // Display each collection
        if (this.plugin.settings.collections.length === 0) {
            containerEl.createEl('p', {
                text: 'No collections yet. Create one to start training and classifying notes.',
                cls: 'setting-item-description'
            });
        }
        else {
            for (const collection of this.plugin.settings.collections) {
                this.displayCollection(containerEl, collection);
            }
        }
    }
    displayCollection(containerEl, collection) {
        var _a;
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
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            collection.enabled = value;
            yield this.plugin.saveSettings();
        })));
        // Duplicate button
        headerSetting.addButton(button => button
            .setButtonText('Duplicate')
            .setTooltip('Create a copy of this collection')
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            const newCollection = Object.assign(Object.assign({}, collection), { id: this.generateCollectionId(), name: collection.name + ' (Copy)', classifierData: null, lastTrained: null });
            this.plugin.settings.collections.push(newCollection);
            yield this.plugin.saveSettings();
            this.display();
        })));
        // Delete button
        headerSetting.addButton(button => button
            .setButtonText('Delete')
            .setWarning()
            .setTooltip('Delete this collection')
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            var _b;
            const collectionName = collection.name;
            new Notice(`Delete collection "${collectionName}"? This cannot be undone. Save your work first!`);
            // Give user time to cancel by clicking away
            yield new Promise(resolve => setTimeout(resolve, 3000));
            this.plugin.settings.collections = this.plugin.settings.collections
                .filter(c => c.id !== collection.id);
            if (this.plugin.settings.activeCollectionId === collection.id) {
                this.plugin.settings.activeCollectionId = ((_b = this.plugin.settings.collections[0]) === null || _b === void 0 ? void 0 : _b.id) || null;
            }
            yield this.plugin.saveSettings();
            this.display();
        })));
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
            text.inputEl.addEventListener('blur', () => __awaiter(this, void 0, void 0, function* () {
                // Update the header title
                const headerNameEl = headerSetting.nameEl;
                headerNameEl.textContent = collection.name;
                yield this.plugin.saveSettings();
            }));
        });
        // Status
        const classifier = (_a = this.plugin.classifiers) === null || _a === void 0 ? void 0 : _a.get(collection.id);
        const stats = classifier === null || classifier === void 0 ? void 0 : classifier.getStats();
        if (stats && stats.totalTags > 0) {
            const statusText = `Trained on ${stats.totalDocs} documents with ${stats.totalTags} unique tags`;
            const lastTrainedText = collection.lastTrained
                ? ` (Last trained: ${new Date(collection.lastTrained).toLocaleString()})`
                : '';
            collectionContainer.createEl('p', {
                text: statusText + lastTrainedText,
                cls: 'setting-item-description auto-tagger-status'
            });
        }
        else {
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
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            collection.folderMode = value;
            yield this.plugin.saveSettings();
            this.display();
        })));
        if (collection.folderMode === 'include') {
            new Setting(collectionContainer)
                .setName('Include folders')
                .setDesc('Comma-separated list of folder paths')
                .addTextArea(text => text
                .setPlaceholder('Folder1, Folder2/Subfolder')
                .setValue(collection.includeFolders.join(', '))
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                collection.includeFolders = value
                    .split(',')
                    .map(f => f.trim())
                    .filter(f => f.length > 0);
                yield this.plugin.saveSettings();
            })));
        }
        if (collection.folderMode === 'exclude') {
            new Setting(collectionContainer)
                .setName('Exclude folders')
                .setDesc('Comma-separated list of folder paths')
                .addTextArea(text => text
                .setPlaceholder('Archive, Templates')
                .setValue(collection.excludeFolders.join(', '))
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                collection.excludeFolders = value
                    .split(',')
                    .map(f => f.trim())
                    .filter(f => f.length > 0);
                yield this.plugin.saveSettings();
            })));
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
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            collection.whitelist = value
                .split(',')
                .map(t => t.trim().toLowerCase())
                .filter(t => t.length > 0);
            yield this.plugin.saveSettings();
        })));
        new Setting(collectionContainer)
            .setName('Tag blacklist')
            .setDesc('Never suggest or train on these tags (comma-separated)')
            .addTextArea(text => text
            .setPlaceholder('Todo, Draft, Private')
            .setValue(collection.blacklist.join(', '))
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            collection.blacklist = value
                .split(',')
                .map(t => t.trim().toLowerCase())
                .filter(t => t.length > 0);
            yield this.plugin.saveSettings();
        })));
        // Show existing tags with blacklist management
        if (stats && stats.totalTags > 0) {
            const allTags = (classifier === null || classifier === void 0 ? void 0 : classifier.getAllTags()) || [];
            if (allTags.length > 0) {
                const tagSection = collectionContainer.createEl('details');
                tagSection.createEl('summary', { text: `All Tags in Collection (${allTags.length})` });
                const tagsContainer = tagSection.createEl('div', { cls: 'auto-tagger-tags-container' });
                for (const tag of allTags) {
                    const tagSetting = new Setting(tagsContainer)
                        .setName(tag)
                        .setDesc(`Used in ${classifier === null || classifier === void 0 ? void 0 : classifier.getTagDocCount(tag)} documents`);
                    const isBlacklisted = collection.blacklist.includes(tag);
                    if (isBlacklisted) {
                        tagSetting.addButton(button => button
                            .setButtonText('Remove from blacklist')
                            .onClick(() => __awaiter(this, void 0, void 0, function* () {
                            collection.blacklist = collection.blacklist.filter(t => t !== tag);
                            yield this.plugin.saveSettings();
                            this.display();
                        })));
                    }
                    else {
                        tagSetting.addButton(button => button
                            .setButtonText('Blacklist')
                            .setWarning()
                            .onClick(() => __awaiter(this, void 0, void 0, function* () {
                            if (!collection.blacklist.includes(tag)) {
                                collection.blacklist.push(tag);
                                yield this.plugin.saveSettings();
                                this.display();
                            }
                        })));
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
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            collection.threshold = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(collectionContainer)
            .setName('Maximum tags')
            .setDesc('Maximum number of tags to suggest per note')
            .addSlider(slider => slider
            .setLimits(1, 10, 1)
            .setValue(collection.maxTags)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            collection.maxTags = value;
            yield this.plugin.saveSettings();
        })));
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
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            yield this.plugin.trainCollection(collection.id);
            this.display();
        })));
        actionsSetting.addButton(button => button
            .setButtonText('Debug stats')
            .setTooltip('Show classifier statistics')
            .onClick(() => {
            var _a;
            const classifier = (_a = this.plugin.classifiers) === null || _a === void 0 ? void 0 : _a.get(collection.id);
            if (classifier) {
                const stats = classifier.getStats();
                const msg = `Collection: ${collection.name}\nTags: ${stats.totalTags}\nDocuments: ${stats.totalDocs}`;
                new Notice(msg, 5000);
            }
            else {
                new Notice('Classifier not loaded');
            }
        }));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzZXR0aW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSxPQUFPLEVBQWUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLFVBQVUsQ0FBQztBQXlDMUUsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQW9DO0lBQ2pFLFVBQVUsRUFBRSxLQUFLO0lBQ2pCLGNBQWMsRUFBRSxFQUFFO0lBQ2xCLGNBQWMsRUFBRSxFQUFFO0lBQ2xCLFNBQVMsRUFBRSxFQUFFO0lBQ2IsU0FBUyxFQUFFLEVBQUU7SUFDYixTQUFTLEVBQUUsR0FBRztJQUNkLE9BQU8sRUFBRSxDQUFDO0lBQ1YsY0FBYyxFQUFFLElBQUk7SUFDcEIsT0FBTyxFQUFFLElBQUk7SUFDYixXQUFXLEVBQUUsSUFBSTtDQUNsQixDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0sZ0JBQWdCLEdBQXVCO0lBQ2xELFdBQVcsRUFBRSxFQUFFO0lBQ2Ysa0JBQWtCLEVBQUUsSUFBSTtJQUN4QixhQUFhLEVBQUUsS0FBSztJQUNwQixjQUFjLEVBQUUsS0FBSztJQUNyQixnQkFBZ0IsRUFBRSxHQUFHO0lBQ3JCLGNBQWMsRUFBRSxDQUFDO0NBQ2xCLENBQUM7QUFFRjs7R0FFRztBQUNILE1BQU0sVUFBVSxlQUFlLENBQUMsSUFBYTs7SUFDM0MsTUFBTSxPQUFPLEdBQUcsSUFBK0IsQ0FBQztJQUVoRCxtQkFBbUI7SUFDbkIsSUFBSSxPQUFPLENBQUMsV0FBVyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7UUFDOUQsT0FBTyxJQUEwQixDQUFDO0lBQ3BDLENBQUM7SUFFRCw4Q0FBOEM7SUFDOUMsTUFBTSxpQkFBaUIsR0FBZTtRQUNwQyxFQUFFLEVBQUUsU0FBUztRQUNiLElBQUksRUFBRSxvQkFBb0I7UUFDMUIsVUFBVSxFQUFHLE9BQU8sQ0FBQyxV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VSxHQUFHLE1BQUEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLDBDQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDL0QsSUFBSSxVQUFVLEVBQUUsQ0FBQztnQkFDZixNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3BDLE1BQU0sR0FBRyxHQUFHLGVBQWUsVUFBVSxDQUFDLElBQUksV0FBVyxLQUFLLENBQUMsU0FBUyxnQkFBZ0IsS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUN0RyxJQUFJLE1BQU0sQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDeEIsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLElBQUksTUFBTSxDQUFDLHVCQUF1QixDQUFDLENBQUM7WUFDdEMsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDUixDQUFDO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHAsIFBsdWdpbiwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZywgTm90aWNlIH0gZnJvbSAnb2JzaWRpYW4nO1xyXG5pbXBvcnQgdHlwZSB7IEVtYmVkZGluZ0NsYXNzaWZpZXJEYXRhLCBFbWJlZGRpbmdDbGFzc2lmaWVyIH0gZnJvbSAnLi9lbWJlZGRpbmctY2xhc3NpZmllcic7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIENvbGxlY3Rpb24ge1xyXG4gIGlkOiBzdHJpbmc7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG4gIFxyXG4gIC8vIFNjb3BlIGRlZmluaXRpb25cclxuICBmb2xkZXJNb2RlOiAnYWxsJyB8ICdpbmNsdWRlJyB8ICdleGNsdWRlJztcclxuICBpbmNsdWRlRm9sZGVyczogc3RyaW5nW107XHJcbiAgZXhjbHVkZUZvbGRlcnM6IHN0cmluZ1tdO1xyXG4gIFxyXG4gIC8vIFRhZyBmaWx0ZXJpbmdcclxuICB3aGl0ZWxpc3Q6IHN0cmluZ1tdO1xyXG4gIGJsYWNrbGlzdDogc3RyaW5nW107XHJcbiAgXHJcbiAgLy8gQ2xhc3NpZmljYXRpb24gcGFyYW1ldGVyc1xyXG4gIHRocmVzaG9sZDogbnVtYmVyO1xyXG4gIG1heFRhZ3M6IG51bWJlcjtcclxuICBcclxuICAvLyBUcmFpbmVkIGNsYXNzaWZpZXJcclxuICBjbGFzc2lmaWVyRGF0YTogRW1iZWRkaW5nQ2xhc3NpZmllckRhdGEgfCBudWxsO1xyXG4gIFxyXG4gIC8vIE1ldGFkYXRhXHJcbiAgZW5hYmxlZDogYm9vbGVhbjtcclxuICBsYXN0VHJhaW5lZDogbnVtYmVyIHwgbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBBdXRvVGFnZ2VyU2V0dGluZ3Mge1xyXG4gIGNvbGxlY3Rpb25zOiBDb2xsZWN0aW9uW107XHJcbiAgYWN0aXZlQ29sbGVjdGlvbklkOiBzdHJpbmcgfCBudWxsO1xyXG4gIFxyXG4gIC8vIEdsb2JhbCBzZXR0aW5nc1xyXG4gIGF1dG9UYWdPblNhdmU6IGJvb2xlYW47XHJcbiAgZGVidWdUb0NvbnNvbGU6IGJvb2xlYW47XHJcbiAgXHJcbiAgLy8gRGVmYXVsdHMgZm9yIG5ldyBjb2xsZWN0aW9uc1xyXG4gIGRlZmF1bHRUaHJlc2hvbGQ6IG51bWJlcjtcclxuICBkZWZhdWx0TWF4VGFnczogbnVtYmVyO1xyXG59XHJcblxyXG5leHBvcnQgY29uc3QgREVGQVVMVF9DT0xMRUNUSU9OOiBPbWl0PENvbGxlY3Rpb24sICdpZCcgfCAnbmFtZSc+ID0ge1xyXG4gIGZvbGRlck1vZGU6ICdhbGwnLFxyXG4gIGluY2x1ZGVGb2xkZXJzOiBbXSxcclxuICBleGNsdWRlRm9sZGVyczogW10sXHJcbiAgd2hpdGVsaXN0OiBbXSxcclxuICBibGFja2xpc3Q6IFtdLFxyXG4gIHRocmVzaG9sZDogMC4zLFxyXG4gIG1heFRhZ3M6IDUsXHJcbiAgY2xhc3NpZmllckRhdGE6IG51bGwsXHJcbiAgZW5hYmxlZDogdHJ1ZSxcclxuICBsYXN0VHJhaW5lZDogbnVsbFxyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IERFRkFVTFRfU0VUVElOR1M6IEF1dG9UYWdnZXJTZXR0aW5ncyA9IHtcclxuICBjb2xsZWN0aW9uczogW10sXHJcbiAgYWN0aXZlQ29sbGVjdGlvbklkOiBudWxsLFxyXG4gIGF1dG9UYWdPblNhdmU6IGZhbHNlLFxyXG4gIGRlYnVnVG9Db25zb2xlOiBmYWxzZSxcclxuICBkZWZhdWx0VGhyZXNob2xkOiAwLjMsXHJcbiAgZGVmYXVsdE1heFRhZ3M6IDVcclxufTtcclxuXHJcbi8qKlxyXG4gKiBNaWdyYXRlIG9sZCBzZXR0aW5ncyBmb3JtYXQgdG8gbmV3IGNvbGxlY3Rpb24tYmFzZWQgZm9ybWF0XHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gbWlncmF0ZVNldHRpbmdzKGRhdGE6IHVua25vd24pOiBBdXRvVGFnZ2VyU2V0dGluZ3Mge1xyXG4gIGNvbnN0IG9sZERhdGEgPSBkYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xyXG4gIFxyXG4gIC8vIEFscmVhZHkgbWlncmF0ZWRcclxuICBpZiAob2xkRGF0YS5jb2xsZWN0aW9ucyAmJiBBcnJheS5pc0FycmF5KG9sZERhdGEuY29sbGVjdGlvbnMpKSB7XHJcbiAgICByZXR1cm4gZGF0YSBhcyBBdXRvVGFnZ2VyU2V0dGluZ3M7XHJcbiAgfVxyXG4gIFxyXG4gIC8vIENyZWF0ZSBkZWZhdWx0IGNvbGxlY3Rpb24gZnJvbSBvbGQgc2V0dGluZ3NcclxuICBjb25zdCBkZWZhdWx0Q29sbGVjdGlvbjogQ29sbGVjdGlvbiA9IHtcclxuICAgIGlkOiAnZGVmYXVsdCcsXHJcbiAgICBuYW1lOiAnRGVmYXVsdCBDb2xsZWN0aW9uJyxcclxuICAgIGZvbGRlck1vZGU6IChvbGREYXRhLmZvbGRlck1vZGUgYXMgJ2FsbCcgfCAnaW5jbHVkZScgfCAnZXhjbHVkZScpIHx8ICdhbGwnLFxyXG4gICAgaW5jbHVkZUZvbGRlcnM6IChvbGREYXRhLmluY2x1ZGVGb2xkZXJzIGFzIHN0cmluZ1tdKSB8fCBbXSxcclxuICAgIGV4Y2x1ZGVGb2xkZXJzOiAob2xkRGF0YS5leGNsdWRlRm9sZGVycyBhcyBzdHJpbmdbXSkgfHwgW10sXHJcbiAgICB3aGl0ZWxpc3Q6IChvbGREYXRhLndoaXRlbGlzdCBhcyBzdHJpbmdbXSkgfHwgW10sXHJcbiAgICBibGFja2xpc3Q6IChvbGREYXRhLmJsYWNrbGlzdCBhcyBzdHJpbmdbXSkgfHwgW10sXHJcbiAgICB0aHJlc2hvbGQ6IChvbGREYXRhLnRocmVzaG9sZCBhcyBudW1iZXIpID8/IDAuMyxcclxuICAgIG1heFRhZ3M6IChvbGREYXRhLm1heFRhZ3MgYXMgbnVtYmVyKSA/PyA1LFxyXG4gICAgY2xhc3NpZmllckRhdGE6IChvbGREYXRhLmNsYXNzaWZpZXJEYXRhIGFzIEVtYmVkZGluZ0NsYXNzaWZpZXJEYXRhKSB8fCBudWxsLFxyXG4gICAgZW5hYmxlZDogdHJ1ZSxcclxuICAgIGxhc3RUcmFpbmVkOiBudWxsXHJcbiAgfTtcclxuICBcclxuICBjb25zb2xlLmRlYnVnKCdbQXV0byBUYWdnZXJdIE1pZ3JhdGluZyBzZXR0aW5ncyB0byBjb2xsZWN0aW9uLWJhc2VkIGZvcm1hdCcpO1xyXG4gIFxyXG4gIHJldHVybiB7XHJcbiAgICBjb2xsZWN0aW9uczogW2RlZmF1bHRDb2xsZWN0aW9uXSxcclxuICAgIGFjdGl2ZUNvbGxlY3Rpb25JZDogJ2RlZmF1bHQnLFxyXG4gICAgYXV0b1RhZ09uU2F2ZTogKG9sZERhdGEuYXV0b1RhZ09uU2F2ZSBhcyBib29sZWFuKSA/PyBmYWxzZSxcclxuICAgIGRlYnVnVG9Db25zb2xlOiAob2xkRGF0YS5kZWJ1Z1RvQ29uc29sZSBhcyBib29sZWFuKSA/PyBmYWxzZSxcclxuICAgIGRlZmF1bHRUaHJlc2hvbGQ6IChvbGREYXRhLnRocmVzaG9sZCBhcyBudW1iZXIpID8/IDAuMyxcclxuICAgIGRlZmF1bHRNYXhUYWdzOiAob2xkRGF0YS5tYXhUYWdzIGFzIG51bWJlcikgPz8gNVxyXG4gIH07XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBBdXRvVGFnZ2VyU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xyXG4gIHBsdWdpbjogUGx1Z2luICYge1xyXG4gICAgc2V0dGluZ3M6IEF1dG9UYWdnZXJTZXR0aW5ncztcclxuICAgIGNsYXNzaWZpZXJzOiBNYXA8c3RyaW5nLCBFbWJlZGRpbmdDbGFzc2lmaWVyPjtcclxuICAgIHNhdmVTZXR0aW5ncygpOiBQcm9taXNlPHZvaWQ+O1xyXG4gICAgdHJhaW5Db2xsZWN0aW9uKGNvbGxlY3Rpb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcclxuICB9O1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBQbHVnaW4gJiB7XHJcbiAgICBzZXR0aW5nczogQXV0b1RhZ2dlclNldHRpbmdzO1xyXG4gICAgY2xhc3NpZmllcnM6IE1hcDxzdHJpbmcsIEVtYmVkZGluZ0NsYXNzaWZpZXI+O1xyXG4gICAgc2F2ZVNldHRpbmdzKCk6IFByb21pc2U8dm9pZD47XHJcbiAgICB0cmFpbkNvbGxlY3Rpb24oY29sbGVjdGlvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xyXG4gIH0pIHtcclxuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZW5lcmF0ZUNvbGxlY3Rpb25JZCgpOiBzdHJpbmcge1xyXG4gICAgcmV0dXJuICdjb2xsZWN0aW9uXycgKyBEYXRlLm5vdygpICsgJ18nICsgTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDIsIDExKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY3JlYXRlTmV3Q29sbGVjdGlvbigpOiBDb2xsZWN0aW9uIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGlkOiB0aGlzLmdlbmVyYXRlQ29sbGVjdGlvbklkKCksXHJcbiAgICAgIG5hbWU6ICdOZXcgQ29sbGVjdGlvbicsXHJcbiAgICAgIC4uLkRFRkFVTFRfQ09MTEVDVElPTlxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIGRpc3BsYXkoKTogdm9pZCB7XHJcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xyXG4gICAgY29udGFpbmVyRWwuZW1wdHkoKTtcclxuICAgIGNvbnRhaW5lckVsLmFkZENsYXNzKCdhdXRvLXRhZ2dlci1zZXR0aW5ncycpO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSgnQ29uZmlndXJhdGlvbicpXHJcbiAgICAgIC5zZXRIZWFkaW5nKCk7XHJcbiAgICBcclxuICAgIGNvbnN0IGludHJvVGV4dCA9IGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdkaXYnLCB7IFxyXG4gICAgICBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24gYXV0by10YWdnZXItaW50cm8nXHJcbiAgICB9KTtcclxuICAgIGludHJvVGV4dC5jcmVhdGVFbCgnc3BhbicsIHsgdGV4dDogJ0NyZWF0ZSAnIH0pO1xyXG4gICAgaW50cm9UZXh0LmNyZWF0ZUVsKCdzdHJvbmcnLCB7IHRleHQ6ICdDb2xsZWN0aW9ucycgfSk7XHJcbiAgICBpbnRyb1RleHQuY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6ICcgdG8gb3JnYW5pemUgeW91ciBub3RlcyB3aXRoIHNwZWNpYWxpemVkIGNsYXNzaWZpZXJzLiBFYWNoIENvbGxlY3Rpb24gaGFzIGl0cyBvd24gc2NvcGUsIHRhZyBmaWx0ZXJzLCBhbmQgdHJhaW5lZCBjbGFzc2lmaWVyLiBXaGVuIGEgbm90ZSBtYXRjaGVzIG11bHRpcGxlIENvbGxlY3Rpb25zLCBzdWdnZXN0aW9ucyBhcmUgbWVyZ2VkJyB9KTtcclxuICAgIGludHJvVGV4dC5jcmVhdGVFbCgnYnInKTtcclxuICAgIGludHJvVGV4dC5jcmVhdGVFbCgnYnInKTtcclxuICAgIGludHJvVGV4dC5jcmVhdGVFbCgnc3BhbicsIHsgdGV4dDogJ/CfkqEgJyB9KTtcclxuICAgIGludHJvVGV4dC5jcmVhdGVFbCgnc3Ryb25nJywgeyB0ZXh0OiAnUXVpY2sgU3RhcnQ6JyB9KTtcclxuICAgIGludHJvVGV4dC5jcmVhdGVFbCgnc3BhbicsIHsgdGV4dDogJyBDbGljayB0aGUgXCIrIE5ldyBDb2xsZWN0aW9uXCIgYnV0dG9uLCBjb25maWd1cmUgc2NvcGUgYW5kIGZpbHRlcnMsIHRoZW4gY2xpY2sgXCJUcmFpblwiJyB9KTtcclxuXHJcbiAgICAvLyBHbG9iYWwgU2V0dGluZ3NcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSgnR2xvYmFsIHNldHRpbmdzJylcclxuICAgICAgLnNldEhlYWRpbmcoKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoJ0F1dG8tdGFnIG9uIHNhdmUnKVxyXG4gICAgICAuc2V0RGVzYygnQXV0b21hdGljYWxseSBzdWdnZXN0IGFuZCBhcHBseSB0YWdzIGZyb20gYWxsIGFwcGxpY2FibGUgY29sbGVjdGlvbnMgd2hlbiBzYXZpbmcgbm90ZXMnKVxyXG4gICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b1RhZ09uU2F2ZSlcclxuICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvVGFnT25TYXZlID0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKCdEZWJ1ZyB0byBjb25zb2xlJylcclxuICAgICAgLnNldERlc2MoJ1Nob3cgZGV0YWlsZWQgZGVidWcgbWVzc2FnZXMgaW4gdGhlIGRldmVsb3BlciBjb25zb2xlIChDdHJsK1NoaWZ0K0kpJylcclxuICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXHJcbiAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmRlYnVnVG9Db25zb2xlKVxyXG4gICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmRlYnVnVG9Db25zb2xlID0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgLy8gQ29sbGVjdGlvbnMgU2VjdGlvblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKCdDb2xsZWN0aW9ucycpXHJcbiAgICAgIC5zZXRIZWFkaW5nKCk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKCdBZGQgY29sbGVjdGlvbicpXHJcbiAgICAgIC5zZXREZXNjKCdDcmVhdGUgYSBuZXcgY29sbGVjdGlvbiB3aXRoIGl0cyBvd24gc2NvcGUsIGZpbHRlcnMsIGFuZCBjbGFzc2lmaWVyJylcclxuICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT4gYnV0dG9uXHJcbiAgICAgICAgLnNldEJ1dHRvblRleHQoJysgbmV3IGNvbGxlY3Rpb24nKVxyXG4gICAgICAgIC5zZXRDdGEoKVxyXG4gICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgIGNvbnN0IG5ld0NvbGxlY3Rpb24gPSB0aGlzLmNyZWF0ZU5ld0NvbGxlY3Rpb24oKTtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbGxlY3Rpb25zLnB1c2gobmV3Q29sbGVjdGlvbik7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5hY3RpdmVDb2xsZWN0aW9uSWQgPSBuZXdDb2xsZWN0aW9uLmlkO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgLy8gRGlzcGxheSBlYWNoIGNvbGxlY3Rpb25cclxuICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb2xsZWN0aW9ucy5sZW5ndGggPT09IDApIHtcclxuICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ3AnLCB7XHJcbiAgICAgICAgdGV4dDogJ05vIGNvbGxlY3Rpb25zIHlldC4gQ3JlYXRlIG9uZSB0byBzdGFydCB0cmFpbmluZyBhbmQgY2xhc3NpZnlpbmcgbm90ZXMuJyxcclxuICAgICAgICBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nXHJcbiAgICAgIH0pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZm9yIChjb25zdCBjb2xsZWN0aW9uIG9mIHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbGxlY3Rpb25zKSB7XHJcbiAgICAgICAgdGhpcy5kaXNwbGF5Q29sbGVjdGlvbihjb250YWluZXJFbCwgY29sbGVjdGlvbik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgZGlzcGxheUNvbGxlY3Rpb24oY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBjb2xsZWN0aW9uOiBDb2xsZWN0aW9uKTogdm9pZCB7XHJcbiAgICBjb25zdCBjb2xsZWN0aW9uQ29udGFpbmVyID0gY29udGFpbmVyRWwuY3JlYXRlRWwoJ2RpdicsIHsgXHJcbiAgICAgIGNsczogJ2F1dG8tdGFnZ2VyLWNvbGxlY3Rpb24nIFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ29sbGVjdGlvbiBIZWFkZXJcclxuICAgIGNvbnN0IGhlYWRlclNldHRpbmcgPSBuZXcgU2V0dGluZyhjb2xsZWN0aW9uQ29udGFpbmVyKVxyXG4gICAgICAuc2V0TmFtZShjb2xsZWN0aW9uLm5hbWUpXHJcbiAgICAgIC5zZXRDbGFzcygnYXV0by10YWdnZXItY29sbGVjdGlvbi1oZWFkZXInKTtcclxuXHJcbiAgICAvLyBFbmFibGVkIHRvZ2dsZVxyXG4gICAgaGVhZGVyU2V0dGluZy5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxyXG4gICAgICAuc2V0VmFsdWUoY29sbGVjdGlvbi5lbmFibGVkKVxyXG4gICAgICAuc2V0VG9vbHRpcChjb2xsZWN0aW9uLmVuYWJsZWQgPyAnQ29sbGVjdGlvbiBpcyBhY3RpdmUnIDogJ0NvbGxlY3Rpb24gaXMgZGlzYWJsZWQnKVxyXG4gICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgY29sbGVjdGlvbi5lbmFibGVkID0gdmFsdWU7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAvLyBEdXBsaWNhdGUgYnV0dG9uXHJcbiAgICBoZWFkZXJTZXR0aW5nLmFkZEJ1dHRvbihidXR0b24gPT4gYnV0dG9uXHJcbiAgICAgIC5zZXRCdXR0b25UZXh0KCdEdXBsaWNhdGUnKVxyXG4gICAgICAuc2V0VG9vbHRpcCgnQ3JlYXRlIGEgY29weSBvZiB0aGlzIGNvbGxlY3Rpb24nKVxyXG4gICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgY29uc3QgbmV3Q29sbGVjdGlvbjogQ29sbGVjdGlvbiA9IHtcclxuICAgICAgICAgIC4uLmNvbGxlY3Rpb24sXHJcbiAgICAgICAgICBpZDogdGhpcy5nZW5lcmF0ZUNvbGxlY3Rpb25JZCgpLFxyXG4gICAgICAgICAgbmFtZTogY29sbGVjdGlvbi5uYW1lICsgJyAoQ29weSknLFxyXG4gICAgICAgICAgY2xhc3NpZmllckRhdGE6IG51bGwsXHJcbiAgICAgICAgICBsYXN0VHJhaW5lZDogbnVsbFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuY29sbGVjdGlvbnMucHVzaChuZXdDb2xsZWN0aW9uKTtcclxuICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICB0aGlzLmRpc3BsYXkoKTtcclxuICAgICAgfSkpO1xyXG5cclxuICAgIC8vIERlbGV0ZSBidXR0b25cclxuICAgIGhlYWRlclNldHRpbmcuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cclxuICAgICAgLnNldEJ1dHRvblRleHQoJ0RlbGV0ZScpXHJcbiAgICAgIC5zZXRXYXJuaW5nKClcclxuICAgICAgLnNldFRvb2x0aXAoJ0RlbGV0ZSB0aGlzIGNvbGxlY3Rpb24nKVxyXG4gICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgY29uc3QgY29sbGVjdGlvbk5hbWUgPSBjb2xsZWN0aW9uLm5hbWU7XHJcbiAgICAgICAgbmV3IE5vdGljZShgRGVsZXRlIGNvbGxlY3Rpb24gXCIke2NvbGxlY3Rpb25OYW1lfVwiPyBUaGlzIGNhbm5vdCBiZSB1bmRvbmUuIFNhdmUgeW91ciB3b3JrIGZpcnN0IWApO1xyXG4gICAgICAgIC8vIEdpdmUgdXNlciB0aW1lIHRvIGNhbmNlbCBieSBjbGlja2luZyBhd2F5XHJcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDMwMDApKTtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb2xsZWN0aW9ucyA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbGxlY3Rpb25zXHJcbiAgICAgICAgICAuZmlsdGVyKGMgPT4gYy5pZCAhPT0gY29sbGVjdGlvbi5pZCk7XHJcbiAgICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmFjdGl2ZUNvbGxlY3Rpb25JZCA9PT0gY29sbGVjdGlvbi5pZCkge1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYWN0aXZlQ29sbGVjdGlvbklkID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MuY29sbGVjdGlvbnNbMF0/LmlkIHx8IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgIHRoaXMuZGlzcGxheSgpO1xyXG4gICAgICB9KSk7XHJcblxyXG4gICAgLy8gQ29sbGVjdGlvbiBOYW1lXHJcbiAgICBuZXcgU2V0dGluZyhjb2xsZWN0aW9uQ29udGFpbmVyKVxyXG4gICAgICAuc2V0TmFtZSgnQ29sbGVjdGlvbiBuYW1lJylcclxuICAgICAgLmFkZFRleHQodGV4dCA9PiB7XHJcbiAgICAgICAgdGV4dFxyXG4gICAgICAgICAgLnNldFZhbHVlKGNvbGxlY3Rpb24ubmFtZSlcclxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcignRW50ZXIgY29sbGVjdGlvbiBuYW1lJylcclxuICAgICAgICAgIC5vbkNoYW5nZSgodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgY29sbGVjdGlvbi5uYW1lID0gdmFsdWUgfHwgJ1VubmFtZWQgQ29sbGVjdGlvbic7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBVcGRhdGUgaGVhZGVyIGFuZCBzYXZlIG9uIGJsdXJcclxuICAgICAgICB0ZXh0LmlucHV0RWwuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIGFzeW5jICgpID0+IHtcclxuICAgICAgICAgIC8vIFVwZGF0ZSB0aGUgaGVhZGVyIHRpdGxlXHJcbiAgICAgICAgICBjb25zdCBoZWFkZXJOYW1lRWwgPSBoZWFkZXJTZXR0aW5nLm5hbWVFbDtcclxuICAgICAgICAgIGhlYWRlck5hbWVFbC50ZXh0Q29udGVudCA9IGNvbGxlY3Rpb24ubmFtZTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAvLyBTdGF0dXNcclxuICAgIGNvbnN0IGNsYXNzaWZpZXIgPSB0aGlzLnBsdWdpbi5jbGFzc2lmaWVycz8uZ2V0KGNvbGxlY3Rpb24uaWQpO1xyXG4gICAgY29uc3Qgc3RhdHMgPSBjbGFzc2lmaWVyPy5nZXRTdGF0cygpO1xyXG4gICAgaWYgKHN0YXRzICYmIHN0YXRzLnRvdGFsVGFncyA+IDApIHtcclxuICAgICAgY29uc3Qgc3RhdHVzVGV4dCA9IGBUcmFpbmVkIG9uICR7c3RhdHMudG90YWxEb2NzfSBkb2N1bWVudHMgd2l0aCAke3N0YXRzLnRvdGFsVGFnc30gdW5pcXVlIHRhZ3NgO1xyXG4gICAgICBjb25zdCBsYXN0VHJhaW5lZFRleHQgPSBjb2xsZWN0aW9uLmxhc3RUcmFpbmVkIFxyXG4gICAgICAgID8gYCAoTGFzdCB0cmFpbmVkOiAke25ldyBEYXRlKGNvbGxlY3Rpb24ubGFzdFRyYWluZWQpLnRvTG9jYWxlU3RyaW5nKCl9KWBcclxuICAgICAgICA6ICcnO1xyXG4gICAgICBcclxuICAgICAgY29sbGVjdGlvbkNvbnRhaW5lci5jcmVhdGVFbCgncCcsIHtcclxuICAgICAgICB0ZXh0OiBzdGF0dXNUZXh0ICsgbGFzdFRyYWluZWRUZXh0LFxyXG4gICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbiBhdXRvLXRhZ2dlci1zdGF0dXMnXHJcbiAgICAgIH0pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29sbGVjdGlvbkNvbnRhaW5lci5jcmVhdGVFbCgncCcsIHtcclxuICAgICAgICB0ZXh0OiAnTm90IHRyYWluZWQuIFVzZSB0aGUgXCJUcmFpblwiIGJ1dHRvbiBiZWxvdy4nLFxyXG4gICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbiBhdXRvLXRhZ2dlci1zdGF0dXMnXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvbGRlciBTY29wZVxyXG4gICAgbmV3IFNldHRpbmcoY29sbGVjdGlvbkNvbnRhaW5lcilcclxuICAgICAgLnNldE5hbWUoJ0ZvbGRlciBzY29wZScpXHJcbiAgICAgIC5zZXRIZWFkaW5nKCk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29sbGVjdGlvbkNvbnRhaW5lcilcclxuICAgICAgLnNldE5hbWUoJ0ZvbGRlciBtb2RlJylcclxuICAgICAgLnNldERlc2MoJ1doaWNoIGZvbGRlcnMgdG8gaW5jbHVkZSBpbiB0cmFpbmluZyBhbmQgY2xhc3NpZmljYXRpb24nKVxyXG4gICAgICAuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4gZHJvcGRvd25cclxuICAgICAgICAuYWRkT3B0aW9uKCdhbGwnLCAnQWxsIGZvbGRlcnMnKVxyXG4gICAgICAgIC5hZGRPcHRpb24oJ2luY2x1ZGUnLCAnSW5jbHVkZSBzcGVjaWZpYyBmb2xkZXJzJylcclxuICAgICAgICAuYWRkT3B0aW9uKCdleGNsdWRlJywgJ0V4Y2x1ZGUgc3BlY2lmaWMgZm9sZGVycycpXHJcbiAgICAgICAgLnNldFZhbHVlKGNvbGxlY3Rpb24uZm9sZGVyTW9kZSlcclxuICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICBjb2xsZWN0aW9uLmZvbGRlck1vZGUgPSB2YWx1ZSBhcyAnYWxsJyB8ICdpbmNsdWRlJyB8ICdleGNsdWRlJztcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgIGlmIChjb2xsZWN0aW9uLmZvbGRlck1vZGUgPT09ICdpbmNsdWRlJykge1xyXG4gICAgICBuZXcgU2V0dGluZyhjb2xsZWN0aW9uQ29udGFpbmVyKVxyXG4gICAgICAgIC5zZXROYW1lKCdJbmNsdWRlIGZvbGRlcnMnKVxyXG4gICAgICAgIC5zZXREZXNjKCdDb21tYS1zZXBhcmF0ZWQgbGlzdCBvZiBmb2xkZXIgcGF0aHMnKVxyXG4gICAgICAgIC5hZGRUZXh0QXJlYSh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcignRm9sZGVyMSwgRm9sZGVyMi9TdWJmb2xkZXInKVxyXG4gICAgICAgICAgLnNldFZhbHVlKGNvbGxlY3Rpb24uaW5jbHVkZUZvbGRlcnMuam9pbignLCAnKSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgY29sbGVjdGlvbi5pbmNsdWRlRm9sZGVycyA9IHZhbHVlXHJcbiAgICAgICAgICAgICAgLnNwbGl0KCcsJylcclxuICAgICAgICAgICAgICAubWFwKGYgPT4gZi50cmltKCkpXHJcbiAgICAgICAgICAgICAgLmZpbHRlcihmID0+IGYubGVuZ3RoID4gMCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChjb2xsZWN0aW9uLmZvbGRlck1vZGUgPT09ICdleGNsdWRlJykge1xyXG4gICAgICBuZXcgU2V0dGluZyhjb2xsZWN0aW9uQ29udGFpbmVyKVxyXG4gICAgICAgIC5zZXROYW1lKCdFeGNsdWRlIGZvbGRlcnMnKVxyXG4gICAgICAgIC5zZXREZXNjKCdDb21tYS1zZXBhcmF0ZWQgbGlzdCBvZiBmb2xkZXIgcGF0aHMnKVxyXG4gICAgICAgIC5hZGRUZXh0QXJlYSh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcignQXJjaGl2ZSwgVGVtcGxhdGVzJylcclxuICAgICAgICAgIC5zZXRWYWx1ZShjb2xsZWN0aW9uLmV4Y2x1ZGVGb2xkZXJzLmpvaW4oJywgJykpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbGxlY3Rpb24uZXhjbHVkZUZvbGRlcnMgPSB2YWx1ZVxyXG4gICAgICAgICAgICAgIC5zcGxpdCgnLCcpXHJcbiAgICAgICAgICAgICAgLm1hcChmID0+IGYudHJpbSgpKVxyXG4gICAgICAgICAgICAgIC5maWx0ZXIoZiA9PiBmLmxlbmd0aCA+IDApO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBUYWcgRmlsdGVyaW5nXHJcbiAgICBuZXcgU2V0dGluZyhjb2xsZWN0aW9uQ29udGFpbmVyKVxyXG4gICAgICAuc2V0TmFtZSgnVGFnIGZpbHRlcmluZycpXHJcbiAgICAgIC5zZXRIZWFkaW5nKCk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29sbGVjdGlvbkNvbnRhaW5lcilcclxuICAgICAgLnNldE5hbWUoJ1RhZyB3aGl0ZWxpc3QnKVxyXG4gICAgICAuc2V0RGVzYygnT25seSBzdWdnZXN0IHRoZXNlIHRhZ3MgKGNvbW1hLXNlcGFyYXRlZCkuIExlYXZlIGVtcHR5IGZvciBhbGwgbGVhcm5lZCB0YWdzJylcclxuICAgICAgLmFkZFRleHRBcmVhKHRleHQgPT4gdGV4dFxyXG4gICAgICAgIC5zZXRQbGFjZWhvbGRlcignUHJvamVjdCwgSW1wb3J0YW50LCBSZXZpZXcnKVxyXG4gICAgICAgIC5zZXRWYWx1ZShjb2xsZWN0aW9uLndoaXRlbGlzdC5qb2luKCcsICcpKVxyXG4gICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIGNvbGxlY3Rpb24ud2hpdGVsaXN0ID0gdmFsdWVcclxuICAgICAgICAgICAgLnNwbGl0KCcsJylcclxuICAgICAgICAgICAgLm1hcCh0ID0+IHQudHJpbSgpLnRvTG93ZXJDYXNlKCkpXHJcbiAgICAgICAgICAgIC5maWx0ZXIodCA9PiB0Lmxlbmd0aCA+IDApO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbGxlY3Rpb25Db250YWluZXIpXHJcbiAgICAgIC5zZXROYW1lKCdUYWcgYmxhY2tsaXN0JylcclxuICAgICAgLnNldERlc2MoJ05ldmVyIHN1Z2dlc3Qgb3IgdHJhaW4gb24gdGhlc2UgdGFncyAoY29tbWEtc2VwYXJhdGVkKScpXHJcbiAgICAgIC5hZGRUZXh0QXJlYSh0ZXh0ID0+IHRleHRcclxuICAgICAgICAuc2V0UGxhY2Vob2xkZXIoJ1RvZG8sIERyYWZ0LCBQcml2YXRlJylcclxuICAgICAgICAuc2V0VmFsdWUoY29sbGVjdGlvbi5ibGFja2xpc3Quam9pbignLCAnKSlcclxuICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICBjb2xsZWN0aW9uLmJsYWNrbGlzdCA9IHZhbHVlXHJcbiAgICAgICAgICAgIC5zcGxpdCgnLCcpXHJcbiAgICAgICAgICAgIC5tYXAodCA9PiB0LnRyaW0oKS50b0xvd2VyQ2FzZSgpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKHQgPT4gdC5sZW5ndGggPiAwKTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAvLyBTaG93IGV4aXN0aW5nIHRhZ3Mgd2l0aCBibGFja2xpc3QgbWFuYWdlbWVudFxyXG4gICAgaWYgKHN0YXRzICYmIHN0YXRzLnRvdGFsVGFncyA+IDApIHtcclxuICAgICAgY29uc3QgYWxsVGFncyA9IGNsYXNzaWZpZXI/LmdldEFsbFRhZ3MoKSB8fCBbXTtcclxuICAgICAgXHJcbiAgICAgIGlmIChhbGxUYWdzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zdCB0YWdTZWN0aW9uID0gY29sbGVjdGlvbkNvbnRhaW5lci5jcmVhdGVFbCgnZGV0YWlscycpO1xyXG4gICAgICAgIHRhZ1NlY3Rpb24uY3JlYXRlRWwoJ3N1bW1hcnknLCB7IHRleHQ6IGBBbGwgVGFncyBpbiBDb2xsZWN0aW9uICgke2FsbFRhZ3MubGVuZ3RofSlgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHRhZ3NDb250YWluZXIgPSB0YWdTZWN0aW9uLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2F1dG8tdGFnZ2VyLXRhZ3MtY29udGFpbmVyJyB9KTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGNvbnN0IHRhZyBvZiBhbGxUYWdzKSB7XHJcbiAgICAgICAgICBjb25zdCB0YWdTZXR0aW5nID0gbmV3IFNldHRpbmcodGFnc0NvbnRhaW5lcilcclxuICAgICAgICAgICAgLnNldE5hbWUodGFnKVxyXG4gICAgICAgICAgICAuc2V0RGVzYyhgVXNlZCBpbiAke2NsYXNzaWZpZXI/LmdldFRhZ0RvY0NvdW50KHRhZyl9IGRvY3VtZW50c2ApO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBjb25zdCBpc0JsYWNrbGlzdGVkID0gY29sbGVjdGlvbi5ibGFja2xpc3QuaW5jbHVkZXModGFnKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgaWYgKGlzQmxhY2tsaXN0ZWQpIHtcclxuICAgICAgICAgICAgdGFnU2V0dGluZy5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxyXG4gICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdSZW1vdmUgZnJvbSBibGFja2xpc3QnKVxyXG4gICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbGxlY3Rpb24uYmxhY2tsaXN0ID0gY29sbGVjdGlvbi5ibGFja2xpc3QuZmlsdGVyKHQgPT4gdCAhPT0gdGFnKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XHJcbiAgICAgICAgICAgICAgfSkpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGFnU2V0dGluZy5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxyXG4gICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdCbGFja2xpc3QnKVxyXG4gICAgICAgICAgICAgIC5zZXRXYXJuaW5nKClcclxuICAgICAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWNvbGxlY3Rpb24uYmxhY2tsaXN0LmluY2x1ZGVzKHRhZykpIHtcclxuICAgICAgICAgICAgICAgICAgY29sbGVjdGlvbi5ibGFja2xpc3QucHVzaCh0YWcpO1xyXG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgfSkpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIENsYXNzaWZpY2F0aW9uIFBhcmFtZXRlcnNcclxuICAgIG5ldyBTZXR0aW5nKGNvbGxlY3Rpb25Db250YWluZXIpXHJcbiAgICAgIC5zZXROYW1lKCdDbGFzc2lmaWNhdGlvbiBwYXJhbWV0ZXJzJylcclxuICAgICAgLnNldEhlYWRpbmcoKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb2xsZWN0aW9uQ29udGFpbmVyKVxyXG4gICAgICAuc2V0TmFtZSgnU2ltaWxhcml0eSB0aHJlc2hvbGQnKVxyXG4gICAgICAuc2V0RGVzYygnTWluaW11bSBlbWJlZGRpbmcgc2ltaWxhcml0eSAoMC4xLTAuNykuIExvd2VyID0gbW9yZSB0YWdzIHN1Z2dlc3RlZCcpXHJcbiAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHNsaWRlclxyXG4gICAgICAgIC5zZXRMaW1pdHMoMC4xLCAwLjcsIDAuMDUpXHJcbiAgICAgICAgLnNldFZhbHVlKGNvbGxlY3Rpb24udGhyZXNob2xkKVxyXG4gICAgICAgIC5zZXREeW5hbWljVG9vbHRpcCgpXHJcbiAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgY29sbGVjdGlvbi50aHJlc2hvbGQgPSB2YWx1ZTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb2xsZWN0aW9uQ29udGFpbmVyKVxyXG4gICAgICAuc2V0TmFtZSgnTWF4aW11bSB0YWdzJylcclxuICAgICAgLnNldERlc2MoJ01heGltdW0gbnVtYmVyIG9mIHRhZ3MgdG8gc3VnZ2VzdCBwZXIgbm90ZScpXHJcbiAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHNsaWRlclxyXG4gICAgICAgIC5zZXRMaW1pdHMoMSwgMTAsIDEpXHJcbiAgICAgICAgLnNldFZhbHVlKGNvbGxlY3Rpb24ubWF4VGFncylcclxuICAgICAgICAuc2V0RHluYW1pY1Rvb2x0aXAoKVxyXG4gICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIGNvbGxlY3Rpb24ubWF4VGFncyA9IHZhbHVlO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgIC8vIEFjdGlvbnNcclxuICAgIG5ldyBTZXR0aW5nKGNvbGxlY3Rpb25Db250YWluZXIpXHJcbiAgICAgIC5zZXROYW1lKCdBY3Rpb25zJylcclxuICAgICAgLnNldEhlYWRpbmcoKTtcclxuXHJcbiAgICBjb25zdCBhY3Rpb25zU2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbGxlY3Rpb25Db250YWluZXIpXHJcbiAgICAgIC5zZXROYW1lKCdDbGFzc2lmaWVyIGFjdGlvbnMnKTtcclxuXHJcbiAgICBhY3Rpb25zU2V0dGluZy5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxyXG4gICAgICAuc2V0QnV0dG9uVGV4dCgnVHJhaW4nKVxyXG4gICAgICAuc2V0Q3RhKClcclxuICAgICAgLnNldFRvb2x0aXAoJ1RyYWluIGNsYXNzaWZpZXIgb24gbm90ZXMgaW4gc2NvcGUnKVxyXG4gICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4udHJhaW5Db2xsZWN0aW9uKGNvbGxlY3Rpb24uaWQpO1xyXG4gICAgICAgIHRoaXMuZGlzcGxheSgpO1xyXG4gICAgICB9KSk7XHJcblxyXG4gICAgYWN0aW9uc1NldHRpbmcuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cclxuICAgICAgLnNldEJ1dHRvblRleHQoJ0RlYnVnIHN0YXRzJylcclxuICAgICAgLnNldFRvb2x0aXAoJ1Nob3cgY2xhc3NpZmllciBzdGF0aXN0aWNzJylcclxuICAgICAgLm9uQ2xpY2soKCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGNsYXNzaWZpZXIgPSB0aGlzLnBsdWdpbi5jbGFzc2lmaWVycz8uZ2V0KGNvbGxlY3Rpb24uaWQpO1xyXG4gICAgICAgIGlmIChjbGFzc2lmaWVyKSB7XHJcbiAgICAgICAgICBjb25zdCBzdGF0cyA9IGNsYXNzaWZpZXIuZ2V0U3RhdHMoKTtcclxuICAgICAgICAgIGNvbnN0IG1zZyA9IGBDb2xsZWN0aW9uOiAke2NvbGxlY3Rpb24ubmFtZX1cXG5UYWdzOiAke3N0YXRzLnRvdGFsVGFnc31cXG5Eb2N1bWVudHM6ICR7c3RhdHMudG90YWxEb2NzfWA7XHJcbiAgICAgICAgICBuZXcgTm90aWNlKG1zZywgNTAwMCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIG5ldyBOb3RpY2UoJ0NsYXNzaWZpZXIgbm90IGxvYWRlZCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSkpO1xyXG4gIH1cclxufVxyXG4iXX0=