/**
 * Embedding-based classifier using cosine similarity
 * More effective than Naive Bayes for multi-label classification
 */

export interface EmbeddingClassifierData {
  tagEmbeddings: Record<string, number[]>;
  tagDocCounts: Record<string, number>;
  totalDocs: number;
  tagDistinctiveWords: Record<string, string[]>; // Tag -> distinctive words
  docFrequency: Record<string, number>; // For IDF calculation during classification
}

export class EmbeddingClassifier {
  private dimensions = 1024; // Increased from 384 to reduce hash collisions
  private tagEmbeddings: Record<string, number[]> = {};
  private tagDocCounts: Record<string, number> = {};
  private totalDocs: number = 0;
  private embeddingCache: Map<string, number[]> = new Map();
  private docFrequency: Map<string, number> = new Map(); // Word -> number of docs containing it
  private trainingBuffer: Array<{ text: string, tags: string[] }> = []; // For two-pass training
  private tagDistinctiveWords: Record<string, string[]> = {}; // Cache of distinctive words per tag
  private debugEnabled: boolean = false;

  setDebugEnabled(enabled: boolean) {
    this.debugEnabled = enabled;
  }

  private debug(...args: unknown[]) {
    if (this.debugEnabled) {
      console.debug(...args);
    }
  }

  /**
   * Generate a simple embedding using TF-IDF-like approach
   * This is a lightweight alternative to transformers until we can properly integrate them
   */
  private generateEmbedding(text: string, normalize: boolean = true): number[] {
    // Preprocess text
    const processed = this.preprocessText(text);
    const words = this.tokenize(processed);

    // Build vocabulary for this document
    const wordFreq: Record<string, number> = {};
    for (const word of words) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }

    // Create a fixed-size embedding vector
    const embedding = new Array(this.dimensions).fill(0);

    // Use multiple hash functions to reduce collisions
    for (const [word, freq] of Object.entries(wordFreq)) {
      // Skip very common words (appear in >60% of documents) - they don't discriminate
      const docFreq = this.docFrequency.get(word) || 0;
      if (this.totalDocs > 0 && docFreq / this.totalDocs > 0.6) {
        continue;
      }

      // BM25-style TF saturation (k1=1.5) - reduces impact of very frequent words in a document
      const k1 = 1.5;
      const tfSaturated = (freq * (k1 + 1)) / (freq + k1);
      const tfNormalized = tfSaturated / words.length;

      // Stronger IDF: boost rare words more
      let idf = 2.0; // Baseline for words with no frequency data
      if (this.totalDocs > 0 && docFreq > 0) {
        idf = Math.log((this.totalDocs + 1) / docFreq) + 2; // Increased boost
      }

      const weight = tfNormalized * idf;

      // Use 3 different hash functions to spread the word across multiple dimensions
      const hash1 = this.hashWord(word);
      const hash2 = this.hashWord(word + '_salt1');
      const hash3 = this.hashWord(word + '_salt2');

      embedding[hash1 % this.dimensions] += weight * 0.5;
      embedding[hash2 % this.dimensions] += weight * 0.3;
      embedding[hash3 % this.dimensions] += weight * 0.2;
    }

    // Normalize only if requested (don't normalize during training accumulation)
    if (normalize) {
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      if (norm > 0) {
        for (let i = 0; i < embedding.length; i++) {
          embedding[i] /= norm;
        }
      }
    }

    return embedding;
  }

  /**
   * Simple string hash function
   */
  private hashWord(word: string): number {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Train the classifier with a document and its tags
   * Uses two-pass approach: first collect vocabulary stats, then generate embeddings
   */
  train(text: string, tags: string[]): void {
    if (tags.length === 0) return;

    // First pass: buffer training data and build document frequency statistics
    this.trainingBuffer.push({ text, tags });
    this.totalDocs++;

    // Update document frequency for each unique word in this document
    const processed = this.preprocessText(text);
    const words = this.tokenize(processed);
    const uniqueWords = new Set(words);

    for (const word of uniqueWords) {
      this.docFrequency.set(word, (this.docFrequency.get(word) || 0) + 1);
    }
  }

  /**
   * Finalize training by processing buffered data with complete vocabulary statistics
   */
  finalizeTraining(): void {
    this.debug(`[EmbeddingClassifier] Processing ${this.trainingBuffer.length} documents with vocabulary of ${this.docFrequency.size} words...`);

    // Second pass: generate embeddings with complete IDF statistics and accumulate for each tag
    for (const { text, tags } of this.trainingBuffer) {
      // Generate embedding WITHOUT normalization (raw TF-IDF weights)
      const embedding = this.generateEmbedding(text, false);

      for (const tag of tags) {
        if (!this.tagEmbeddings[tag]) {
          this.tagEmbeddings[tag] = new Array(this.dimensions).fill(0);
          this.tagDocCounts[tag] = 0;
        }

        // Accumulate raw embeddings for this tag
        for (let i = 0; i < embedding.length; i++) {
          this.tagEmbeddings[tag][i] += embedding[i];
        }

        this.tagDocCounts[tag]++;
      }
    }

    // Average and normalize tag embeddings
    for (const tag in this.tagEmbeddings) {
      const count = this.tagDocCounts[tag];
      if (count > 0) {
        // Average the accumulated embeddings
        for (let i = 0; i < this.tagEmbeddings[tag].length; i++) {
          this.tagEmbeddings[tag][i] /= count;
        }

        // NOW normalize after averaging
        const norm = Math.sqrt(
          this.tagEmbeddings[tag].reduce((sum, val) => sum + val * val, 0)
        );
        if (norm > 0) {
          for (let i = 0; i < this.tagEmbeddings[tag].length; i++) {
            this.tagEmbeddings[tag][i] /= norm;
          }
        }
      }
    }

    // Build distinctive word cache for each tag before clearing training buffer
    this.debug('[EmbeddingClassifier] Building distinctive word cache...');
    for (const tag in this.tagEmbeddings) {
      this.tagDistinctiveWords[tag] = this.buildDistinctiveWords(tag);
    }

    // Clear training buffer to save memory
    this.trainingBuffer = [];

    this.debug('[EmbeddingClassifier] Training finalized:', Object.keys(this.tagEmbeddings).length, 'tags');
  }

  /**
   * Build list of distinctive words for a tag during training
   */
  private buildDistinctiveWords(tag: string): string[] {
    const tagWordScores: Map<string, number> = new Map();

    // Find training documents for this tag
    for (const { text, tags } of this.trainingBuffer) {
      if (tags.includes(tag)) {
        const processed = this.preprocessText(text);
        const words = this.tokenize(processed);
        const uniqueWords = new Set(words);

        for (const word of uniqueWords) {
          const docFreq = this.docFrequency.get(word) || 1;
          const idf = Math.log((this.totalDocs + 1) / docFreq);

          // Only consider distinctive words (rare across corpus)
          if (idf > 2.0) { // Appears in <14% of documents
            tagWordScores.set(word, (tagWordScores.get(word) || 0) + idf);
          }
        }
      }
    }

    // Return top 20 most distinctive words for this tag
    return Array.from(tagWordScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  /**
   * Classify a document and return tag suggestions with similarity scores
   */
  classify(
    text: string,
    whitelist?: string[],
    minSimilarity: number = 0.1,
    maxResults: number = 5,
    existingTags: string[] = []
  ): Array<{ tag: string, probability: number }> {
    if (Object.keys(this.tagEmbeddings).length === 0) {
      this.debug('[EmbeddingClassifier] No tags trained');
      return [];
    }

    const embedding = this.generateEmbedding(text);

    // Get document words for discriminative filtering
    const processed = this.preprocessText(text);
    const docWords = new Set(this.tokenize(processed));

    const tags = whitelist && whitelist.length > 0
      ? whitelist.filter(t => this.tagEmbeddings[t])
      : Object.keys(this.tagEmbeddings);

    // Normalize existing tags to detect synonyms
    const existingNormalized = new Set(existingTags.map(t => this.normalizeTag(t)));

    this.debug('[EmbeddingClassifier] Evaluating', tags.length, 'tags');

    const similarities: Array<{ tag: string, probability: number, overlap: number }> = [];

    for (const tag of tags) {
      // Skip tags that already exist (or their synonyms)
      const normalizedTag = this.normalizeTag(tag);
      if (existingNormalized.has(normalizedTag)) {
        continue;
      }

      const similarity = this.cosineSimilarity(embedding, this.tagEmbeddings[tag]);

      // Calculate word overlap: what % of tag's distinctive words appear in document?
      const tagWords = this.tagDistinctiveWords[tag] || [];
      const overlap = tagWords.length > 0
        ? tagWords.filter(w => docWords.has(w)).length / tagWords.length
        : 1.0; // If no distinctive words cached, don't filter

      // Require 40% word overlap minimum - tags need strong word evidence
      // Also apply much stricter similarity requirement for borderline overlap
      const meetsOverlapThreshold = overlap >= 0.40;
      const meetsSimilarityThreshold = overlap >= 0.6
        ? similarity >= minSimilarity  // Very high overlap: normal threshold
        : similarity >= minSimilarity + 0.25;  // Lower overlap: much higher similarity required

      if (meetsOverlapThreshold && meetsSimilarityThreshold) {
        similarities.push({ tag, probability: similarity, overlap });
      }
    }

    // Sort by combined score: word overlap (70%) + similarity (30%)
    // Overlap is weighted much higher because it provides concrete word evidence
    similarities.sort((a, b) => {
      const scoreA = a.overlap * 0.7 + a.probability * 0.3;
      const scoreB = b.overlap * 0.7 + b.probability * 0.3;
      return scoreB - scoreA;
    });

    this.debug('[EmbeddingClassifier] Top 5 results:',
      similarities.slice(0, 5).map(r => `${r.tag}: ${(r.probability * 100).toFixed(2)}% (overlap: ${(r.overlap * 100).toFixed(0)}%)`)
    );

    return similarities.slice(0, maxResults).map(({ tag, probability }) => ({ tag, probability }));
  }

  /**
   * Normalize tag for synonym detection
   */
  private normalizeTag(tag: string): string {
    const normalized = tag.toLowerCase().trim()
      .replace(/[\s_-]+/g, ''); // Remove spaces, underscores, dashes

    // Common synonyms
    const synonymMap: Record<string, string> = {
      'artificialintelligence': 'ai',
      'machinelearning': 'ml',
      'deeplearning': 'dl',
      'naturallanguageprocessing': 'nlp',
      'userexperience': 'ux',
      'userinterface': 'ui',
      'searchengineoptimization': 'seo',
      'javascript': 'js',
      'typescript': 'ts',
      'python': 'py'
    };

    return synonymMap[normalized] || normalized;
  }

  /**
   * Build synonym map for deduplication
   */
  private buildTagSynonymMap(tags: string[]): Map<string, string[]> {
    const synonymGroups = new Map<string, string[]>();

    for (const tag of tags) {
      const normalized = this.normalizeTag(tag);
      if (!synonymGroups.has(normalized)) {
        synonymGroups.set(normalized, []);
      }
      synonymGroups.get(normalized)!.push(tag);
    }

    return synonymGroups;
  }

  /**
   * Preprocess text
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

    // Convert to lowercase
    text = text.toLowerCase();

    // Apply synonym normalization
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
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length >= 2);
  }

  /**
   * Reset the classifier
   */
  reset(): void {
    this.tagEmbeddings = {};
    this.tagDocCounts = {};
    this.totalDocs = 0;
    this.embeddingCache.clear();
    this.docFrequency.clear();
    this.trainingBuffer = [];
    this.tagDistinctiveWords = {};
  }

  /**
   * Export classifier data for persistence
   */
  export(): EmbeddingClassifierData {
    return {
      tagEmbeddings: this.tagEmbeddings,
      tagDocCounts: this.tagDocCounts,
      totalDocs: this.totalDocs,
      tagDistinctiveWords: this.tagDistinctiveWords,
      docFrequency: Object.fromEntries(this.docFrequency)
    };
  }

  /**
   * Import classifier data
   */
  import(data: EmbeddingClassifierData): void {
    if (!data) {
      throw new Error('Invalid classifier data');
    }

    this.tagEmbeddings = data.tagEmbeddings || {};
    this.tagDocCounts = data.tagDocCounts || {};
    this.totalDocs = data.totalDocs || 0;
    this.tagDistinctiveWords = data.tagDistinctiveWords || {};

    // Restore docFrequency Map
    this.docFrequency.clear();
    if (data.docFrequency) {
      for (const [word, freq] of Object.entries(data.docFrequency)) {
        this.docFrequency.set(word, freq);
      }
    }

    this.embeddingCache.clear();
  }

  /**
   * Get classifier statistics
   */
  getStats(): { totalDocs: number; totalTags: number } {
    return {
      totalDocs: this.totalDocs,
      totalTags: Object.keys(this.tagEmbeddings).length
    };
  }

  /**
   * Get all known tags
   */
  getAllTags(): string[] {
    return Object.keys(this.tagEmbeddings).sort();
  }

  /**
   * Get document count for a specific tag
   */
  getTagDocCount(tag: string): number {
    return this.tagDocCounts[tag] || 0;
  }
}
