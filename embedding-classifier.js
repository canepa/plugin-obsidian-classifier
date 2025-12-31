/**
 * Embedding-based classifier using cosine similarity
 * More effective than Naive Bayes for multi-label classification
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class EmbeddingClassifier {
    constructor() {
        this.dimensions = 1024; // Increased from 384 to reduce hash collisions
        this.tagEmbeddings = {};
        this.tagDocCounts = {};
        this.totalDocs = 0;
        this.embeddingCache = new Map();
        this.docFrequency = new Map(); // Word -> number of docs containing it
        this.trainingBuffer = []; // For two-pass training
        this.tagDistinctiveWords = {}; // Cache of distinctive words per tag
        this.debugEnabled = false;
    }
    setDebugEnabled(enabled) {
        this.debugEnabled = enabled;
    }
    debug(...args) {
        if (this.debugEnabled) {
            console.debug(...args);
        }
    }
    /**
     * Generate a simple embedding using TF-IDF-like approach
     * This is a lightweight alternative to transformers until we can properly integrate them
     */
    generateEmbedding(text_1) {
        return __awaiter(this, arguments, void 0, function* (text, normalize = true) {
            // Preprocess text
            const processed = this.preprocessText(text);
            const words = this.tokenize(processed);
            // Build vocabulary for this document
            const wordFreq = {};
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
        });
    }
    /**
     * Simple string hash function
     */
    hashWord(word) {
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
    cosineSimilarity(a, b) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA === 0 || normB === 0)
            return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    /**
     * Train the classifier with a document and its tags
     * Uses two-pass approach: first collect vocabulary stats, then generate embeddings
     */
    train(text, tags) {
        return __awaiter(this, void 0, void 0, function* () {
            if (tags.length === 0)
                return;
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
        });
    }
    /**
     * Finalize training by processing buffered data with complete vocabulary statistics
     */
    finalizeTraining() {
        return __awaiter(this, void 0, void 0, function* () {
            this.debug(`[EmbeddingClassifier] Processing ${this.trainingBuffer.length} documents with vocabulary of ${this.docFrequency.size} words...`);
            // Second pass: generate embeddings with complete IDF statistics and accumulate for each tag
            for (const { text, tags } of this.trainingBuffer) {
                // Generate embedding WITHOUT normalization (raw TF-IDF weights)
                const embedding = yield this.generateEmbedding(text, false);
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
                    const norm = Math.sqrt(this.tagEmbeddings[tag].reduce((sum, val) => sum + val * val, 0));
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
        });
    }
    /**
     * Build list of distinctive words for a tag during training
     */
    buildDistinctiveWords(tag) {
        const tagWordScores = new Map();
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
    classify(text_1, whitelist_1) {
        return __awaiter(this, arguments, void 0, function* (text, whitelist, minSimilarity = 0.1, maxResults = 5, existingTags = []) {
            if (Object.keys(this.tagEmbeddings).length === 0) {
                this.debug('[EmbeddingClassifier] No tags trained');
                return [];
            }
            const embedding = yield this.generateEmbedding(text);
            // Get document words for discriminative filtering
            const processed = this.preprocessText(text);
            const docWords = new Set(this.tokenize(processed));
            const tags = whitelist && whitelist.length > 0
                ? whitelist.filter(t => this.tagEmbeddings[t])
                : Object.keys(this.tagEmbeddings);
            // Normalize existing tags to detect synonyms
            const existingNormalized = new Set(existingTags.map(t => this.normalizeTag(t)));
            this.debug('[EmbeddingClassifier] Evaluating', tags.length, 'tags');
            const similarities = [];
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
                    ? similarity >= minSimilarity // Very high overlap: normal threshold
                    : similarity >= minSimilarity + 0.25; // Lower overlap: much higher similarity required
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
            this.debug('[EmbeddingClassifier] Top 5 results:', similarities.slice(0, 5).map(r => `${r.tag}: ${(r.probability * 100).toFixed(2)}% (overlap: ${(r.overlap * 100).toFixed(0)}%)`));
            return similarities.slice(0, maxResults).map(({ tag, probability }) => ({ tag, probability }));
        });
    }
    /**
     * Normalize tag for synonym detection
     */
    normalizeTag(tag) {
        const normalized = tag.toLowerCase().trim()
            .replace(/[\s_-]+/g, ''); // Remove spaces, underscores, dashes
        // Common synonyms
        const synonymMap = {
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
    buildTagSynonymMap(tags) {
        const synonymGroups = new Map();
        for (const tag of tags) {
            const normalized = this.normalizeTag(tag);
            if (!synonymGroups.has(normalized)) {
                synonymGroups.set(normalized, []);
            }
            synonymGroups.get(normalized).push(tag);
        }
        return synonymGroups;
    }
    /**
     * Preprocess text
     */
    preprocessText(text) {
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
        const synonyms = {
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
    tokenize(text) {
        return text
            .toLowerCase()
            .split(/\s+/)
            .filter(word => word.length >= 2);
    }
    /**
     * Reset the classifier
     */
    reset() {
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
    export() {
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
    import(data) {
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
    getStats() {
        return {
            totalDocs: this.totalDocs,
            totalTags: Object.keys(this.tagEmbeddings).length
        };
    }
    /**
     * Get all known tags
     */
    getAllTags() {
        return Object.keys(this.tagEmbeddings).sort();
    }
    /**
     * Get document count for a specific tag
     */
    getTagDocCount(tag) {
        return this.tagDocCounts[tag] || 0;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1iZWRkaW5nLWNsYXNzaWZpZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlbWJlZGRpbmctY2xhc3NpZmllci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O0dBR0c7Ozs7Ozs7Ozs7QUFVSCxNQUFNLE9BQU8sbUJBQW1CO0lBQWhDO1FBQ1UsZUFBVSxHQUFHLElBQUksQ0FBQyxDQUFDLCtDQUErQztRQUNsRSxrQkFBYSxHQUE2QixFQUFFLENBQUM7UUFDN0MsaUJBQVksR0FBMkIsRUFBRSxDQUFDO1FBQzFDLGNBQVMsR0FBVyxDQUFDLENBQUM7UUFDdEIsbUJBQWMsR0FBMEIsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNsRCxpQkFBWSxHQUF3QixJQUFJLEdBQUcsRUFBRSxDQUFDLENBQUMsdUNBQXVDO1FBQ3RGLG1CQUFjLEdBQTBDLEVBQUUsQ0FBQyxDQUFDLHdCQUF3QjtRQUNwRix3QkFBbUIsR0FBNkIsRUFBRSxDQUFDLENBQUMscUNBQXFDO1FBQ3pGLGlCQUFZLEdBQVksS0FBSyxDQUFDO0lBOGN4QyxDQUFDO0lBNWNDLGVBQWUsQ0FBQyxPQUFnQjtRQUM5QixJQUFJLENBQUMsWUFBWSxHQUFHLE9BQU8sQ0FBQztJQUM5QixDQUFDO0lBRU8sS0FBSyxDQUFDLEdBQUcsSUFBZTtRQUM5QixJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUN0QixPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7UUFDekIsQ0FBQztJQUNILENBQUM7SUFFRDs7O09BR0c7SUFDVyxpQkFBaUI7NkRBQUMsSUFBWSxFQUFFLFlBQXFCLElBQUk7WUFDckUsa0JBQWtCO1lBQ2xCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDNUMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUV2QyxxQ0FBcUM7WUFDckMsTUFBTSxRQUFR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U0FBUyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLE1BQU07U0FDbEQsQ0FBQztJQUNKLENBQUM7SUFFRDs7T0FFRztJQUNILFVBQVU7UUFDUixPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2hELENBQUM7SUFFRDs7T0FFRztJQUNILGNBQWMsQ0FBQyxHQUFXO1FBQ3hCLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDckMsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIEVtYmVkZGluZy1iYXNlZCBjbGFzc2lmaWVyIHVzaW5nIGNvc2luZSBzaW1pbGFyaXR5XHJcbiAqIE1vcmUgZWZmZWN0aXZlIHRoYW4gTmFpdmUgQmF5ZXMgZm9yIG11bHRpLWxhYmVsIGNsYXNzaWZpY2F0aW9uXHJcbiAqL1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBFbWJlZGRpbmdDbGFzc2lmaWVyRGF0YSB7XHJcbiAgdGFnRW1iZWRkaW5nczogUmVjb3JkPHN0cmluZywgbnVtYmVyW10+O1xyXG4gIHRhZ0RvY0NvdW50czogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcclxuICB0b3RhbERvY3M6IG51bWJlcjtcclxuICB0YWdEaXN0aW5jdGl2ZVdvcmRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmdbXT47IC8vIFRhZyAtPiBkaXN0aW5jdGl2ZSB3b3Jkc1xyXG4gIGRvY0ZyZXF1ZW5jeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjsgLy8gRm9yIElERiBjYWxjdWxhdGlvbiBkdXJpbmcgY2xhc3NpZmljYXRpb25cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEVtYmVkZGluZ0NsYXNzaWZpZXIge1xyXG4gIHByaXZhdGUgZGltZW5zaW9ucyA9IDEwMjQ7IC8vIEluY3JlYXNlZCBmcm9tIDM4NCB0byByZWR1Y2UgaGFzaCBjb2xsaXNpb25zXHJcbiAgcHJpdmF0ZSB0YWdFbWJlZGRpbmdzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXJbXT4gPSB7fTtcclxuICBwcml2YXRlIHRhZ0RvY0NvdW50czogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xyXG4gIHByaXZhdGUgdG90YWxEb2NzOiBudW1iZXIgPSAwO1xyXG4gIHByaXZhdGUgZW1iZWRkaW5nQ2FjaGU6IE1hcDxzdHJpbmcsIG51bWJlcltdPiA9IG5ldyBNYXAoKTtcclxuICBwcml2YXRlIGRvY0ZyZXF1ZW5jeTogTWFwPHN0cmluZywgbnVtYmVyPiA9IG5ldyBNYXAoKTsgLy8gV29yZCAtPiBudW1iZXIgb2YgZG9jcyBjb250YWluaW5nIGl0XHJcbiAgcHJpdmF0ZSB0cmFpbmluZ0J1ZmZlcjogQXJyYXk8e3RleHQ6IHN0cmluZywgdGFnczogc3RyaW5nW119PiA9IFtdOyAvLyBGb3IgdHdvLXBhc3MgdHJhaW5pbmdcclxuICBwcml2YXRlIHRhZ0Rpc3RpbmN0aXZlV29yZHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHt9OyAvLyBDYWNoZSBvZiBkaXN0aW5jdGl2ZSB3b3JkcyBwZXIgdGFnXHJcbiAgcHJpdmF0ZSBkZWJ1Z0VuYWJsZWQ6IGJvb2xlYW4gPSBmYWxzZTtcclxuXHJcbiAgc2V0RGVidWdFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pIHtcclxuICAgIHRoaXMuZGVidWdFbmFibGVkID0gZW5hYmxlZDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZGVidWcoLi4uYXJnczogdW5rbm93bltdKSB7XHJcbiAgICBpZiAodGhpcy5kZWJ1Z0VuYWJsZWQpIHtcclxuICAgICAgY29uc29sZS5kZWJ1ZyguLi5hcmdzKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdlbmVyYXRlIGEgc2ltcGxlIGVtYmVkZGluZyB1c2luZyBURi1JREYtbGlrZSBhcHByb2FjaFxyXG4gICAqIFRoaXMgaXMgYSBsaWdodHdlaWdodCBhbHRlcm5hdGl2ZSB0byB0cmFuc2Zvcm1lcnMgdW50aWwgd2UgY2FuIHByb3Blcmx5IGludGVncmF0ZSB0aGVtXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBnZW5lcmF0ZUVtYmVkZGluZyh0ZXh0OiBzdHJpbmcsIG5vcm1hbGl6ZTogYm9vbGVhbiA9IHRydWUpOiBQcm9taXNlPG51bWJlcltdPiB7XHJcbiAgICAvLyBQcmVwcm9jZXNzIHRleHRcclxuICAgIGNvbnN0IHByb2Nlc3NlZCA9IHRoaXMucHJlcHJvY2Vzc1RleHQodGV4dCk7XHJcbiAgICBjb25zdCB3b3JkcyA9IHRoaXMudG9rZW5pemUocHJvY2Vzc2VkKTtcclxuICAgIFxyXG4gICAgLy8gQnVpbGQgdm9jYWJ1bGFyeSBmb3IgdGhpcyBkb2N1bWVudFxyXG4gICAgY29uc3Qgd29yZEZyZXE6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcclxuICAgIGZvciAoY29uc3Qgd29yZCBvZiB3b3Jkcykge1xyXG4gICAgICB3b3JkRnJlcVt3b3JkXSA9ICh3b3JkRnJlcVt3b3JkXSB8fCAwKSArIDE7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIENyZWF0ZSBhIGZpeGVkLXNpemUgZW1iZWRkaW5nIHZlY3RvclxyXG4gICAgY29uc3QgZW1iZWRkaW5nID0gbmV3IEFycmF5KHRoaXMuZGltZW5zaW9ucykuZmlsbCgwKTtcclxuICAgIFxyXG4gICAgLy8gVXNlIG11bHRpcGxlIGhhc2ggZnVuY3Rpb25zIHRvIHJlZHVjZSBjb2xsaXNpb25zXHJcbiAgICBmb3IgKGNvbnN0IFt3b3JkLCBmcmVxXSBvZiBPYmplY3QuZW50cmllcyh3b3JkRnJlcSkpIHtcclxuICAgICAgLy8gU2tpcCB2ZXJ5IGNvbW1vbiB3b3JkcyAoYXBwZWFyIGluID42MCUgb2YgZG9jdW1lbnRzKSAtIHRoZXkgZG9uJ3QgZGlzY3JpbWluYXRlXHJcbiAgICAgIGNvbnN0IGRvY0ZyZXEgPSB0aGlzLmRvY0ZyZXF1ZW5jeS5nZXQod29yZCkgfHwgMDtcclxuICAgICAgaWYgKHRoaXMudG90YWxEb2NzID4gMCAmJiBkb2NGcmVxIC8gdGhpcy50b3RhbERvY3MgPiAwLjYpIHtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gQk0yNS1zdHlsZSBURiBzYXR1cmF0aW9uIChrMT0xLjUpIC0gcmVkdWNlcyBpbXBhY3Qgb2YgdmVyeSBmcmVxdWVudCB3b3JkcyBpbiBhIGRvY3VtZW50XHJcbiAgICAgIGNvbnN0IGsxID0gMS41O1xyXG4gICAgICBjb25zdCB0ZlNhdHVyYXRlZCA9IChmcmVxICogKGsxICsgMSkpIC8gKGZyZXEgKyBrMSk7XHJcbiAgICAgIGNvbnN0IHRmTm9ybWFsaXplZCA9IHRmU2F0dXJhdGVkIC8gd29yZHMubGVuZ3RoO1xyXG4gICAgICBcclxuICAgICAgLy8gU3Ryb25nZXIgSURGOiBib29zdCByYXJlIHdvcmRzIG1vcmVcclxuICAgICAgbGV0IGlkZiA9IDIuMDsgLy8gQmFzZWxpbmUgZm9yIHdvcmRzIHdpdGggbm8gZnJlcXVlbmN5IGRhdGFcclxuICAgICAgaWYgKHRoaXMudG90YWxEb2NzID4gMCAmJiBkb2NGcmVxID4gMCkge1xyXG4gICAgICAgIGlkZiA9IE1hdGgubG9nKCh0aGlzLnRvdGFsRG9jcyArIDEpIC8gZG9jRnJlcSkgKyAyOyAvLyBJbmNyZWFzZWQgYm9vc3RcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgY29uc3Qgd2VpZ2h0ID0gdGZOb3JtYWxpemVkICogaWRmO1xyXG4gICAgICBcclxuICAgICAgLy8gVXNlIDMgZGlmZmVyZW50IGhhc2ggZnVuY3Rpb25zIHRvIHNwcmVhZCB0aGUgd29yZCBhY3Jvc3MgbXVsdGlwbGUgZGltZW5zaW9uc1xyXG4gICAgICBjb25zdCBoYXNoMSA9IHRoaXMuaGFzaFdvcmQod29yZCk7XHJcbiAgICAgIGNvbnN0IGhhc2gyID0gdGhpcy5oYXNoV29yZCh3b3JkICsgJ19zYWx0MScpO1xyXG4gICAgICBjb25zdCBoYXNoMyA9IHRoaXMuaGFzaFdvcmQod29yZCArICdfc2FsdDInKTtcclxuICAgICAgXHJcbiAgICAgIGVtYmVkZGluZ1toYXNoMSAlIHRoaXMuZGltZW5zaW9uc10gKz0gd2VpZ2h0ICogMC41O1xyXG4gICAgICBlbWJlZGRpbmdbaGFzaDIgJSB0aGlzLmRpbWVuc2lvbnNdICs9IHdlaWdodCAqIDAuMztcclxuICAgICAgZW1iZWRkaW5nW2hhc2gzICUgdGhpcy5kaW1lbnNpb25zXSArPSB3ZWlnaHQgKiAwLjI7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIE5vcm1hbGl6ZSBvbmx5IGlmIHJlcXVlc3RlZCAoZG9uJ3Qgbm9ybWFsaXplIGR1cmluZyB0cmFpbmluZyBhY2N1bXVsYXRpb24pXHJcbiAgICBpZiAobm9ybWFsaXplKSB7XHJcbiAgICAgIGNvbnN0IG5vcm0gPSBNYXRoLnNxcnQoZW1iZWRkaW5nLnJlZHVjZSgoc3VtLCB2YWwpID0+IHN1bSArIHZhbCAqIHZhbCwgMCkpO1xyXG4gICAgICBpZiAobm9ybSA+IDApIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVtYmVkZGluZy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgZW1iZWRkaW5nW2ldIC89IG5vcm07XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBlbWJlZGRpbmc7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTaW1wbGUgc3RyaW5nIGhhc2ggZnVuY3Rpb25cclxuICAgKi9cclxuICBwcml2YXRlIGhhc2hXb3JkKHdvcmQ6IHN0cmluZyk6IG51bWJlciB7XHJcbiAgICBsZXQgaGFzaCA9IDA7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHdvcmQubGVuZ3RoOyBpKyspIHtcclxuICAgICAgaGFzaCA9ICgoaGFzaCA8PCA1KSAtIGhhc2gpICsgd29yZC5jaGFyQ29kZUF0KGkpO1xyXG4gICAgICBoYXNoID0gaGFzaCAmIGhhc2g7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gTWF0aC5hYnMoaGFzaCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDYWxjdWxhdGUgY29zaW5lIHNpbWlsYXJpdHkgYmV0d2VlbiB0d28gdmVjdG9yc1xyXG4gICAqL1xyXG4gIHByaXZhdGUgY29zaW5lU2ltaWxhcml0eShhOiBudW1iZXJbXSwgYjogbnVtYmVyW10pOiBudW1iZXIge1xyXG4gICAgbGV0IGRvdFByb2R1Y3QgPSAwO1xyXG4gICAgbGV0IG5vcm1BID0gMDtcclxuICAgIGxldCBub3JtQiA9IDA7XHJcbiAgICBcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xyXG4gICAgICBkb3RQcm9kdWN0ICs9IGFbaV0gKiBiW2ldO1xyXG4gICAgICBub3JtQSArPSBhW2ldICogYVtpXTtcclxuICAgICAgbm9ybUIgKz0gYltpXSAqIGJbaV07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChub3JtQSA9PT0gMCB8fCBub3JtQiA9PT0gMCkgcmV0dXJuIDA7XHJcbiAgICByZXR1cm4gZG90UHJvZHVjdCAvIChNYXRoLnNxcnQobm9ybUEpICogTWF0aC5zcXJ0KG5vcm1CKSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBUcmFpbiB0aGUgY2xhc3NpZmllciB3aXRoIGEgZG9jdW1lbnQgYW5kIGl0cyB0YWdzXHJcbiAgICogVXNlcyB0d28tcGFzcyBhcHByb2FjaDogZmlyc3QgY29sbGVjdCB2b2NhYnVsYXJ5IHN0YXRzLCB0aGVuIGdlbmVyYXRlIGVtYmVkZGluZ3NcclxuICAgKi9cclxuICBhc3luYyB0cmFpbih0ZXh0OiBzdHJpbmcsIHRhZ3M6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBpZiAodGFncy5sZW5ndGggPT09IDApIHJldHVybjtcclxuICAgIFxyXG4gICAgLy8gRmlyc3QgcGFzczogYnVmZmVyIHRyYWluaW5nIGRhdGEgYW5kIGJ1aWxkIGRvY3VtZW50IGZyZXF1ZW5jeSBzdGF0aXN0aWNzXHJcbiAgICB0aGlzLnRyYWluaW5nQnVmZmVyLnB1c2goeyB0ZXh0LCB0YWdzIH0pO1xyXG4gICAgdGhpcy50b3RhbERvY3MrKztcclxuICAgIFxyXG4gICAgLy8gVXBkYXRlIGRvY3VtZW50IGZyZXF1ZW5jeSBmb3IgZWFjaCB1bmlxdWUgd29yZCBpbiB0aGlzIGRvY3VtZW50XHJcbiAgICBjb25zdCBwcm9jZXNzZWQgPSB0aGlzLnByZXByb2Nlc3NUZXh0KHRleHQpO1xyXG4gICAgY29uc3Qgd29yZHMgPSB0aGlzLnRva2VuaXplKHByb2Nlc3NlZCk7XHJcbiAgICBjb25zdCB1bmlxdWVXb3JkcyA9IG5ldyBTZXQod29yZHMpO1xyXG4gICAgXHJcbiAgICBmb3IgKGNvbnN0IHdvcmQgb2YgdW5pcXVlV29yZHMpIHtcclxuICAgICAgdGhpcy5kb2NGcmVxdWVuY3kuc2V0KHdvcmQsICh0aGlzLmRvY0ZyZXF1ZW5jeS5nZXQod29yZCkgfHwgMCkgKyAxKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZpbmFsaXplIHRyYWluaW5nIGJ5IHByb2Nlc3NpbmcgYnVmZmVyZWQgZGF0YSB3aXRoIGNvbXBsZXRlIHZvY2FidWxhcnkgc3RhdGlzdGljc1xyXG4gICAqL1xyXG4gIGFzeW5jIGZpbmFsaXplVHJhaW5pbmcoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0aGlzLmRlYnVnKGBbRW1iZWRkaW5nQ2xhc3NpZmllcl0gUHJvY2Vzc2luZyAke3RoaXMudHJhaW5pbmdCdWZmZXIubGVuZ3RofSBkb2N1bWVudHMgd2l0aCB2b2NhYnVsYXJ5IG9mICR7dGhpcy5kb2NGcmVxdWVuY3kuc2l6ZX0gd29yZHMuLi5gKTtcclxuICAgIFxyXG4gICAgLy8gU2Vjb25kIHBhc3M6IGdlbmVyYXRlIGVtYmVkZGluZ3Mgd2l0aCBjb21wbGV0ZSBJREYgc3RhdGlzdGljcyBhbmQgYWNjdW11bGF0ZSBmb3IgZWFjaCB0YWdcclxuICAgIGZvciAoY29uc3QgeyB0ZXh0LCB0YWdzIH0gb2YgdGhpcy50cmFpbmluZ0J1ZmZlcikge1xyXG4gICAgICAvLyBHZW5lcmF0ZSBlbWJlZGRpbmcgV0lUSE9VVCBub3JtYWxpemF0aW9uIChyYXcgVEYtSURGIHdlaWdodHMpXHJcbiAgICAgIGNvbnN0IGVtYmVkZGluZyA9IGF3YWl0IHRoaXMuZ2VuZXJhdGVFbWJlZGRpbmcodGV4dCwgZmFsc2UpO1xyXG4gICAgICBcclxuICAgICAgZm9yIChjb25zdCB0YWcgb2YgdGFncykge1xyXG4gICAgICAgIGlmICghdGhpcy50YWdFbWJlZGRpbmdzW3RhZ10pIHtcclxuICAgICAgICAgIHRoaXMudGFnRW1iZWRkaW5nc1t0YWddID0gbmV3IEFycmF5KHRoaXMuZGltZW5zaW9ucykuZmlsbCgwKTtcclxuICAgICAgICAgIHRoaXMudGFnRG9jQ291bnRzW3RhZ10gPSAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBBY2N1bXVsYXRlIHJhdyBlbWJlZGRpbmdzIGZvciB0aGlzIHRhZ1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZW1iZWRkaW5nLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICB0aGlzLnRhZ0VtYmVkZGluZ3NbdGFnXVtpXSArPSBlbWJlZGRpbmdbaV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMudGFnRG9jQ291bnRzW3RhZ10rKztcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBBdmVyYWdlIGFuZCBub3JtYWxpemUgdGFnIGVtYmVkZGluZ3NcclxuICAgIGZvciAoY29uc3QgdGFnIGluIHRoaXMudGFnRW1iZWRkaW5ncykge1xyXG4gICAgICBjb25zdCBjb3VudCA9IHRoaXMudGFnRG9jQ291bnRzW3RhZ107XHJcbiAgICAgIGlmIChjb3VudCA+IDApIHtcclxuICAgICAgICAvLyBBdmVyYWdlIHRoZSBhY2N1bXVsYXRlZCBlbWJlZGRpbmdzXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnRhZ0VtYmVkZGluZ3NbdGFnXS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgdGhpcy50YWdFbWJlZGRpbmdzW3RhZ11baV0gLz0gY291bnQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE5PVyBub3JtYWxpemUgYWZ0ZXIgYXZlcmFnaW5nXHJcbiAgICAgICAgY29uc3Qgbm9ybSA9IE1hdGguc3FydChcclxuICAgICAgICAgIHRoaXMudGFnRW1iZWRkaW5nc1t0YWddLnJlZHVjZSgoc3VtLCB2YWwpID0+IHN1bSArIHZhbCAqIHZhbCwgMClcclxuICAgICAgICApO1xyXG4gICAgICAgIGlmIChub3JtID4gMCkge1xyXG4gICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnRhZ0VtYmVkZGluZ3NbdGFnXS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICB0aGlzLnRhZ0VtYmVkZGluZ3NbdGFnXVtpXSAvPSBub3JtO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBCdWlsZCBkaXN0aW5jdGl2ZSB3b3JkIGNhY2hlIGZvciBlYWNoIHRhZyBiZWZvcmUgY2xlYXJpbmcgdHJhaW5pbmcgYnVmZmVyXHJcbiAgICB0aGlzLmRlYnVnKCdbRW1iZWRkaW5nQ2xhc3NpZmllcl0gQnVpbGRpbmcgZGlzdGluY3RpdmUgd29yZCBjYWNoZS4uLicpO1xyXG4gICAgZm9yIChjb25zdCB0YWcgaW4gdGhpcy50YWdFbWJlZGRpbmdzKSB7XHJcbiAgICAgIHRoaXMudGFnRGlzdGluY3RpdmVXb3Jkc1t0YWddID0gdGhpcy5idWlsZERpc3RpbmN0aXZlV29yZHModGFnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2xlYXIgdHJhaW5pbmcgYnVmZmVyIHRvIHNhdmUgbWVtb3J5XHJcbiAgICB0aGlzLnRyYWluaW5nQnVmZmVyID0gW107XHJcbiAgICBcclxuICAgIHRoaXMuZGVidWcoJ1tFbWJlZGRpbmdDbGFzc2lmaWVyXSBUcmFpbmluZyBmaW5hbGl6ZWQ6JywgT2JqZWN0LmtleXModGhpcy50YWdFbWJlZGRpbmdzKS5sZW5ndGgsICd0YWdzJyk7XHJcbiAgfVxyXG4gIFxyXG4gIC8qKlxyXG4gICAqIEJ1aWxkIGxpc3Qgb2YgZGlzdGluY3RpdmUgd29yZHMgZm9yIGEgdGFnIGR1cmluZyB0cmFpbmluZ1xyXG4gICAqL1xyXG4gIHByaXZhdGUgYnVpbGREaXN0aW5jdGl2ZVdvcmRzKHRhZzogc3RyaW5nKTogc3RyaW5nW10ge1xyXG4gICAgY29uc3QgdGFnV29yZFNjb3JlczogTWFwPHN0cmluZywgbnVtYmVyPiA9IG5ldyBNYXAoKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCB0cmFpbmluZyBkb2N1bWVudHMgZm9yIHRoaXMgdGFnXHJcbiAgICBmb3IgKGNvbnN0IHsgdGV4dCwgdGFncyB9IG9mIHRoaXMudHJhaW5pbmdCdWZmZXIpIHtcclxuICAgICAgaWYgKHRhZ3MuaW5jbHVkZXModGFnKSkge1xyXG4gICAgICAgIGNvbnN0IHByb2Nlc3NlZCA9IHRoaXMucHJlcHJvY2Vzc1RleHQodGV4dCk7XHJcbiAgICAgICAgY29uc3Qgd29yZHMgPSB0aGlzLnRva2VuaXplKHByb2Nlc3NlZCk7XHJcbiAgICAgICAgY29uc3QgdW5pcXVlV29yZHMgPSBuZXcgU2V0KHdvcmRzKTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGNvbnN0IHdvcmQgb2YgdW5pcXVlV29yZHMpIHtcclxuICAgICAgICAgIGNvbnN0IGRvY0ZyZXEgPSB0aGlzLmRvY0ZyZXF1ZW5jeS5nZXQod29yZCkgfHwgMTtcclxuICAgICAgICAgIGNvbnN0IGlkZiA9IE1hdGgubG9nKCh0aGlzLnRvdGFsRG9jcyArIDEpIC8gZG9jRnJlcSk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIE9ubHkgY29uc2lkZXIgZGlzdGluY3RpdmUgd29yZHMgKHJhcmUgYWNyb3NzIGNvcnB1cylcclxuICAgICAgICAgIGlmIChpZGYgPiAyLjApIHsgLy8gQXBwZWFycyBpbiA8MTQlIG9mIGRvY3VtZW50c1xyXG4gICAgICAgICAgICB0YWdXb3JkU2NvcmVzLnNldCh3b3JkLCAodGFnV29yZFNjb3Jlcy5nZXQod29yZCkgfHwgMCkgKyBpZGYpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBSZXR1cm4gdG9wIDIwIG1vc3QgZGlzdGluY3RpdmUgd29yZHMgZm9yIHRoaXMgdGFnXHJcbiAgICByZXR1cm4gQXJyYXkuZnJvbSh0YWdXb3JkU2NvcmVzLmVudHJpZXMoKSlcclxuICAgICAgLnNvcnQoKGEsIGIpID0+IGJbMV0gLSBhWzFdKVxyXG4gICAgICAuc2xpY2UoMCwgMjApXHJcbiAgICAgIC5tYXAoKFt3b3JkXSkgPT4gd29yZCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDbGFzc2lmeSBhIGRvY3VtZW50IGFuZCByZXR1cm4gdGFnIHN1Z2dlc3Rpb25zIHdpdGggc2ltaWxhcml0eSBzY29yZXNcclxuICAgKi9cclxuICBhc3luYyBjbGFzc2lmeShcclxuICAgIHRleHQ6IHN0cmluZyxcclxuICAgIHdoaXRlbGlzdD86IHN0cmluZ1tdLFxyXG4gICAgbWluU2ltaWxhcml0eTogbnVtYmVyID0gMC4xLFxyXG4gICAgbWF4UmVzdWx0czogbnVtYmVyID0gNSxcclxuICAgIGV4aXN0aW5nVGFnczogc3RyaW5nW10gPSBbXVxyXG4gICk6IFByb21pc2U8QXJyYXk8e3RhZzogc3RyaW5nLCBwcm9iYWJpbGl0eTogbnVtYmVyfT4+IHtcclxuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLnRhZ0VtYmVkZGluZ3MpLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICB0aGlzLmRlYnVnKCdbRW1iZWRkaW5nQ2xhc3NpZmllcl0gTm8gdGFncyB0cmFpbmVkJyk7XHJcbiAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBlbWJlZGRpbmcgPSBhd2FpdCB0aGlzLmdlbmVyYXRlRW1iZWRkaW5nKHRleHQpO1xyXG4gICAgXHJcbiAgICAvLyBHZXQgZG9jdW1lbnQgd29yZHMgZm9yIGRpc2NyaW1pbmF0aXZlIGZpbHRlcmluZ1xyXG4gICAgY29uc3QgcHJvY2Vzc2VkID0gdGhpcy5wcmVwcm9jZXNzVGV4dCh0ZXh0KTtcclxuICAgIGNvbnN0IGRvY1dvcmRzID0gbmV3IFNldCh0aGlzLnRva2VuaXplKHByb2Nlc3NlZCkpO1xyXG4gICAgXHJcbiAgICBjb25zdCB0YWdzID0gd2hpdGVsaXN0ICYmIHdoaXRlbGlzdC5sZW5ndGggPiAwXHJcbiAgICAgID8gd2hpdGVsaXN0LmZpbHRlcih0ID0+IHRoaXMudGFnRW1iZWRkaW5nc1t0XSlcclxuICAgICAgOiBPYmplY3Qua2V5cyh0aGlzLnRhZ0VtYmVkZGluZ3MpO1xyXG4gICAgXHJcbiAgICAvLyBOb3JtYWxpemUgZXhpc3RpbmcgdGFncyB0byBkZXRlY3Qgc3lub255bXNcclxuICAgIGNvbnN0IGV4aXN0aW5nTm9ybWFsaXplZCA9IG5ldyBTZXQoZXhpc3RpbmdUYWdzLm1hcCh0ID0+IHRoaXMubm9ybWFsaXplVGFnKHQpKSk7XHJcbiAgICBcclxuICAgIHRoaXMuZGVidWcoJ1tFbWJlZGRpbmdDbGFzc2lmaWVyXSBFdmFsdWF0aW5nJywgdGFncy5sZW5ndGgsICd0YWdzJyk7XHJcbiAgICBcclxuICAgIGNvbnN0IHNpbWlsYXJpdGllczogQXJyYXk8e3RhZzogc3RyaW5nLCBwcm9iYWJpbGl0eTogbnVtYmVyLCBvdmVybGFwOiBudW1iZXJ9PiA9IFtdO1xyXG4gICAgXHJcbiAgICBmb3IgKGNvbnN0IHRhZyBvZiB0YWdzKSB7XHJcbiAgICAgIC8vIFNraXAgdGFncyB0aGF0IGFscmVhZHkgZXhpc3QgKG9yIHRoZWlyIHN5bm9ueW1zKVxyXG4gICAgICBjb25zdCBub3JtYWxpemVkVGFnID0gdGhpcy5ub3JtYWxpemVUYWcodGFnKTtcclxuICAgICAgaWYgKGV4aXN0aW5nTm9ybWFsaXplZC5oYXMobm9ybWFsaXplZFRhZykpIHtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgY29uc3Qgc2ltaWxhcml0eSA9IHRoaXMuY29zaW5lU2ltaWxhcml0eShlbWJlZGRpbmcsIHRoaXMudGFnRW1iZWRkaW5nc1t0YWddKTtcclxuICAgICAgXHJcbiAgICAgIC8vIENhbGN1bGF0ZSB3b3JkIG92ZXJsYXA6IHdoYXQgJSBvZiB0YWcncyBkaXN0aW5jdGl2ZSB3b3JkcyBhcHBlYXIgaW4gZG9jdW1lbnQ/XHJcbiAgICAgIGNvbnN0IHRhZ1dvcmRzID0gdGhpcy50YWdEaXN0aW5jdGl2ZVdvcmRzW3RhZ10gfHwgW107XHJcbiAgICAgIGNvbnN0IG92ZXJsYXAgPSB0YWdXb3Jkcy5sZW5ndGggPiAwIFxyXG4gICAgICAgID8gdGFnV29yZHMuZmlsdGVyKHcgPT4gZG9jV29yZHMuaGFzKHcpKS5sZW5ndGggLyB0YWdXb3Jkcy5sZW5ndGhcclxuICAgICAgICA6IDEuMDsgLy8gSWYgbm8gZGlzdGluY3RpdmUgd29yZHMgY2FjaGVkLCBkb24ndCBmaWx0ZXJcclxuICAgICAgXHJcbiAgICAgIC8vIFJlcXVpcmUgNDAlIHdvcmQgb3ZlcmxhcCBtaW5pbXVtIC0gdGFncyBuZWVkIHN0cm9uZyB3b3JkIGV2aWRlbmNlXHJcbiAgICAgIC8vIEFsc28gYXBwbHkgbXVjaCBzdHJpY3RlciBzaW1pbGFyaXR5IHJlcXVpcmVtZW50IGZvciBib3JkZXJsaW5lIG92ZXJsYXBcclxuICAgICAgY29uc3QgbWVldHNPdmVybGFwVGhyZXNob2xkID0gb3ZlcmxhcCA+PSAwLjQwO1xyXG4gICAgICBjb25zdCBtZWV0c1NpbWlsYXJpdHlUaHJlc2hvbGQgPSBvdmVybGFwID49IDAuNiBcclxuICAgICAgICA/IHNpbWlsYXJpdHkgPj0gbWluU2ltaWxhcml0eSAgLy8gVmVyeSBoaWdoIG92ZXJsYXA6IG5vcm1hbCB0aHJlc2hvbGRcclxuICAgICAgICA6IHNpbWlsYXJpdHkgPj0gbWluU2ltaWxhcml0eSArIDAuMjU7ICAvLyBMb3dlciBvdmVybGFwOiBtdWNoIGhpZ2hlciBzaW1pbGFyaXR5IHJlcXVpcmVkXHJcbiAgICAgIFxyXG4gICAgICBpZiAobWVldHNPdmVybGFwVGhyZXNob2xkICYmIG1lZXRzU2ltaWxhcml0eVRocmVzaG9sZCkge1xyXG4gICAgICAgIHNpbWlsYXJpdGllcy5wdXNoKHsgdGFnLCBwcm9iYWJpbGl0eTogc2ltaWxhcml0eSwgb3ZlcmxhcCB9KTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTb3J0IGJ5IGNvbWJpbmVkIHNjb3JlOiB3b3JkIG92ZXJsYXAgKDcwJSkgKyBzaW1pbGFyaXR5ICgzMCUpXHJcbiAgICAvLyBPdmVybGFwIGlzIHdlaWdodGVkIG11Y2ggaGlnaGVyIGJlY2F1c2UgaXQgcHJvdmlkZXMgY29uY3JldGUgd29yZCBldmlkZW5jZVxyXG4gICAgc2ltaWxhcml0aWVzLnNvcnQoKGEsIGIpID0+IHtcclxuICAgICAgY29uc3Qgc2NvcmVBID0gYS5vdmVybGFwICogMC43ICsgYS5wcm9iYWJpbGl0eSAqIDAuMztcclxuICAgICAgY29uc3Qgc2NvcmVCID0gYi5vdmVybGFwICogMC43ICsgYi5wcm9iYWJpbGl0eSAqIDAuMztcclxuICAgICAgcmV0dXJuIHNjb3JlQiAtIHNjb3JlQTtcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICB0aGlzLmRlYnVnKCdbRW1iZWRkaW5nQ2xhc3NpZmllcl0gVG9wIDUgcmVzdWx0czonLCBcclxuICAgICAgc2ltaWxhcml0aWVzLnNsaWNlKDAsIDUpLm1hcChyID0+IGAke3IudGFnfTogJHsoci5wcm9iYWJpbGl0eSAqIDEwMCkudG9GaXhlZCgyKX0lIChvdmVybGFwOiAkeyhyLm92ZXJsYXAgKiAxMDApLnRvRml4ZWQoMCl9JSlgKVxyXG4gICAgKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHNpbWlsYXJpdGllcy5zbGljZSgwLCBtYXhSZXN1bHRzKS5tYXAoKHsgdGFnLCBwcm9iYWJpbGl0eSB9KSA9PiAoeyB0YWcsIHByb2JhYmlsaXR5IH0pKTtcclxuICB9XHJcbiAgXHJcbiAgLyoqXHJcbiAgICogTm9ybWFsaXplIHRhZyBmb3Igc3lub255bSBkZXRlY3Rpb25cclxuICAgKi9cclxuICBwcml2YXRlIG5vcm1hbGl6ZVRhZyh0YWc6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgICBjb25zdCBub3JtYWxpemVkID0gdGFnLnRvTG93ZXJDYXNlKCkudHJpbSgpXHJcbiAgICAgIC5yZXBsYWNlKC9bXFxzXy1dKy9nLCAnJyk7IC8vIFJlbW92ZSBzcGFjZXMsIHVuZGVyc2NvcmVzLCBkYXNoZXNcclxuICAgIFxyXG4gICAgLy8gQ29tbW9uIHN5bm9ueW1zXHJcbiAgICBjb25zdCBzeW5vbnltTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gICAgICAnYXJ0aWZpY2lhbGludGVsbGlnZW5jZSc6ICdhaScsXHJcbiAgICAgICdtYWNoaW5lbGVhcm5pbmcnOiAnbWwnLFxyXG4gICAgICAnZGVlcGxlYXJuaW5nJzogJ2RsJyxcclxuICAgICAgJ25hdHVyYWxsYW5ndWFnZXByb2Nlc3NpbmcnOiAnbmxwJyxcclxuICAgICAgJ3VzZXJleHBlcmllbmNlJzogJ3V4JyxcclxuICAgICAgJ3VzZXJpbnRlcmZhY2UnOiAndWknLFxyXG4gICAgICAnc2VhcmNoZW5naW5lb3B0aW1pemF0aW9uJzogJ3NlbycsXHJcbiAgICAgICdqYXZhc2NyaXB0JzogJ2pzJyxcclxuICAgICAgJ3R5cGVzY3JpcHQnOiAndHMnLFxyXG4gICAgICAncHl0aG9uJzogJ3B5J1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHN5bm9ueW1NYXBbbm9ybWFsaXplZF0gfHwgbm9ybWFsaXplZDtcclxuICB9XHJcbiAgXHJcbiAgLyoqXHJcbiAgICogQnVpbGQgc3lub255bSBtYXAgZm9yIGRlZHVwbGljYXRpb25cclxuICAgKi9cclxuICBwcml2YXRlIGJ1aWxkVGFnU3lub255bU1hcCh0YWdzOiBzdHJpbmdbXSk6IE1hcDxzdHJpbmcsIHN0cmluZ1tdPiB7XHJcbiAgICBjb25zdCBzeW5vbnltR3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZ1tdPigpO1xyXG4gICAgXHJcbiAgICBmb3IgKGNvbnN0IHRhZyBvZiB0YWdzKSB7XHJcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB0aGlzLm5vcm1hbGl6ZVRhZyh0YWcpO1xyXG4gICAgICBpZiAoIXN5bm9ueW1Hcm91cHMuaGFzKG5vcm1hbGl6ZWQpKSB7XHJcbiAgICAgICAgc3lub255bUdyb3Vwcy5zZXQobm9ybWFsaXplZCwgW10pO1xyXG4gICAgICB9XHJcbiAgICAgIHN5bm9ueW1Hcm91cHMuZ2V0KG5vcm1hbGl6ZWQpIS5wdXNoKHRhZyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBzeW5vbnltR3JvdXBzO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUHJlcHJvY2VzcyB0ZXh0XHJcbiAgICovXHJcbiAgcHJpdmF0ZSBwcmVwcm9jZXNzVGV4dCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgLy8gUmVtb3ZlIGZyb250bWF0dGVyXHJcbiAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKC9eLS0tW1xcc1xcU10qPy0tLS8sICcnKTtcclxuICAgIFxyXG4gICAgLy8gUmVtb3ZlIG1hcmtkb3duIGxpbmtzIGJ1dCBrZWVwIHRleHRcclxuICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UoL1xcWyhbXlxcXV0rKVxcXVxcKFteKV0rXFwpL2csICckMScpO1xyXG4gICAgXHJcbiAgICAvLyBSZW1vdmUgbWFya2Rvd24gaW1hZ2VzXHJcbiAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKC8hXFxbKFteXFxdXSopXFxdXFwoW14pXStcXCkvZywgJycpO1xyXG4gICAgXHJcbiAgICAvLyBSZW1vdmUgY29kZSBibG9ja3NcclxuICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UoL2BgYFtcXHNcXFNdKj9gYGAvZywgJycpO1xyXG4gICAgdGV4dCA9IHRleHQucmVwbGFjZSgvYFteYF0rYC9nLCAnJyk7XHJcbiAgICBcclxuICAgIC8vIFJlbW92ZSBIVE1MIHRhZ3NcclxuICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UoLzxbXj5dKz4vZywgJycpO1xyXG4gICAgXHJcbiAgICAvLyBDb252ZXJ0IHRvIGxvd2VyY2FzZVxyXG4gICAgdGV4dCA9IHRleHQudG9Mb3dlckNhc2UoKTtcclxuICAgIFxyXG4gICAgLy8gQXBwbHkgc3lub255bSBub3JtYWxpemF0aW9uXHJcbiAgICBjb25zdCBzeW5vbnltczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcclxuICAgICAgJ2FydGlmaWNpYWwgaW50ZWxsaWdlbmNlJzogJ2FpJyxcclxuICAgICAgJ21hY2hpbmUgbGVhcm5pbmcnOiAnbWFjaGluZWxlYXJuaW5nJyxcclxuICAgICAgJ2RlZXAgbGVhcm5pbmcnOiAnZGVlcGxlYXJuaW5nJyxcclxuICAgICAgJ25hdHVyYWwgbGFuZ3VhZ2UgcHJvY2Vzc2luZyc6ICdubHAnLFxyXG4gICAgICAndXNlciBleHBlcmllbmNlJzogJ3V4JyxcclxuICAgICAgJ3VzZXIgaW50ZXJmYWNlJzogJ3VpJyxcclxuICAgICAgJ3NlYXJjaCBlbmdpbmUgb3B0aW1pemF0aW9uJzogJ3NlbydcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZvciAoY29uc3QgW3BocmFzZSwgbm9ybWFsaXplZF0gb2YgT2JqZWN0LmVudHJpZXMoc3lub255bXMpKSB7XHJcbiAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cCgnXFxcXGInICsgcGhyYXNlLnJlcGxhY2UoL1xccysvZywgJ1xcXFxzKycpICsgJ1xcXFxiJywgJ2dpJyk7XHJcbiAgICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UocmVnZXgsIG5vcm1hbGl6ZWQpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBSZW1vdmUgc3BlY2lhbCBjaGFyYWN0ZXJzIGJ1dCBrZWVwIHNwYWNlc1xyXG4gICAgdGV4dCA9IHRleHQucmVwbGFjZSgvW15cXHdcXHNdL2csICcgJyk7XHJcbiAgICBcclxuICAgIC8vIE5vcm1hbGl6ZSB3aGl0ZXNwYWNlXHJcbiAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpO1xyXG4gICAgXHJcbiAgICByZXR1cm4gdGV4dDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFRva2VuaXplIHRleHQgaW50byB3b3Jkc1xyXG4gICAqL1xyXG4gIHByaXZhdGUgdG9rZW5pemUodGV4dDogc3RyaW5nKTogc3RyaW5nW10ge1xyXG4gICAgcmV0dXJuIHRleHRcclxuICAgICAgLnRvTG93ZXJDYXNlKClcclxuICAgICAgLnNwbGl0KC9cXHMrLylcclxuICAgICAgLmZpbHRlcih3b3JkID0+IHdvcmQubGVuZ3RoID49IDIpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVzZXQgdGhlIGNsYXNzaWZpZXJcclxuICAgKi9cclxuICByZXNldCgpOiB2b2lkIHtcclxuICAgIHRoaXMudGFnRW1iZWRkaW5ncyA9IHt9O1xyXG4gICAgdGhpcy50YWdEb2NDb3VudHMgPSB7fTtcclxuICAgIHRoaXMudG90YWxEb2NzID0gMDtcclxuICAgIHRoaXMuZW1iZWRkaW5nQ2FjaGUuY2xlYXIoKTtcclxuICAgIHRoaXMuZG9jRnJlcXVlbmN5LmNsZWFyKCk7XHJcbiAgICB0aGlzLnRyYWluaW5nQnVmZmVyID0gW107XHJcbiAgICB0aGlzLnRhZ0Rpc3RpbmN0aXZlV29yZHMgPSB7fTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEV4cG9ydCBjbGFzc2lmaWVyIGRhdGEgZm9yIHBlcnNpc3RlbmNlXHJcbiAgICovXHJcbiAgZXhwb3J0KCk6IEVtYmVkZGluZ0NsYXNzaWZpZXJEYXRhIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHRhZ0VtYmVkZGluZ3M6IHRoaXMudGFnRW1iZWRkaW5ncyxcclxuICAgICAgdGFnRG9jQ291bnRzOiB0aGlzLnRhZ0RvY0NvdW50cyxcclxuICAgICAgdG90YWxEb2NzOiB0aGlzLnRvdGFsRG9jcyxcclxuICAgICAgdGFnRGlzdGluY3RpdmVXb3JkczogdGhpcy50YWdEaXN0aW5jdGl2ZVdvcmRzLFxyXG4gICAgICBkb2NGcmVxdWVuY3k6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLmRvY0ZyZXF1ZW5jeSlcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBJbXBvcnQgY2xhc3NpZmllciBkYXRhXHJcbiAgICovXHJcbiAgaW1wb3J0KGRhdGE6IEVtYmVkZGluZ0NsYXNzaWZpZXJEYXRhKTogdm9pZCB7XHJcbiAgICBpZiAoIWRhdGEpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNsYXNzaWZpZXIgZGF0YScpO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMudGFnRW1iZWRkaW5ncyA9IGRhdGEudGFnRW1iZWRkaW5ncyB8fCB7fTtcclxuICAgIHRoaXMudGFnRG9jQ291bnRzID0gZGF0YS50YWdEb2NDb3VudHMgfHwge307XHJcbiAgICB0aGlzLnRvdGFsRG9jcyA9IGRhdGEudG90YWxEb2NzIHx8IDA7XHJcbiAgICB0aGlzLnRhZ0Rpc3RpbmN0aXZlV29yZHMgPSBkYXRhLnRhZ0Rpc3RpbmN0aXZlV29yZHMgfHwge307XHJcbiAgICBcclxuICAgIC8vIFJlc3RvcmUgZG9jRnJlcXVlbmN5IE1hcFxyXG4gICAgdGhpcy5kb2NGcmVxdWVuY3kuY2xlYXIoKTtcclxuICAgIGlmIChkYXRhLmRvY0ZyZXF1ZW5jeSkge1xyXG4gICAgICBmb3IgKGNvbnN0IFt3b3JkLCBmcmVxXSBvZiBPYmplY3QuZW50cmllcyhkYXRhLmRvY0ZyZXF1ZW5jeSkpIHtcclxuICAgICAgICB0aGlzLmRvY0ZyZXF1ZW5jeS5zZXQod29yZCwgZnJlcSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5lbWJlZGRpbmdDYWNoZS5jbGVhcigpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGNsYXNzaWZpZXIgc3RhdGlzdGljc1xyXG4gICAqL1xyXG4gIGdldFN0YXRzKCk6IHsgdG90YWxEb2NzOiBudW1iZXI7IHRvdGFsVGFnczogbnVtYmVyIH0ge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgdG90YWxEb2NzOiB0aGlzLnRvdGFsRG9jcyxcclxuICAgICAgdG90YWxUYWdzOiBPYmplY3Qua2V5cyh0aGlzLnRhZ0VtYmVkZGluZ3MpLmxlbmd0aFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBhbGwga25vd24gdGFnc1xyXG4gICAqL1xyXG4gIGdldEFsbFRhZ3MoKTogc3RyaW5nW10ge1xyXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMudGFnRW1iZWRkaW5ncykuc29ydCgpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGRvY3VtZW50IGNvdW50IGZvciBhIHNwZWNpZmljIHRhZ1xyXG4gICAqL1xyXG4gIGdldFRhZ0RvY0NvdW50KHRhZzogc3RyaW5nKTogbnVtYmVyIHtcclxuICAgIHJldHVybiB0aGlzLnRhZ0RvY0NvdW50c1t0YWddIHx8IDA7XHJcbiAgfVxyXG59XHJcbiJdfQ==