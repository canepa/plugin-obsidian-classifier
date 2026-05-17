import { App, Modal, Notice, Plugin, TFile, parseYaml, stringifyYaml } from 'obsidian';
import { EmbeddingClassifier } from './embedding-classifier';
import { AdvancedEmbeddingClassifier } from './advanced-classifier';
import { AutoTaggerSettings, AutoTaggerSettingTab, DEFAULT_SETTINGS, migrateSettings, Collection, TagDictionary } from './settings';
import { isRemoteDictionarySource, parseLegacyDictionaryText, readDictionaryRaw } from './dictionary-utils';

/** Internal normalised representation of a loaded dictionary. */
interface LoadedDictionary {
  tags: string[];
  stopwords: string[];
  blacklist: string[];
  microToMacros: Record<string, string[]>;
}

const EMPTY_DICTIONARY: LoadedDictionary = { tags: [], stopwords: [], blacklist: [], microToMacros: {} };

export default class AutoTaggerPlugin extends Plugin {
  settings: AutoTaggerSettings;
  classifiers: Map<string, EmbeddingClassifier | AdvancedEmbeddingClassifier> = new Map();

  private debug(...args: unknown[]) {
    if (this.settings?.debugToConsole) {
      console.log(...args);
    }
  }

  async onload() {
    await this.loadSettings();
    
    // Load all collection classifiers
    for (const collection of this.settings.collections) {
      if (collection.classifierData) {
        // Create classifier based on type
        const classifier = collection.classifierType === 'advanced'
          ? new AdvancedEmbeddingClassifier()
          : new EmbeddingClassifier();
        
        classifier.setDebugEnabled(this.settings.debugToConsole);
        try {
          classifier.import(collection.classifierData);
          this.classifiers.set(collection.id, classifier);
          const stats = classifier.getStats();
          const typeLabel = collection.classifierType === 'advanced' ? 'Advanced' : 'Basic';
          this.debug(`[Auto Tagger] Loaded ${typeLabel} classifier for "${collection.name}" with ${stats.totalTags} tags trained on ${stats.totalDocs} documents`);
        } catch (e) {
          console.error(`[Auto Tagger] Failed to load classifier for "${collection.name}":`, e);
        }
      }
    }
    
    if (this.settings.collections.length === 0) {
      this.debug('[Auto Tagger] No collections found. Create one in settings to get started.');
    }

    // Add ribbon icon
    this.addRibbonIcon('tag', 'Suggest tags with autotagger', () => {
      void this.showTagSuggestions();
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
      callback: () => void this.showTagSuggestions()
    });

    this.addCommand({
      id: 'auto-tag-current-integrate',
      name: 'Auto-tag current note (integrate mode)',
      callback: () => void this.autoTagCurrentNote('integrate')
    });

    this.addCommand({
      id: 'tag-all-notes-integrate',
      name: 'Batch tag all notes (from all collections)',
      callback: () => void this.tagAllNotes('integrate')
    });

    this.addCommand({
      id: 'tag-folder-integrate',
      name: 'Batch tag folder',
      callback: () => void this.tagCurrentFolder('integrate')
    });

    // Auto-tag on save
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (this.settings.autoTagOnSave && file instanceof TFile && file.extension === 'md') {
          if (this.shouldProcessFile(file)) {
            void this.autoTagFile(file);
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
    
    // Migrate existing collections to have fields added in later versions
    for (const collection of this.settings.collections) {
      if (!collection.classifierType)               collection.classifierType    = 'basic';
      if (collection.tagDictionaryPath === undefined)  collection.tagDictionaryPath  = '';
      if (collection.tagDictionarySnapshot === undefined) collection.tagDictionarySnapshot = '';
      if (collection.dictionaryMode    === undefined)  collection.dictionaryMode    = 'learning';
      if (collection.additionalTags    === undefined)  collection.additionalTags    = [];
      if (collection.additionalStopwords === undefined) collection.additionalStopwords = [];
    }
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
  async parseFile(file: TFile): Promise<{ frontmatter: Record<string, unknown>, content: string, raw: string }> {
    const raw = await this.app.vault.read(file);
    
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    
    if (match) {
      try {
        const frontmatter = parseYaml(match[1]) || {};
        return { frontmatter, content: match[2], raw };
        } catch {
          return { frontmatter: {}, content: raw, raw };
        }
    }
    
    return { frontmatter: {}, content: raw, raw };
  }

  /**
   * Get tags from frontmatter (without filtering for training purposes)
   */
  getTagsFromFrontmatter(frontmatter: Record<string, unknown>): string[] {
    let tags: string[] = [];
    
    if (Array.isArray(frontmatter.tags)) {
      tags = frontmatter.tags.map((t: unknown) => String(t).toLowerCase());
    } else if (typeof frontmatter.tags === 'string') {
      tags = [frontmatter.tags.toLowerCase()];
    }
    
    return tags;
  }

  /**
   * Parse a JSON dictionary string into a LoadedDictionary.
   * Returns EMPTY_DICTIONARY on invalid JSON or missing `tags` field.
   */
  private parseDictionaryJson(raw: string, source: string): LoadedDictionary {
    try {
      const parsed = JSON.parse(raw) as TagDictionary;
      if (!Array.isArray(parsed.tags)) {
        console.error(`[loadTagDictionary] JSON at "${source}" is missing required "tags" array`);
        return EMPTY_DICTIONARY;
      }
      const normalise = (arr?: string[]): string[] =>
        (arr ?? []).map(s => s.trim().toLowerCase()).filter(s => s.length > 0);

      const microToMacros: Record<string, string[]> = {};
      if (parsed.macros && typeof parsed.macros === 'object') {
        for (const [macroRaw, microsRaw] of Object.entries(parsed.macros)) {
          const macro = macroRaw.trim().toLowerCase();
          if (!macro) continue;
          const micros = normalise(Array.isArray(microsRaw) ? microsRaw : []);
          for (const micro of micros) {
            if (!microToMacros[micro]) microToMacros[micro] = [];
            if (!microToMacros[micro].includes(macro)) {
              microToMacros[micro].push(macro);
            }
          }
        }
      }

      // Expand aliases: add both the alias and the canonical tag into `tags`
      const aliasTags: string[] = [];
      if (parsed.aliases) {
        for (const [alias, canonical] of Object.entries(parsed.aliases)) {
          const aliasNorm = alias.trim().toLowerCase();
          const canonicalNorm = canonical.trim().toLowerCase();
          aliasTags.push(aliasNorm);
          aliasTags.push(canonicalNorm);

          // Inherit macro mapping from canonical tags to aliases
          const inherited = microToMacros[canonicalNorm];
          if (inherited && inherited.length > 0) {
            if (!microToMacros[aliasNorm]) microToMacros[aliasNorm] = [];
            for (const macro of inherited) {
              if (!microToMacros[aliasNorm].includes(macro)) {
                microToMacros[aliasNorm].push(macro);
              }
            }
          }
        }
      }

      const tags = [...new Set([...normalise(parsed.tags), ...aliasTags])];
      return {
        tags,
        stopwords: normalise(parsed.stopwords),
        blacklist: normalise(parsed.blacklist),
        microToMacros,
      };
    } catch (err) {
      console.error(`[loadTagDictionary] Failed to parse JSON from "${source}":`, err);
      return EMPTY_DICTIONARY;
    }
  }

  /**
   * Load a tag dictionary from:
   *  - a remote URL  (starts with http:// or https://)
   *  - a local vault .json file  (ends with .json)
   *  - a local vault text file   (legacy: one tag per line, # comments ignored)
   */
  private async loadTagDictionary(source: string): Promise<LoadedDictionary> {
    if (!source) return EMPTY_DICTIONARY;
    try {
      const content = await readDictionaryRaw(this.app, source);
      const isRemote = isRemoteDictionarySource(source);
      const isJson = source.toLowerCase().endsWith('.json');

      if (isRemote || isJson) {
        const loaded = this.parseDictionaryJson(content, source);
        const sourceType = isRemote ? 'Remote' : 'JSON';
        this.debug(`[loadTagDictionary] ${sourceType}: loaded ${loaded.tags.length} tags, ${loaded.stopwords.length} stopwords, ${loaded.blacklist.length} blacklisted from ${source}`);
        return loaded;
      }

      const tags = parseLegacyDictionaryText(content);
      this.debug(`[loadTagDictionary] Legacy text: loaded ${tags.length} tags from ${source}`);
      return { tags, stopwords: [], blacklist: [], microToMacros: {} };

    } catch (error) {
      console.error(`[loadTagDictionary] Error loading dictionary from "${source}":`, error);
      return EMPTY_DICTIONARY;
    }
  }

  private loadTagDictionaryFromSnapshot(raw: string, sourceHint: string): LoadedDictionary {
    const trimmed = raw.trim();
    if (!trimmed) return EMPTY_DICTIONARY;

    const likelyJson = isRemoteDictionarySource(sourceHint)
      || sourceHint.toLowerCase().endsWith('.json')
      || trimmed.startsWith('{');

    if (likelyJson) {
      const parsed = this.parseDictionaryJson(trimmed, `${sourceHint}#snapshot`);
      if (parsed.tags.length > 0 || parsed.stopwords.length > 0 || parsed.blacklist.length > 0 || Object.keys(parsed.microToMacros).length > 0) {
        return parsed;
      }
    }

    const tags = parseLegacyDictionaryText(trimmed);
    return { tags, stopwords: [], blacklist: [], microToMacros: {} };
  }

  private async loadTagDictionaryForCollection(collection: Collection): Promise<LoadedDictionary> {
    if (collection.tagDictionaryPath) {
      const loaded = await this.loadTagDictionary(collection.tagDictionaryPath);
      if (loaded.tags.length > 0 || loaded.stopwords.length > 0 || loaded.blacklist.length > 0 || Object.keys(loaded.microToMacros).length > 0) {
        return loaded;
      }
    }

    if (collection.tagDictionarySnapshot) {
      const fallback = this.loadTagDictionaryFromSnapshot(
        collection.tagDictionarySnapshot,
        collection.tagDictionaryPath || 'snapshot'
      );
      if (fallback.tags.length > 0 || fallback.stopwords.length > 0 || fallback.blacklist.length > 0 || Object.keys(fallback.microToMacros).length > 0) {
        this.debug(`[loadTagDictionary] Using embedded snapshot for collection "${collection.name}"`);
      }
      return fallback;
    }

    return EMPTY_DICTIONARY;
  }

  private promoteMacroTags(
    matchedMicroTags: string[],
    dictionary: LoadedDictionary,
    existingTags: string[],
    maxMacroTags: number = 2
  ): string[] {
    const macroScores = new Map<string, number>();
    for (const microTag of matchedMicroTags) {
      const macros = dictionary.microToMacros[microTag] ?? [];
      for (const macro of macros) {
        macroScores.set(macro, (macroScores.get(macro) ?? 0) + 1);
      }
    }

    if (macroScores.size === 0) return [];

    return Array.from(macroScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([macro]) => macro)
      .filter(macro => !dictionary.blacklist.includes(macro))
      .filter(macro => !existingTags.includes(macro))
      .slice(0, maxMacroTags);
  }

  /**
   * Match content to predefined tags using TF-IDF similarity
   */
  private matchContentToTags(
    text: string,
    title: string,
    availableTags: string[],
    maxTags: number = 5,
    extraStopwords: string[] = [],
    excludedTags: string[] = [],
    blacklistedTags: string[] = []
  ): string[] {
    console.log(`[AUTO-TAGGER] matchContentToTags START: ${availableTags.length} tags, maxTags=${maxTags}, extraStopwords=${extraStopwords.length}`);
    
    const combinedText = `${title} ${title} ${title} ${text}`.toLowerCase(); // Weight title 3x
    const stopSet = new Set(extraStopwords.map(s => s.toLowerCase()));
    const words = combinedText.replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stopSet.has(w));
    
    console.log(`[AUTO-TAGGER] Extracted ${words.length} words: ${words.slice(0, 20).join(', ')}...`);
    
    if (words.length === 0) {
      console.log(`[AUTO-TAGGER] WARNING: No valid words extracted!`);
      return [];
    }
    
    // Score each tag based on how well it matches the content
    const tagScores: Record<string, number> = {};
    let scoredCount = 0;
    
    for (const tag of availableTags) {
      const tagWords = tag.split(/[-_\s]+/); // Split multi-word tags
      let score = 0;
      
      for (const tagWord of tagWords) {
        if (!tagWord) continue; // Skip empty splits
        
        // Count occurrences of tag word in content (with partial/stem matching)
        const occurrences = words.filter(w => {
          // Exact match
          if (w === tagWord) return true;
          // Partial match (tag word is prefix or suffix)
          if (w.includes(tagWord) || tagWord.includes(w)) return true;
          // Stem-like matching: first 3+ chars match
          if (tagWord.length >= 3 && w.length >= 3 && w.startsWith(tagWord.substring(0, 3))) return true;
          return false;
        }).length;
        
        score += occurrences;
        
        // Bonus for exact matches
        if (words.includes(tagWord)) {
          score += 5;
        }
        
        // Bonus for title matches
        if (title.toLowerCase().includes(tagWord)) {
          score += 10;
        }
      }
      
      if (score > 0) {
        tagScores[tag] = score;
        scoredCount++;
        if (scoredCount <= 10) {
          console.log(`[AUTO-TAGGER] Tag "${tag}" scored ${score}`);
        }
      }
    }
    
    console.log(`[AUTO-TAGGER] Total ${scoredCount} tags scored > 0, returning top ${Math.min(maxTags, Object.keys(tagScores).length)}`);
    
    const excluded = new Set(excludedTags.map(t => t.toLowerCase()));
    const blacklisted = new Set(blacklistedTags.map(t => t.toLowerCase()));

    // Return top tags sorted by score. Filter before truncation so blocked tags don't consume top slots.
    const result = Object.entries(tagScores)
      .sort((a, b) => b[1] - a[1])
      .filter(([tag]) => !blacklisted.has(tag.toLowerCase()))
      .filter(([tag]) => !excluded.has(tag.toLowerCase()))
      .slice(0, maxTags)
      .map(([tag]) => tag);
    
    console.log(`[AUTO-TAGGER] matchContentToTags RETURN: ${result.length} tags`);
    return result;
  }

  /**
   * Extract keywords from text to use as auto-generated tags
   */
  private extractKeywordsAsTags(text: string, title: string, maxTags: number = 5, extraStopwords: string[] = []): string[] {
    // Common words to exclude
    const stopWords = new Set([
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 
      'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from',
      'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would',
      'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which',
      'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
      'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see',
      'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think',
      'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well',
      'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
      'using', 'used', 'best', 'guide', 'need', 'here', 'more', 'much', 'such', 'very',
      ...extraStopwords,
    ]);

    // Check if a word is valid (not a number, not technical notation)
    const isValidKeyword = (word: string): boolean => {
      // Reject pure numbers
      if (/^\d+$/.test(word)) return false;
      
      // Reject numbers with units (100vh, 12px, 5rem, etc)
      if (/^\d+[a-z]{1,4}$/.test(word)) return false;
      
      // Reject hex codes
      if (/^[0-9a-f]{3,8}$/.test(word)) return false;
      
      // Reject words that are mostly numbers
      const digitCount = (word.match(/\d/g) || []).length;
      if (digitCount / word.length > 0.5) return false;
      
      // Reject very short words (less than 3 chars)
      if (word.length < 3) return false;
      
      // Reject single letters repeated
      if (/^(.)\1+$/.test(word)) return false;
      
      return true;
    };

    // Extract words from title (keep original case to detect capitalized terms)
    const titleWordsRaw = title.replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    const titleWords = titleWordsRaw.map(w => w.toLowerCase()).filter(w => !stopWords.has(w) && isValidKeyword(w));
    
    // Detect capitalized terms in title (likely important nouns/concepts)
    const capitalizedTerms = titleWordsRaw
      .filter(w => /^[A-Z]/.test(w) && w.length > 2 && !stopWords.has(w.toLowerCase()) && isValidKeyword(w.toLowerCase()))
      .map(w => w.toLowerCase());
    
    // Extract words from content
    const contentWords = text.toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w) && isValidKeyword(w));

    // Count word frequencies with intelligent weighting
    const wordFreq: Record<string, number> = {};
    
    // Capitalized terms get 5x weight (likely proper nouns or key concepts)
    for (const word of capitalizedTerms) {
      wordFreq[word] = (wordFreq[word] || 0) + 5;
    }
    
    // Title words get 3x weight
    for (const word of titleWords) {
      wordFreq[word] = (wordFreq[word] || 0) + 3;
    }
    
    // Content words get 1x weight
    for (const word of contentWords) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }

    // Sort by frequency and take top keywords
    const keywords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxTags)
      .map(([word]) => word);

    return keywords;
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

    const typeLabel = collection.classifierType === 'advanced' ? 'Advanced' : 'Basic';
    const notice = new Notice(`Training ${typeLabel} classifier for "${collection.name}"...`, 0);
    
    // Create classifier based on type
    const classifier = collection.classifierType === 'advanced'
      ? new AdvancedEmbeddingClassifier()
      : new EmbeddingClassifier();
    
    classifier.setDebugEnabled(this.settings.debugToConsole);
    const files = this.getFilesInScopeForCollection(collection);
    const taggedFiles: TFile[] = [];
    
    this.debug(`[Training] Found ${files.length} files in scope for collection "${collection.name}"`);
    
    // Load tag dictionary if specified
    const dictionary = await this.loadTagDictionaryForCollection(collection);
    const usingDictionary = dictionary.tags.length > 0;

    // Merge blacklist: collection-level + dictionary-level
    const dictionaryBlacklist = new Set<string>([
      ...collection.blacklist.map(t => t.toLowerCase()),
      ...dictionary.blacklist,
    ]);
    
    if (usingDictionary) {
      this.debug(`[Training] Using tag dictionary with ${dictionary.tags.length} predefined tags`);
      if (dictionary.stopwords.length > 0) {
        this.debug(`[Training] Dictionary provides ${dictionary.stopwords.length} extra stopwords`);
      }
      if (dictionary.blacklist.length > 0) {
        this.debug(`[Training] Dictionary blacklist: ${dictionary.blacklist.join(', ')}`);
      }
    } else {
      this.debug(`[Training] No tag dictionary - will auto-extract keywords`);
    }
    
    // Train on explicitly tagged notes
    let filesChecked = 0;
    for (const file of files) {
      const { frontmatter, content } = await this.parseFile(file);
      let tags = this.getTagsFromFrontmatter(frontmatter);
      
      // If no tags in frontmatter, use tag dictionary or auto-extract
      if (tags.length === 0) {
        const title = String(frontmatter.title || file.basename);
        
        if (usingDictionary) {
          // Match content to predefined tags, then filter out blacklisted ones
          tags = this.matchContentToTags(
            content,
            title,
            dictionary.tags,
            collection.maxTags,
            [],
            [],
            Array.from(dictionaryBlacklist)
          );
          
          if (filesChecked < 3) {
            this.debug(`[Training] File "${file.basename}": matched ${tags.length} dictionary tags: ${tags.join(', ')}`);
          }
        } else {
          // Auto-extract keywords from content, passing dictionary stopwords
          tags = this.extractKeywordsAsTags(content, title, collection.maxTags, dictionary.stopwords)
            .filter(t => !dictionaryBlacklist.has(t));
          
          if (filesChecked < 3) {
            this.debug(`[Training] File "${file.basename}": auto-extracted ${tags.length} tags: ${tags.join(', ')}`);
          }
        }
      } else {
        // Filter frontmatter tags against the merged blacklist too
        tags = tags.filter(t => !dictionaryBlacklist.has(t));
        if (filesChecked < 3) {
          this.debug(`[Training] File "${file.basename}": using ${tags.length} frontmatter tags: ${tags.join(', ')}`);
        }
      }
      
      filesChecked++;
      
      if (tags.length > 0) {
        classifier.train(content, tags);
        taggedFiles.push(file);
      }
    }
    
    this.debug(`[Training] Processed ${files.length} files, found ${taggedFiles.length} with tags`);
    
    // Finalize training
    classifier.finalizeTraining();
    
    this.debug(`[Training] Collection "${collection.name}" (${typeLabel}): trained on ${taggedFiles.length} tagged notes`);
    
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
            void this.trainAllCollections();
          } else {
            this.debugAllCollections();
          }
        } else {
          // Execute for single collection
          if (operation === 'train') {
            void this.trainCollection(collectionId);
          } else {
            void this.debugCollection(collectionId);
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
    
    this.debug(`[getSuggestions] File: ${file.basename}`);
    this.debug(`[getSuggestions] Applicable collections: ${applicableCollections.map(c => c.name).join(', ')}`);
    
    if (applicableCollections.length === 0) {
      this.debug('[getSuggestions] No applicable collections');
      return [];
    }
    
    // Auto-remove blacklisted tags if present
    const removedTags = await this.removeBlacklistedTags(file);
    if (removedTags.length > 0) {
      new Notice(`Removed ${removedTags.length} blacklisted tag(s): ${removedTags.join(', ')}`);
    }

    const { frontmatter, content } = await this.parseFile(file);
    this.debug(`[getSuggestions] Content length: ${content.length} chars`);
    
    const tagScores = new Map<string, {probability: number, collectionName: string}>();
    
    // Get suggestions from each applicable collection
    for (const collection of applicableCollections) {
      this.debug(`[getSuggestions] Collection "${collection.name}" (mode: ${collection.dictionaryMode ?? 'learning'}):`);

      // ── Static dictionary mode ──────────────────────────────────────────
      if (collection.dictionaryMode === 'static') {
        if (!collection.tagDictionaryPath) {
          this.debug(`  - Skipping static collection: no dictionary source configured`);
          continue;
        }
        const dictionary = await this.loadTagDictionaryForCollection(collection);
        console.log(`[AUTO-TAGGER DEBUG] Static mode - dictionary loaded: ${dictionary.tags.length} tags`);
        const allDictTags = [
          ...dictionary.tags,
          ...(collection.additionalTags ?? []),
        ];
        if (allDictTags.length === 0) {
          this.debug(`  - Skipping static collection: dictionary is empty or failed to load`);
          console.log(`[AUTO-TAGGER DEBUG] allDictTags is empty!`);
          continue;
        }

        let existingTags: string[] = [];
        if (Array.isArray(frontmatter.tags)) {
          existingTags = frontmatter.tags.map((t: unknown) => String(t).toLowerCase());
        } else if (typeof frontmatter.tags === 'string') {
          existingTags = [frontmatter.tags.toLowerCase()];
        }

        const title = String(frontmatter.title || file.basename);
        const extraStopwords = [
          ...dictionary.stopwords,
          ...(collection.additionalStopwords ?? []),
        ];

        console.log(`[AUTO-TAGGER DEBUG] About to call matchContentToTags: ${allDictTags.length} tags, title="${title}"`);
        const matched = this.matchContentToTags(
          content,
          title,
          allDictTags,
          collection.maxTags,
          extraStopwords,
          existingTags,
          dictionary.blacklist
        );
        console.log(`[AUTO-TAGGER DEBUG] matchContentToTags returned ${matched.length} tags`);

        const macroTags = this.promoteMacroTags(matched, dictionary, existingTags, 2);
        // Micro tags fill up to maxTags; macro tags are additive (not counted against the limit)
        const merged = [...new Set([...matched.slice(0, collection.maxTags), ...macroTags])];

        this.debug(`  - Static: matched ${merged.length} tags: ${merged.join(', ')}`);

        // Assign descending pseudo-probabilities (0.95 for top match, decreasing by 0.05)
        merged.forEach((tag, i) => {
          const prob = Math.max(0.5, 0.95 - i * 0.05);
          const existing = tagScores.get(tag);
          if (!existing || prob > existing.probability) {
            tagScores.set(tag, { probability: prob, collectionName: collection.name });
          }
        });
        continue;
      }

      // ── Learning (trained classifier) mode ──────────────────────────────
      const classifier = this.classifiers.get(collection.id);
      const stats = classifier?.getStats();
      
      this.debug(`  - Type: ${collection.classifierType || 'basic'}`);
      this.debug(`  - Classifier loaded: ${!!classifier}`);
      this.debug(`  - Stats: ${stats ? `${stats.totalDocs} docs, ${stats.totalTags} tags` : 'none'}`);
      this.debug(`  - Threshold: ${collection.threshold}`);
      this.debug(`  - Max tags: ${collection.maxTags}`);
      
      if (!classifier || classifier.getStats().totalDocs === 0) {
        this.debug(`  - Skipping (no classifier or no training data)`);
        continue;
      }

      // Get ALL existing tags (including blacklisted ones) so classifier knows not to suggest them
      // Blacklist filtering happens during training and when removing tags, not during suggestion
      let existingTags: string[] = [];
      if (Array.isArray(frontmatter.tags)) {
        existingTags = frontmatter.tags.map((t: unknown) => String(t).toLowerCase());
      } else if (typeof frontmatter.tags === 'string') {
        existingTags = [frontmatter.tags.toLowerCase()];
      }
      this.debug(`  - Existing tags: ${existingTags.join(', ') || 'none'}`);
      
      const whitelist = collection.whitelist.length > 0 ? collection.whitelist : undefined;
      this.debug(`  - Whitelist: ${whitelist ? whitelist.join(', ') : 'none (all tags allowed)'}`);
      
      const suggestions = classifier.classify(
        content,
        whitelist,
        collection.threshold,
        collection.maxTags,
        existingTags
      );
      
      this.debug(`  - Suggestions returned: ${suggestions.length}`);
      if (suggestions.length > 0) {
        this.debug(`    ${suggestions.map(s => `${s.tag} (${(s.probability * 100).toFixed(1)}%)`).join(', ')}`);
      }
      this.debug(`  - Existing tags for filtering: [${existingTags.join(', ')}]`);
      this.debug(`  - Suggested tags: [${suggestions.map(s => s.tag).join(', ')}]`);
      
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
    const results = Array.from(tagScores.entries())
      .map(([tag, data]) => ({ tag, ...data }))
      .sort((a, b) => b.probability - a.probability);
    
    this.debug(`[getSuggestions] Final merged results: ${results.length} tags`);
    if (results.length > 0) {
      this.debug(`  ${results.map(r => `${r.tag} (${(r.probability * 100).toFixed(1)}%) [${r.collectionName}]`).join(', ')}`);
    } else {
      this.debug('  No suggestions found after filtering');
    }
    
    return results;
  }

  /**
   * Show tag suggestions modal for current note
   */
  async showTagSuggestions(): Promise<void> {
    this.debug('[showTagSuggestions] Called');
    const file = this.app.workspace.getActiveFile();
    
    if (!file) {
      new Notice('No active file');
      return;
    }
    
    const applicableCollections = this.getApplicableCollections(file);
    if (applicableCollections.length === 0) {
      new Notice('File is not in scope of any enabled collection');
      return;
    }

    const hasUsableSource = applicableCollections.some(c => {
      if (c.dictionaryMode === 'static') {
        return Boolean(c.tagDictionaryPath || c.tagDictionarySnapshot);
      }
      const classifier = this.classifiers.get(c.id);
      return Boolean(classifier && classifier.getStats().totalDocs > 0);
    });

    if (!hasUsableSource) {
      new Notice('No usable source for this file. Train a learning collection or configure a static dictionary.');
      return;
    }
    
    const suggestions = await this.getSuggestions(file);
    const { frontmatter } = await this.parseFile(file);
    
    // Collect all existing tags
    const existingTags = this.getTagsFromFrontmatter(frontmatter);
    
    new TagSuggestionModal(this.app, this, file, suggestions, existingTags).open();
  }

  /**
   * Apply tags to a file (collection-aware)
   * Returns { added: string[], removed: string[] }
   */
  async applyTags(file: TFile, newTags: string[], mode: 'integrate' | 'overwrite' = 'integrate'): Promise<{ added: string[], removed: string[] }> {
    const { frontmatter, content } = await this.parseFile(file);
    const applicableCollections = this.getApplicableCollections(file);
    
    this.debug(`[applyTags] File: ${file.basename}`);
    this.debug(`[applyTags] Incoming newTags: [${newTags.join(', ')}]`);
    
    // Normalize new tags to lowercase for consistency
    const normalizedNewTags = newTags.map(t => t.toLowerCase());
    
    // Get existing tags
    let existingTags: string[] = [];
    if (Array.isArray(frontmatter.tags)) {
      existingTags = frontmatter.tags.map((t: unknown) => String(t).toLowerCase());
    } else if (typeof frontmatter.tags === 'string') {
      existingTags = [frontmatter.tags.toLowerCase()];
    }
    
    this.debug(`[applyTags] Existing tags in file: [${existingTags.join(', ')}]`);
    this.debug(`[applyTags] Normalized new tags: [${normalizedNewTags.join(', ')}]`);
    
    let finalTags: string[];
    let removed: string[] = [];
    
    if (mode === 'overwrite') {
      finalTags = [...new Set(normalizedNewTags)];
      removed = existingTags.filter(t => !finalTags.includes(t));
    } else {
      // Collect all blacklisted tags from applicable collections
      const allBlacklist = new Set<string>();
      for (const collection of applicableCollections) {
        collection.blacklist.forEach(tag => allBlacklist.add(tag.toLowerCase()));
      }
      
      // Filter out blacklisted tags
      const filteredExisting = existingTags.filter(tag => !allBlacklist.has(tag));
      removed = existingTags.filter(tag => allBlacklist.has(tag));
      
      // Merge and deduplicate (only add tags that don't already exist)
      const existingSet = new Set(filteredExisting);
      const tagsToAdd = normalizedNewTags.filter(tag => !existingSet.has(tag));
      finalTags = [...filteredExisting, ...tagsToAdd];
      
      this.debug(`[applyTags] Filtered existing: [${filteredExisting.join(', ')}]`);
      this.debug(`[applyTags] Tags to add: [${tagsToAdd.join(', ')}]`);
      this.debug(`[applyTags] Final tags: [${finalTags.join(', ')}]`);
    }
    
    // Calculate added tags
    const added = finalTags.filter(t => !existingTags.includes(t));
    
    this.debug(`[applyTags] Added tags: [${added.join(', ')}]`);
    this.debug(`[applyTags] Removed tags: [${removed.join(', ')}]`);
    
    frontmatter.tags = finalTags;
    
    // Rebuild file content
    const newFrontmatter = stringifyYaml(frontmatter).trim();
    const newContent = `---\n${newFrontmatter}\n---\n${content}`;
    
    await this.app.vault.modify(file, newContent);
    
    return { added, removed };
  }

  /**
   * Remove blacklisted tags from a file if present
   * Returns array of removed tags
   */
  async removeBlacklistedTags(file: TFile): Promise<string[]> {
    const applicableCollections = this.getApplicableCollections(file);
    if (applicableCollections.length === 0) {
      return [];
    }
    
    const { frontmatter, content } = await this.parseFile(file);
    
    // Get all existing tags
    let existingTags: string[] = [];
    if (Array.isArray(frontmatter.tags)) {
      existingTags = frontmatter.tags.map((t: unknown) => String(t).toLowerCase());
    } else if (typeof frontmatter.tags === 'string') {
      existingTags = [frontmatter.tags.toLowerCase()];
    }
    
    if (existingTags.length === 0) {
      return [];
    }
    
    // Collect all blacklisted tags from applicable collections
    const allBlacklist = new Set<string>();
    for (const collection of applicableCollections) {
      collection.blacklist.forEach(tag => allBlacklist.add(tag));
    }
    
    // Find tags to remove
    const tagsToRemove = existingTags.filter(tag => allBlacklist.has(tag));
    
    if (tagsToRemove.length === 0) {
      return [];
    }
    
    // Remove blacklisted tags
    const filteredTags = existingTags.filter(tag => !allBlacklist.has(tag));
    frontmatter.tags = filteredTags;
    
    // Rebuild file content
    const newFrontmatter = stringifyYaml(frontmatter).trim();
    const newContent = `---\n${newFrontmatter}\n---\n${content}`;
    
    await this.app.vault.modify(file, newContent);
    
    this.debug(`[removeBlacklistedTags] Removed ${tagsToRemove.length} tag(s) from "${file.basename}": ${tagsToRemove.join(', ')}`);
    
    return tagsToRemove;
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
      new Notice('File is not in scope of any enabled collection');
      return;
    }

    const hasUsableSource = applicableCollections.some(c => {
      if (c.dictionaryMode === 'static') {
        return Boolean(c.tagDictionaryPath || c.tagDictionarySnapshot);
      }
      const classifier = this.classifiers.get(c.id);
      return Boolean(classifier && classifier.getStats().totalDocs > 0);
    });

    if (!hasUsableSource) {
      new Notice('No usable source for this file. Train a learning collection or configure a static dictionary.');
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
    console.log('[Auto Tagger] Starting batch tag operation');
    console.log('[Auto Tagger] Debug enabled:', this.settings?.debugToConsole);

    const hasUsableCollection = this.settings.collections.some(c => {
      if (!c.enabled) return false;
      if (c.dictionaryMode === 'static') {
        return Boolean(c.tagDictionaryPath || c.tagDictionarySnapshot);
      }
      const classifier = this.classifiers.get(c.id);
      return Boolean(classifier && classifier.getStats().totalDocs > 0);
    });

    if (!hasUsableCollection) {
      new Notice('No usable collections. Train a learning collection or configure a static dictionary.');
      return;
    }
    
    const files = this.getFilesInScope();
    console.log(`[Auto Tagger] Processing ${files.length} files`);
    const modeText = mode === 'overwrite' ? 'Overwriting' : 'Integrating';
    const notice = new Notice(`${modeText} tags for ${files.length} files...`, 0);
    
    let tagged = 0;
    let failed = 0;
    let withSuggestions = 0;
    let totalAdded = 0;
    let totalRemoved = 0;
    const details: Array<{ file: string, added: string[], removed: string[] }> = [];
    
    for (const file of files) {
      try {
        const suggestions = await this.getSuggestions(file);
        
        if (suggestions.length > 0) {
          withSuggestions++;
          const tags = suggestions.map(s => s.tag);
          const result = await this.applyTags(file, tags, mode);
          
          if (result.added.length > 0 || result.removed.length > 0) {
            tagged++;
            totalAdded += result.added.length;
            totalRemoved += result.removed.length;
            details.push({ 
              file: file.basename, 
              added: result.added, 
              removed: result.removed 
            });
          }
        }
      } catch (e) {
        console.error(`Failed to tag file ${file.path}:`, e);
        failed++;
      }
    }
    
    notice.hide();

    const withoutSuggestions = files.length - withSuggestions;
    if (withoutSuggestions > 0) {
      new Notice(`Processed ${files.length} files: ${withSuggestions} with suggestions, ${withoutSuggestions} without suggestions.`);
    }
    
    if (tagged > 0 || totalRemoved > 0) {
      new BatchSummaryModal(
        this.app,
        'Batch tag all notes',
        tagged,
        totalAdded,
        totalRemoved,
        failed,
        details
      ).open();
    } else {
      const failedText = failed > 0 ? ` (${failed} failed)` : '';
      new Notice(`No changes made${failedText}`);
    }
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
    
    const hasUsableCollection = this.settings.collections.some(c => {
      if (!c.enabled) return false;
      if (c.dictionaryMode === 'static') {
        return Boolean(c.tagDictionaryPath || c.tagDictionarySnapshot);
      }
      const classifier = this.classifiers.get(c.id);
      return Boolean(classifier && classifier.getStats().totalDocs > 0);
    });

    if (!hasUsableCollection) {
      new Notice('No usable collections. Train a learning collection or configure a static dictionary.');
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
    let failed = 0;
    let totalAdded = 0;
    let totalRemoved = 0;
    const details: Array<{ file: string, added: string[], removed: string[] }> = [];
    
    for (const f of files) {
      try {
        const suggestions = await this.getSuggestions(f);
        
        if (suggestions.length > 0) {
          const tags = suggestions.map(s => s.tag);
          const result = await this.applyTags(f, tags, mode);
          
          if (result.added.length > 0 || result.removed.length > 0) {
            tagged++;
            totalAdded += result.added.length;
            totalRemoved += result.removed.length;
            details.push({ 
              file: f.basename, 
              added: result.added, 
              removed: result.removed 
            });
          }
        }
      } catch (e) {
        console.error(`Failed to tag file ${f.path}:`, e);
        failed++;
      }
    }
    
    notice.hide();
    
    if (tagged > 0 || totalRemoved > 0) {
      new BatchSummaryModal(
        this.app,
        `Batch tag folder: ${folder.name}`,
        tagged,
        totalAdded,
        totalRemoved,
        failed,
        details
      ).open();
    } else {
      const failedText = failed > 0 ? ` (${failed} failed)` : '';
      new Notice(`No changes made in ${folder.name}${failedText}`);
    }
  }

  /**
   * Remove all tags from files in a collection's scope
   */
  async removeAllTagsFromCollection(collectionId: string): Promise<void> {
    const collection = this.settings.collections.find(c => c.id === collectionId);
    if (!collection) {
      new Notice('Collection not found');
      return;
    }

    const files = this.getFilesInScopeForCollection(collection);
    const notice = new Notice(`Removing all tags from ${files.length} files...`, 0);
    
    let filesModified = 0;
    let totalRemoved = 0;
    const details: Array<{ file: string, removed: string[] }> = [];

    for (const file of files) {
      try {
        const { frontmatter, content } = await this.parseFile(file);
        
        // Get existing tags
        let existingTags: string[] = [];
        if (Array.isArray(frontmatter.tags)) {
          existingTags = frontmatter.tags.map((t: unknown) => String(t).toLowerCase());
        } else if (typeof frontmatter.tags === 'string') {
          existingTags = [frontmatter.tags.toLowerCase()];
        }

        if (existingTags.length === 0) {
          continue;
        }

        // Remove all tags
        const removedTags = existingTags;
        frontmatter.tags = undefined;
        
        // Rebuild file content
        const newFrontmatter = stringifyYaml(frontmatter).trim();
        const newContent = `---\n${newFrontmatter}\n---\n${content}`;
        
        await this.app.vault.modify(file, newContent);
        
        filesModified++;
        totalRemoved += removedTags.length;
        details.push({ 
          file: file.basename, 
          removed: removedTags 
        });
      } catch (e) {
        console.error(`Failed to remove tags from ${file.path}:`, e);
      }
    }

    notice.hide();

    if (filesModified > 0) {
      new RemoveTagsSummaryModal(
        this.app,
        `Removed all tags from collection: ${collection.name}`,
        filesModified,
        totalRemoved,
        details
      ).open();
    } else {
      new Notice('No tags were found to remove');
    }
  }

  onunload() {
    // Save all classifier data on unload
    for (const collection of this.settings.collections) {
      const classifier = this.classifiers.get(collection.id);
      if (classifier && classifier.getStats().totalDocs > 0) {
        collection.classifierData = classifier.export();
      }
    }
    void this.saveSettings();
  }
}

/**
 * Modal to display batch operation summary
 */
class BatchSummaryModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private filesModified: number,
    private tagsAdded: number,
    private tagsRemoved: number,
    private failed: number,
    private details: Array<{ file: string, added: string[], removed: string[] }>
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('auto-tagger-batch-summary');

    contentEl.createEl('h2', { text: this.title });

    // Summary
    const summary = contentEl.createEl('div', { cls: 'batch-summary' });
    summary.createEl('p', { text: `✅ Files modified: ${this.filesModified}` });
    summary.createEl('p', { text: `➕ Tags added: ${this.tagsAdded}` });
    
    if (this.tagsRemoved > 0) {
      summary.createEl('p', { text: `🗑️ Tags removed (blacklisted): ${this.tagsRemoved}` });
    }
    
    if (this.failed > 0) {
      summary.createEl('p', { text: `❌ Failed: ${this.failed}`, cls: 'batch-failed' });
    }

    // Details section (collapsible)
    if (this.details.length > 0) {
      const detailsSection = contentEl.createEl('details');
      detailsSection.createEl('summary', { text: `📋 View details (${this.details.length} files)` });
      
      const detailsList = detailsSection.createEl('div', { cls: 'batch-details-list' });
      
      for (const detail of this.details) {
        const fileEntry = detailsList.createEl('div', { cls: 'batch-file-entry' });
        fileEntry.createEl('div', { text: detail.file, cls: 'batch-file-name' });
        
        if (detail.added.length > 0) {
          const addedDiv = fileEntry.createEl('div', { cls: 'batch-tags-added' });
          addedDiv.createEl('span', { text: '  ➕ ' });
          addedDiv.createEl('span', { text: detail.added.join(', ') });
        }
        
        if (detail.removed.length > 0) {
          const removedDiv = fileEntry.createEl('div', { cls: 'batch-tags-removed' });
          removedDiv.createEl('span', { text: '  🗑️ ' });
          removedDiv.createEl('span', { text: detail.removed.join(', ') });
        }
      }
    }

    // Close button
    const buttonDiv = contentEl.createEl('div', { cls: 'modal-button-container' });
    const closeButton = buttonDiv.createEl('button', { text: 'Close', cls: 'mod-cta' });
    closeButton.addEventListener('click', () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Modal to display tag removal summary
 */
class RemoveTagsSummaryModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private filesModified: number,
    private tagsRemoved: number,
    private details: Array<{ file: string, removed: string[] }>
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('auto-tagger-batch-summary');

    contentEl.createEl('h2', { text: this.title });

    // Summary
    const summary = contentEl.createEl('div', { cls: 'batch-summary' });
    summary.createEl('p', { text: `✅ Files modified: ${this.filesModified}` });
    summary.createEl('p', { text: `🗑️ Tags removed: ${this.tagsRemoved}` });

    // Details section (collapsible)
    if (this.details.length > 0) {
      const detailsSection = contentEl.createEl('details');
      detailsSection.createEl('summary', { text: `📋 View details (${this.details.length} files)` });
      
      const detailsList = detailsSection.createEl('div', { cls: 'batch-details-list' });
      
      for (const detail of this.details) {
        const fileEntry = detailsList.createEl('div', { cls: 'batch-file-entry' });
        fileEntry.createEl('div', { text: detail.file, cls: 'batch-file-name' });
        
        if (detail.removed.length > 0) {
          const removedDiv = fileEntry.createEl('div', { cls: 'batch-tags-removed' });
          removedDiv.createEl('span', { text: '  🗑️ ' });
          removedDiv.createEl('span', { text: detail.removed.join(', ') });
        }
      }
    }

    // Close button
    const buttonDiv = contentEl.createEl('div', { cls: 'modal-button-container' });
    const closeButton = buttonDiv.createEl('button', { text: 'Close', cls: 'mod-cta' });
    closeButton.addEventListener('click', () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
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
    
    contentEl.createEl('h3', { text: 'Tag suggestions' });
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
    addButton.addEventListener('click', () => {
      void (async () => {
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
      })();
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
    
    contentEl.createEl('h3', { text: 'Select collection' });
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
      allTitle.textContent = 'All collections';
      
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
        desc.textContent += ' | not trained';
      }
    }
    
    const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container' });
    
    const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}