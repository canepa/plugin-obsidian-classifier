/**
 * Advanced Embedding-based classifier with N-grams, hierarchical tags, and active learning
 * Improves upon basic TF-IDF approach with semantic understanding
 */

import { EmbeddingClassifier, EmbeddingClassifierData } from './embedding-classifier';

export interface AdvancedClassifierData extends EmbeddingClassifierData {
  ngramEmbeddings?: Record<string, number[]>;
  tagHierarchy?: Record<string, string[]>; // tag -> parent tags
  userFeedback?: Record<string, { accepted: number, rejected: number }>;
}

export class AdvancedEmbeddingClassifier extends EmbeddingClassifier {
  // N-gram configuration
  private readonly MAX_NGRAM_SIZE = 3;
  private readonly NGRAM_WEIGHT = 0.6; // Weight for n-grams vs unigrams
  
  // Hierarchical tag relationships
  private tagHierarchy: Map<string, Set<string>> = new Map(); // tag -> parent tags
  private tagChildren: Map<string, Set<string>> = new Map(); // tag -> child tags
  
  // Active learning - track user feedback
  private userFeedback: Map<string, { accepted: number, rejected: number }> = new Map();
  
  // N-gram embeddings
  private ngramEmbeddings: Record<string, number[]> = {};
  private ngramDocCounts: Record<string, number> = {};

  /**
   * Debug logging helper
   */
  private log(...args: unknown[]) {
    if (this.debugEnabled) {
      console.log(...args);
    }
  }

  /**
   * Generate N-grams from tokenized words
   */
  private generateNgrams(words: string[]): string[] {
    const ngrams: string[] = [];
    
    // Unigrams (individual words)
    ngrams.push(...words);
    
    // Bigrams (2-word phrases)
    for (let i = 0; i < words.length - 1; i++) {
      ngrams.push(`${words[i]}_${words[i + 1]}`);
    }
    
    // Trigrams (3-word phrases) - only if enabled
    if (this.MAX_NGRAM_SIZE >= 3) {
      for (let i = 0; i < words.length - 2; i++) {
        ngrams.push(`${words[i]}_${words[i + 1]}_${words[i + 2]}`);
      }
    }
    
    return ngrams;
  }

  /**
   * Enhanced embedding generation - Use parent's word-only approach for better discrimination
   * N-grams are only used for overlap checking, not for embeddings
   * This prevents everything from looking similar
   */
  protected generateEmbedding(text: string, normalize: boolean = true): number[] {
    this.log(`[AdvancedClassifier.generateEmbedding] Called with text length ${text.length}, normalize=${normalize}`);
    
    // Use parent's proven word-only embedding
    const embedding = super.generateEmbedding(text, normalize);
    
    this.log(`[AdvancedClassifier.generateEmbedding] Generated embedding with ${embedding.filter(v => v !== 0).length} non-zero dims`);
    
    // Check for invalid values
    const hasNaN = embedding.some(v => isNaN(v));
    const hasInf = embedding.some(v => !isFinite(v) && !isNaN(v));
    if (hasNaN || hasInf) {
      console.error('[AdvancedClassifier.generateEmbedding] ERROR: Generated embedding contains invalid values!');
      console.error('  NaN count:', embedding.filter(v => isNaN(v)).length);
      console.error('  Infinity count:', embedding.filter(v => !isFinite(v) && !isNaN(v)).length);
      console.error('  Text preview:', text.substring(0, 200));
      console.error('  First 20 values:', embedding.slice(0, 20));
    }
    
    return embedding;
  }

  /**
   * Hash function for strings
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Build tag hierarchy by detecting parent-child relationships
   */
  private buildTagHierarchy(): void {
    const allTags = this.getAllTags();
    
    // Clear existing hierarchy
    this.tagHierarchy.clear();
    this.tagChildren.clear();
    
    // Detect hierarchical relationships
    for (const tag of allTags) {
      const normalized = tag.toLowerCase().replace(/[_-]/g, ' ');
      
      for (const potentialParent of allTags) {
        if (tag === potentialParent) continue;
        
        const parentNormalized = potentialParent.toLowerCase().replace(/[_-]/g, ' ');
        
        // Check if tag is a specialization of parent
        // e.g., "deep-learning" contains "learning", "machine-learning" contains "learning"
        if (normalized.includes(parentNormalized) || 
            this.isSemanticChild(normalized, parentNormalized)) {
          
          if (!this.tagHierarchy.has(tag)) {
            this.tagHierarchy.set(tag, new Set());
          }
          this.tagHierarchy.get(tag)!.add(potentialParent);
          
          if (!this.tagChildren.has(potentialParent)) {
            this.tagChildren.set(potentialParent, new Set());
          }
          this.tagChildren.get(potentialParent)!.add(tag);
        }
      }
    }
    
    this.debug('[AdvancedClassifier] Built tag hierarchy:', 
      Array.from(this.tagHierarchy.entries()).map(([tag, parents]) => 
        `${tag} → [${Array.from(parents).join(', ')}]`
      )
    );
  }

  /**
   * Check if one tag is semantically a child of another
   */
  private isSemanticChild(child: string, parent: string): boolean {
    // Common hierarchical relationships
    const hierarchies: Record<string, string[]> = {
      'ai': ['artificial intelligence', 'machine learning', 'deep learning', 'neural network'],
      'programming': ['python', 'javascript', 'typescript', 'java', 'coding', 'development'],
      'learning': ['machine learning', 'deep learning', 'reinforcement learning'],
      'data': ['data science', 'data analysis', 'database', 'dataset'],
      'web': ['web development', 'frontend', 'backend', 'fullstack'],
      'science': ['data science', 'computer science', 'research'],
    };
    
    for (const [parentKey, children] of Object.entries(hierarchies)) {
      if (parent.includes(parentKey) && children.some(c => child.includes(c))) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Override finalize training to include advanced features
   */
  finalizeTraining(): void {
    // Call parent finalization
    super.finalizeTraining();
    
    // Build tag hierarchy after basic training
    this.buildTagHierarchy();
    
    this.debug('[AdvancedClassifier] Advanced training finalized');
  }

  /**
   * Enhanced classification with hierarchical consideration and active learning
   * Uses more lenient filtering than base classifier (25% overlap vs 40%)
   */
  classify(
    text: string,
    whitelist?: string[],
    minSimilarity: number = 0.1,
    maxResults: number = 5,
    existingTags: string[] = []
  ): Array<{ tag: string, probability: number }> {
    
    this.log('[AdvancedClassifier] Starting classification...');
    this.log(`  Text length: ${text.length} chars`);
    this.log(`  Min similarity: ${minSimilarity}`);
    this.log(`  Max results: ${maxResults}`);
    this.log(`  Existing tags: ${existingTags.join(', ') || 'none'}`);
    
    // Get all available tag embeddings from parent
    if (Object.keys(this.tagEmbeddings).length === 0) {
      this.log('[AdvancedClassifier] No tags trained');
      return [];
    }
    
    // Validate embeddings - check for NaN or corrupted data
    let corruptedCount = 0;
    for (const tag in this.tagEmbeddings) {
      const emb = this.tagEmbeddings[tag];
      const hasNaN = emb.some(v => isNaN(v) || !isFinite(v));
      const magnitude = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
      if (hasNaN || isNaN(magnitude) || magnitude === 0) {
        corruptedCount++;
        this.log(`[AdvancedClassifier] WARNING: Tag "${tag}" has corrupted embedding (magnitude: ${magnitude})`);
      }
    }
    
    if (corruptedCount > 0) {
      console.error(`[AdvancedClassifier] ERROR: ${corruptedCount} tags have corrupted embeddings. Please retrain the collection.`);
      return [];
    }
    
    this.log(`[AdvancedClassifier] Available tags: ${Object.keys(this.tagEmbeddings).length}`);

    // Generate embedding with n-grams (calls overridden generateEmbedding)
    const embedding = this.generateEmbedding(text);
    this.log(`[AdvancedClassifier] Generated embedding with ${embedding.filter(v => v !== 0).length} non-zero dimensions`);

    // Get document words for filtering (using n-grams too!)
    const processed = this.preprocessText(text);
    const words = this.tokenize(processed);
    const ngrams = this.generateNgrams(words);
    // Include both individual words AND n-grams for overlap checking
    const docTokens = new Set([...words, ...ngrams]);

    const tags = whitelist && whitelist.length > 0
      ? whitelist.filter(t => this.tagEmbeddings[t])
      : Object.keys(this.tagEmbeddings);

    this.log(`[AdvancedClassifier] Tags to evaluate: ${tags.length}`);
    if (whitelist && whitelist.length > 0) {
      this.log(`  Whitelist: ${whitelist.join(', ')}`);
    }

    // Normalize existing tags
    const existingNormalized = new Set(existingTags.map(t => this.normalizeTagLocal(t)));

    this.log('[AdvancedClassifier] Evaluating tags...');

    const similarities: Array<{ tag: string, probability: number, overlap: number }> = [];
    let cssDebugInfo: { 
      similarity: string, 
      overlap: string, 
      distinctiveWords: number, 
      matchingWords: number, 
      meetsOverlap: boolean, 
      meetsSimilarity: boolean, 
      minSimilarityNeeded: number,
      tagNonZero?: number,
      docNonZero?: number,
      tagMagnitude?: string,
      docMagnitude?: string,
      distinctiveWordsList?: string,
      matchingWordsList?: string,
      docWordCount?: number,
      docTokenCount?: number
    } | null = null;

    for (const tag of tags) {
      // Skip existing tags
      const normalizedTag = this.normalizeTagLocal(tag);
      if (existingNormalized.has(normalizedTag)) {
        continue;
      }

      const similarity = this.cosineSimilarity(embedding, this.tagEmbeddings[tag]);

      // Calculate n-gram overlap (more lenient than word-only overlap)
      const tagDistinctiveWords = this.tagDistinctiveWords[tag] || [];
      
      // For advanced classifier, we're more lenient - just 25% overlap required
      const overlap = tagDistinctiveWords.length > 0
        ? tagDistinctiveWords.filter(w => docTokens.has(w)).length / tagDistinctiveWords.length
        : 1.0;

      // Advanced classifier: selective requirements for quality
      const MIN_OVERLAP = 0.25; // 25% word overlap required for moderate similarity
      const HIGH_SIMILARITY = 0.55; // High similarity threshold - clearly related
      const MODERATE_SIMILARITY = 0.45; // Moderate similarity needs good overlap
      
      // Two passing conditions:
      // 1. High similarity (>55%) - clearly related, low overlap OK
      // 2. Moderate similarity (>45%) + good overlap (>25%) - contextually related
      
      const veryHighSimilarity = similarity >= HIGH_SIMILARITY;
      const goodMatch = similarity >= MODERATE_SIMILARITY && overlap >= MIN_OVERLAP;

      // Debug CSS specifically
      if (tag.toLowerCase() === 'css') {
        const tagEmb = this.tagEmbeddings[tag];
        const tagNonZero = tagEmb.filter(v => v !== 0).length;
        const docNonZero = embedding.filter(v => v !== 0).length;
        const tagMagnitude = Math.sqrt(tagEmb.reduce((sum, v) => sum + v * v, 0));
        const docMagnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
        const matchingWords = tagDistinctiveWords.filter(w => docTokens.has(w));
        
        cssDebugInfo = {
          similarity: (similarity * 100).toFixed(1),
          overlap: (overlap * 100).toFixed(1),
          distinctiveWords: tagDistinctiveWords.length,
          matchingWords: matchingWords.length,
          meetsOverlap: overlap >= 0.25,
          meetsSimilarity: veryHighSimilarity || goodMatch,
          minSimilarityNeeded: HIGH_SIMILARITY,
          tagNonZero,
          docNonZero,
          tagMagnitude: tagMagnitude.toFixed(2),
          docMagnitude: docMagnitude.toFixed(2),
          distinctiveWordsList: tagDistinctiveWords.slice(0, 20).join(', '),
          matchingWordsList: matchingWords.join(', '),
          docWordCount: words.length,
          docTokenCount: docTokens.size
        };
      }

      if (veryHighSimilarity || goodMatch) {
        similarities.push({ tag, probability: similarity, overlap });
      }
    }

    if (cssDebugInfo) {
      this.log('[AdvancedClassifier] CSS tag debug:');
      this.log(`  Similarity: ${cssDebugInfo.similarity}%`);
      this.log(`  Overlap: ${cssDebugInfo.overlap}%`);
      this.log(`  Distinctive words: ${cssDebugInfo.distinctiveWords}`);
      this.log(`  Matching words: ${cssDebugInfo.matchingWords}`);
      this.log(`  CSS distinctive words: ${cssDebugInfo.distinctiveWordsList}`);
      this.log(`  Matching: ${cssDebugInfo.matchingWordsList || 'none'}`);
      this.log(`  Doc has ${cssDebugInfo.docWordCount} words, ${cssDebugInfo.docTokenCount} total tokens (words + n-grams)`);
      this.log(`  Tag embedding: ${cssDebugInfo.tagNonZero} non-zero dims, magnitude ${cssDebugInfo.tagMagnitude}`);
      this.log(`  Doc embedding: ${cssDebugInfo.docNonZero} non-zero dims, magnitude ${cssDebugInfo.docMagnitude}`);
      this.log(`  Meets overlap (25%): ${cssDebugInfo.meetsOverlap}`);
      this.log(`  Meets similarity (${(cssDebugInfo.minSimilarityNeeded * 100).toFixed(0)}%): ${cssDebugInfo.meetsSimilarity}`);
    }

    // Sort by combined score prioritizing high similarity:
    // - Similarity >60%: weight heavily (80% similarity, 20% overlap)
    // - Similarity 40-60%: balanced (60% similarity, 40% overlap)
    // - Similarity <40%: weight overlap more (50% similarity, 50% overlap)
    similarities.sort((a, b) => {
      const getWeight = (sim: number) => {
        if (sim >= 0.60) return 0.8;
        if (sim >= 0.40) return 0.6;
        return 0.5;
      };
      
      const weightA = getWeight(a.probability);
      const weightB = getWeight(b.probability);
      
      const scoreA = a.probability * weightA + a.overlap * (1 - weightA);
      const scoreB = b.probability * weightB + b.overlap * (1 - weightB);
      return scoreB - scoreA;
    });

    this.log(`[AdvancedClassifier] Found ${similarities.length} candidates after filtering`);
    if (similarities.length > 0) {
      this.log('[AdvancedClassifier] Top 10 candidates:');
      similarities.slice(0, 10).forEach(r => {
        this.log(`  ${r.tag}: similarity=${(r.probability * 100).toFixed(1)}%, overlap=${(r.overlap * 100).toFixed(0)}%`);
      });
    } else {
      this.log('[AdvancedClassifier] No candidates passed filters');
      this.log(`  (Min overlap: 25%, Min similarity: ${(minSimilarity * 100).toFixed(0)}% base)`);
    }

    const baseResults = similarities.slice(0, maxResults * 2).map(({ tag, probability }) => ({ tag, probability }));
    
    // Enhance with hierarchical relationships
    const enhancedResults = this.enhanceWithHierarchy(baseResults, existingTags);
    
    // Adjust based on user feedback (active learning)
    const adjustedResults = this.adjustWithFeedback(enhancedResults);
    
    const finalResults = adjustedResults.slice(0, maxResults);
    this.debug(`[AdvancedClassifier] Returning ${finalResults.length} final suggestions`);
    if (finalResults.length > 0) {
      this.debug(`  ${finalResults.map(r => `${r.tag} (${(r.probability * 100).toFixed(1)}%)`).join(', ')}`);
    }
    
    return finalResults;
  }

  /**
   * Normalize tag for synonym detection (using parent's implementation)
   */
  private normalizeTagLocal(tag: string): string {
    return tag.toLowerCase().trim().replace(/[\s_-]+/g, '');
  }

  /**
   * Enhance suggestions with hierarchical tag relationships
   */
  private enhanceWithHierarchy(
    results: Array<{ tag: string, probability: number }>,
    existingTags: string[]
  ): Array<{ tag: string, probability: number }> {
    
    const enhanced = [...results];
    const existingSet = new Set(existingTags.map(t => t.toLowerCase()));
    
    // If document has parent tags, boost child tags
    for (const existingTag of existingTags) {
      const children = this.tagChildren.get(existingTag.toLowerCase());
      if (children) {
        for (const child of children) {
          const childResult = results.find(r => r.tag.toLowerCase() === child);
          if (childResult) {
            // Boost probability by 20% if parent tag exists
            childResult.probability *= 1.2;
          } else if (!existingSet.has(child)) {
            // Suggest child tag even if not in original results
            const tagEmbedding = this.getTagEmbedding(child);
            if (tagEmbedding) {
              enhanced.push({
                tag: child,
                probability: 0.15 // Lower threshold for hierarchical suggestions
              });
            }
          }
        }
      }
    }
    
    // Sort again after adjustments
    enhanced.sort((a, b) => b.probability - a.probability);
    
    return enhanced;
  }

  /**
   * Adjust probabilities based on user feedback (active learning)
   */
  private adjustWithFeedback(
    results: Array<{ tag: string, probability: number }>
  ): Array<{ tag: string, probability: number }> {
    
    return results.map(result => {
      const feedback = this.userFeedback.get(result.tag);
      if (!feedback) return result;
      
      const total = feedback.accepted + feedback.rejected;
      if (total < 3) return result; // Need minimum feedback
      
      const acceptanceRate = feedback.accepted / total;
      
      // Boost/reduce probability based on historical acceptance
      let adjustment = 1.0;
      if (acceptanceRate > 0.7) {
        adjustment = 1.3; // Boost frequently accepted tags
      } else if (acceptanceRate < 0.3) {
        adjustment = 0.7; // Reduce frequently rejected tags
      }
      
      return {
        ...result,
        probability: result.probability * adjustment
      };
    });
  }

  /**
   * Record user feedback for active learning
   */
  recordFeedback(tag: string, accepted: boolean): void {
    if (!this.userFeedback.has(tag)) {
      this.userFeedback.set(tag, { accepted: 0, rejected: 0 });
    }
    
    const feedback = this.userFeedback.get(tag)!;
    if (accepted) {
      feedback.accepted++;
    } else {
      feedback.rejected++;
    }
    
    this.debug(`[AdvancedClassifier] Feedback for "${tag}": ${feedback.accepted} accepted, ${feedback.rejected} rejected`);
  }

  /**
   * Export advanced classifier data
   */
  export(): AdvancedClassifierData {
    const baseData = super.export();
    
    return {
      ...baseData,
      tagHierarchy: Object.fromEntries(
        Array.from(this.tagHierarchy.entries()).map(([tag, parents]) => 
          [tag, Array.from(parents)]
        )
      ),
      userFeedback: Object.fromEntries(this.userFeedback.entries())
    };
  }

  /**
   * Import advanced classifier data
   */
  import(data: AdvancedClassifierData): void {
    super.import(data);
    
    // Import tag hierarchy
    if (data.tagHierarchy) {
      this.tagHierarchy.clear();
      this.tagChildren.clear();
      
      for (const [tag, parents] of Object.entries(data.tagHierarchy)) {
        this.tagHierarchy.set(tag, new Set(parents));
        
        for (const parent of parents) {
          if (!this.tagChildren.has(parent)) {
            this.tagChildren.set(parent, new Set());
          }
          this.tagChildren.get(parent)!.add(tag);
        }
      }
    }
    
    // Import user feedback
    if (data.userFeedback) {
      this.userFeedback = new Map(Object.entries(data.userFeedback));
    }
  }

  /**
   * Get statistics about advanced features
   */
  getAdvancedStats(): {
    hierarchyRelations: number;
    feedbackRecords: number;
    avgAcceptanceRate: number;
  } {
    const hierarchyRelations = Array.from(this.tagHierarchy.values())
      .reduce((sum, parents) => sum + parents.size, 0);
    
    const feedbackRecords = this.userFeedback.size;
    
    let totalAcceptance = 0;
    let totalFeedback = 0;
    for (const feedback of this.userFeedback.values()) {
      const total = feedback.accepted + feedback.rejected;
      if (total > 0) {
        totalAcceptance += feedback.accepted / total;
        totalFeedback++;
      }
    }
    
    const avgAcceptanceRate = totalFeedback > 0 ? totalAcceptance / totalFeedback : 0;
    
    return {
      hierarchyRelations,
      feedbackRecords,
      avgAcceptanceRate
    };
  }

  // Protected methods to access parent class internals
  protected getDimensions(): number {
    return 1024; // Match parent DIMENSIONS constant
  }

  protected getDocFrequency(word: string): number {
    // Access parent's docFrequency through export/import or direct property access
    // For now, return reasonable default
    return super['docFrequency']?.get(word) || 0;
  }

  protected getTotalDocs(): number {
    return super['totalDocs'] || 0;
  }

  protected getTagEmbedding(tag: string): number[] | null {
    return super['tagEmbeddings']?.[tag] || null;
  }

  protected debug(...args: unknown[]): void {
    if (super['debugEnabled']) {
      console.log('[AdvancedClassifier]', ...args);
    }
  }
}
