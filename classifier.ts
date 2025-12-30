export interface ClassifierStats {
  totalDocs: number;
  totalTags: number;
}

export interface ClassifierData {
  tagWordCounts: Record<string, Record<string, number>>;
  tagDocCounts: Record<string, number>;
  vocabulary: Set<string>;
  totalDocs: number;
}

export class NaiveBayesClassifier {
  private tagWordCounts: Record<string, Record<string, number>> = {};
  private tagDocCounts: Record<string, number> = {};
  private vocabulary: Set<string> = new Set();
  private totalDocs: number = 0;

  constructor() {}

  /**
   * Train the classifier with a document and its tags
   */
  train(text: string, tags: string[]): void {
    const words = this.tokenize(this.preprocessText(text));
    
    for (const tag of tags) {
      if (!this.tagWordCounts[tag]) {
        this.tagWordCounts[tag] = {};
        this.tagDocCounts[tag] = 0;
      }
      
      this.tagDocCounts[tag]++;
      
      for (const word of words) {
        this.vocabulary.add(word);
        this.tagWordCounts[tag][word] = (this.tagWordCounts[tag][word] || 0) + 1;
      }
    }
    
    this.totalDocs++;
  }

  /**
   * Classify a document and return tag suggestions with probabilities
   */
  classify(
    text: string, 
    whitelist?: string[], 
    threshold: number = 0.1
  ): Array<{tag: string, probability: number}> {
    if (this.totalDocs === 0) {
      return [];
    }

    const words = this.tokenize(this.preprocessText(text));
    const scores: Record<string, number> = {};
    
    const tags = whitelist && whitelist.length > 0 
      ? whitelist.filter(t => this.tagDocCounts[t])
      : Object.keys(this.tagDocCounts);
    
    for (const tag of tags) {
      scores[tag] = this.calculateScore(words, tag);
    }
    
    // Normalize scores to probabilities
    const total = Object.values(scores).reduce((sum, score) => sum + Math.exp(score), 0);
    
    let results = Object.entries(scores)
      .map(([tag, score]) => ({
        tag,
        probability: Math.exp(score) / total
      }))
      .filter(r => r.probability >= threshold)
      .sort((a, b) => b.probability - a.probability);

    return results;
  }

  /**
   * Calculate log probability score for a tag given words
   */
  private calculateScore(words: string[], tag: string): number {
    // Prior probability: P(tag)
    let score = Math.log(this.tagDocCounts[tag] / this.totalDocs);
    
    // Likelihood: P(words|tag)
    const vocabSize = this.vocabulary.size;
    const tagWordCount = Object.values(this.tagWordCounts[tag]).reduce((sum, count) => sum + count, 0);
    
    for (const word of words) {
      // Laplace smoothing
      const wordCount = this.tagWordCounts[tag][word] || 0;
      const probability = (wordCount + 1) / (tagWordCount + vocabSize);
      score += Math.log(probability);
    }
    
    return score;
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2); // Filter short words
  }

  /**
   * Preprocess text for classification
   */
  private preprocessText(text: string): string {
    // Remove frontmatter
    text = text.replace(/^---[\s\S]*?---/, '');
    
    // Remove markdown links but keep text
    text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
    
    // Remove markdown images
    text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');
    
    // Remove code blocks
    text = text.replace(/```[\s\S]*?```/g, '');
    text = text.replace(/`[^`]+`/g, '');
    
    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, '');
    
    // Remove special characters but keep spaces
    text = text.replace(/[^\w\s]/g, ' ');
    
    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Convert to lowercase
    text = text.toLowerCase();
    
    return text;
  }

  /**
   * Reset the classifier
   */
  reset(): void {
    this.tagWordCounts = {};
    this.tagDocCounts = {};
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
      vocabulary: this.vocabulary,
      totalDocs: this.totalDocs
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
    this.vocabulary = new Set(data.vocabulary || []);
    this.totalDocs = data.totalDocs || 0;
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
}
