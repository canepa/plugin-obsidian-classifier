export interface ClassifierStats {
  totalDocs: number;
  totalTags: number;
}

export interface ClassifierData {
  tagWordCounts: Record<string, Record<string, number>>;
  tagDocCounts: Record<string, number>;
  vocabulary: string[] | Set<string>; // Support both formats
  totalDocs: number;
  tagWeights: Record<string, number>;
}

export class NaiveBayesClassifier {
  private tagWordCounts: Record<string, Record<string, number>> = {};
  private tagDocCounts: Record<string, number> = {};
  private vocabulary: Set<string> = new Set();
  private totalDocs: number = 0;
  private tagWeights: Record<string, number> = {};

  constructor() {}

  /**
   * Train the classifier with a document and its tags
   */
  train(text: string, tags: string[], weight: number = 1.0): void {
    const words = this.tokenize(this.preprocessText(text));
    
    // Skip training if no words after preprocessing
    if (words.length === 0) {
      return;
    }
    
    for (const tag of tags) {
      if (!this.tagWordCounts[tag]) {
        this.tagWordCounts[tag] = {};
        this.tagDocCounts[tag] = 0;
        this.tagWeights[tag] = 0;
      }
      
      this.tagDocCounts[tag] += weight;
      this.tagWeights[tag] += weight;
      
      for (const word of words) {
        this.vocabulary.add(word);
        this.tagWordCounts[tag][word] = (this.tagWordCounts[tag][word] || 0) + weight;
      }
    }
    
    this.totalDocs += weight;
  }

  /**
   * Classify a document and return tag suggestions with probabilities
   */
  classify(
    text: string, 
    whitelist?: string[], 
    _threshold: number = 0.01,
    maxResults: number = 5,
    useClassBalancing: boolean = true
  ): Array<{tag: string, probability: number}> {
    if (this.totalDocs === 0) {
      console.log('[Classifier] No documents trained');
      return [];
    }

    const words = this.tokenize(this.preprocessText(text));
    console.log('[Classifier] Tokenized words:', words.length, 'words');
    
    if (words.length === 0) {
      console.log('[Classifier] No words found after preprocessing');
      return [];
    }
    
    const scores: Record<string, number> = {};
    
    const tags = whitelist && whitelist.length > 0 
      ? whitelist.filter(t => this.tagDocCounts[t])
      : Object.keys(this.tagDocCounts);
    
    console.log('[Classifier] Evaluating tags:', tags);
    console.log('[Classifier] Class balancing:', useClassBalancing ? 'enabled' : 'disabled');
    
    for (const tag of tags) {
      scores[tag] = this.calculateContentScore(words, tag, useClassBalancing);
    }
    
    // Filter out invalid scores before processing
    const validScores = Object.entries(scores).filter(([_, score]) => isFinite(score));
    
    if (validScores.length === 0) {
      console.log('[Classifier] No valid scores, returning empty results');
      return [];
    }
    
    // Filter by keyword presence: only suggest tags if the tag word appears in the text
    const wordsSet = new Set(words);
    console.log('[Classifier] Sample words in text:', Array.from(wordsSet).slice(0, 20).join(', '));
    
    const keywordFilteredScores = validScores.filter(([tag, _]) => {
      // Check if tag name or related words appear in text
      const tagWords = tag.split('-'); // handle multi-word tags like "best-practices"
      
      // For each tag word, check exact match and common variations
      const hasKeyword = tagWords.some(tagWord => {
        // Exact match
        if (wordsSet.has(tagWord)) return true;
        
        // Check for plural/singular variations
        if (wordsSet.has(tagWord + 's')) return true;  // strategy -> strategies
        if (tagWord.endsWith('s') && wordsSet.has(tagWord.slice(0, -1))) return true; // strategies -> strategy
        
        // Check for common word forms (management -> manage, manager, managers, managing)
        const stem = tagWord.replace(/(?:ment|ing|ed|er|ion|tion)$/, '');
        if (stem.length >= 3 && Array.from(wordsSet).some(w => w.startsWith(stem))) return true;
        
        return false;
      });
      
      if (!hasKeyword) {
        console.log(`[Classifier] Filtered out "${tag}": keyword not found in text`);
      }
      return hasKeyword;
    });
    
    if (keywordFilteredScores.length === 0) {
      console.log('[Classifier] No tags with keywords in text, using all valid tags');
      // Fall back to all valid tags if none have keywords
      console.log('[Classifier] Score sample:', validScores.slice(0, 5).map(([tag, score]) => `${tag}: ${score.toFixed(4)}`));
    } else {
      console.log('[Classifier] Score sample:', keywordFilteredScores.slice(0, 5).map(([tag, score]) => `${tag}: ${score.toFixed(4)}`));
      validScores.length = 0;
      validScores.push(...keywordFilteredScores);
    }
    
    console.log('[Classifier] Score sample:', validScores.slice(0, 5).map(([tag, score]) => `${tag}: ${score.toFixed(4)}`));
    
    // Normalize scores to probabilities
    const maxScore = Math.max(...validScores.map(([_, score]) => score));
    
    const expScores = validScores.map(([tag, score]) => ({
      tag,
      expScore: Math.exp(score - maxScore)
    }));
    
    const total = expScores.reduce((sum, item) => sum + item.expScore, 0);
    
    let allResults = expScores
      .map(({ tag, expScore }) => ({
        tag,
        probability: expScore / total
      }))
      .sort((a, b) => b.probability - a.probability);

    console.log('[Classifier] Top 5 results:', allResults.slice(0, 5).map(r => {
      const pct = r.probability * 100;
      return `${r.tag}: ${pct < 0.01 ? pct.toExponential(2) : pct.toFixed(2)}%`;
    }));
    
    // Return top N results, ignoring threshold for multi-label support
    console.log('[Classifier] Returning top', maxResults, 'tags');
    
    return allResults.slice(0, maxResults);
  }

  /**
   * Calculate content-based score for a tag given words
   */
  private calculateContentScore(words: string[], tag: string, useClassBalancing: boolean): number {
    // Reduce prior probability weight (only 10% influence instead of equal weight)
    const priorWeight = 0.1;
    const contentWeight = 0.9;
    
    let priorScore = 0;
    if (!useClassBalancing) {
      // Normal prior: P(tag)
      priorScore = Math.log(this.tagDocCounts[tag] / this.totalDocs);
    } else {
      // Balanced prior: All tags get equal starting probability
      const numTags = Object.keys(this.tagDocCounts).length;
      priorScore = Math.log(1.0 / numTags);
    }
    
    // Likelihood: P(words|tag) - this is the content similarity
    let contentScore = 0;
    const vocabSize = this.vocabulary.size;
    const tagWordCount = Object.values(this.tagWordCounts[tag]).reduce((sum, count) => sum + count, 0);
    
    // Handle edge case: tag with no words trained
    if (tagWordCount === 0 || vocabSize === 0) {
      return -Infinity;
    }
    
    for (const word of words) {
      // Laplace smoothing
      const wordCount = this.tagWordCounts[tag][word] || 0;
      const probability = (wordCount + 1) / (tagWordCount + vocabSize);
      contentScore += Math.log(probability);
    }
    
    // Validate final score
    if (!isFinite(contentScore)) {
      return -Infinity;
    }
    
    // Combine with much higher weight on content
    return (priorWeight * priorScore) + (contentWeight * contentScore);
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length >= 2); // Keep 2+ letter words (includes "ai", "ui", etc.)
  }

  /**
   * Preprocess text for classification
   */
  private preprocessText(text: string): string {
    // Remove frontmatter
    text = text.replace(/^---[\s\S]*?---/, '');
    
    // Remove markdown links but keep text
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    
    // Remove markdown images
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');
    
    // Remove code blocks
    text = text.replace(/```[\s\S]*?```/g, '');
    text = text.replace(/`[^`]+`/g, '');
    
    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, '');
    
    // Convert to lowercase BEFORE synonym replacement
    text = text.toLowerCase();
    
    // Apply synonym normalization BEFORE removing special characters
    const synonyms: Record<string, string> = {
      'artificial intelligence': 'ai',
      'machine learning': 'machinelearning',
      'deep learning': 'deeplearning',
      'natural language processing': 'nlp',
      'user experience': 'ux',
      'user interface': 'ui',
      'search engine optimization': 'seo'
    };
    
    for (const [phrase, normalized] of Object.entries(synonyms)) {
      const regex = new RegExp('\\b' + phrase.replace(/\s+/g, '\\s+') + '\\b', 'gi');
      text = text.replace(regex, normalized);
    }
    
    // Remove special characters but keep spaces
    text = text.replace(/[^\w\s]/g, ' ');
    
    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  }

  /**
   * Reset the classifier
   */
  reset(): void {
    this.tagWordCounts = {};
    this.tagDocCounts = {};
    this.tagWeights = {};
    this.vocabulary = new Set();
    this.totalDocs = 0;
  }

  /**
   * Export classifier data for persistence
   */
  export(): ClassifierData {
    return {
      tagWordCounts: this.tagWordCounts,
      tagDocCounts: this.tagDocCounts,
      vocabulary: Array.from(this.vocabulary), // Convert Set to Array for JSON serialization
      totalDocs: this.totalDocs,
      tagWeights: this.tagWeights
    };
  }

  /**
   * Import classifier data
   */
  import(data: ClassifierData): void {
    if (!data) {
      throw new Error('Invalid classifier data');
    }

    this.tagWordCounts = data.tagWordCounts || {};
    this.tagDocCounts = data.tagDocCounts || {};
    this.tagWeights = data.tagWeights || {};
    // Handle both array format (after export) and Set format (legacy)
    this.vocabulary = new Set(Array.isArray(data.vocabulary) ? data.vocabulary : []);
    this.totalDocs = data.totalDocs || 0;
    
    // Clean up corrupted tags (tags with no word counts)
    const corruptedTags: string[] = [];
    for (const tag in this.tagDocCounts) {
      const wordCount = Object.keys(this.tagWordCounts[tag] || {}).length;
      if (wordCount === 0) {
        corruptedTags.push(tag);
        delete this.tagWordCounts[tag];
        delete this.tagDocCounts[tag];
        delete this.tagWeights[tag];
      }
    }
    
    if (corruptedTags.length > 0) {
      console.log('[Classifier] Cleaned up corrupted tags:', corruptedTags);
    }
  }

  /**
   * Get classifier statistics
   */
  getStats(): ClassifierStats {
    return {
      totalDocs: this.totalDocs,
      totalTags: Object.keys(this.tagDocCounts).length
    };
  }

  /**
   * Get all known tags
   */
  getAllTags(): string[] {
    return Object.keys(this.tagDocCounts).sort();
  }

  /**
   * Clean up tags with no word counts
   */
  cleanupEmptyTags(): void {
    const emptyTags: string[] = [];
    for (const tag in this.tagDocCounts) {
      const wordCount = Object.values(this.tagWordCounts[tag] || {}).reduce((sum, count) => sum + count, 0);
      if (wordCount === 0) {
        emptyTags.push(tag);
        delete this.tagWordCounts[tag];
        delete this.tagDocCounts[tag];
        delete this.tagWeights[tag];
      }
    }
    
    if (emptyTags.length > 0) {
      console.log('[Classifier] Removed empty tags:', emptyTags);
    }
  }
}
