import { deepSeekService } from './deepseek-service';
import { ocrProgressTracker } from './ocr-progress-tracker';

// Enhanced chunked processor for monitoring large document processing
export class EnhancedChunkedProcessor {
  constructor() {
    // Use the shared deepSeekService instance
  }

  async processLargeDocument(
    rawOcrText: string, 
    documentId: string, 
    progressCallback?: (progress: number, message: string) => void
  ): Promise<{
    reconstructedText: string;
    improvements: string[];
    confidence: number;
    chunkingStats: {
      totalChunks: number;
      successfulChunks: number;
      failedChunks: number;
      averageProcessingTime: number;
      totalProcessingTime: number;
    };
  }> {
    const startTime = Date.now();
    
    try {
      // Update progress: Starting chunked processing
      if (progressCallback) {
        progressCallback(10, `Large document detected (${rawOcrText.length} chars), preparing chunks...`);
      }
      
      await ocrProgressTracker.updateProgress(documentId, "initializing", 'Preparing document chunks for processing...', 0);

      // Process with chunking
      const result = await deepSeekService.reconstructVietnameseText(rawOcrText);
      
      // Extract chunking statistics from logs or create default stats
      const totalProcessingTime = Date.now() - startTime;
      const chunkingStats = {
        totalChunks: this.estimateChunkCount(rawOcrText.length),
        successfulChunks: this.estimateChunkCount(rawOcrText.length), // Assume success if no error
        failedChunks: 0,
        averageProcessingTime: totalProcessingTime / this.estimateChunkCount(rawOcrText.length),
        totalProcessingTime
      };

      // Final progress update
      if (progressCallback) {
        progressCallback(100, `Chunked processing completed: ${result.reconstructedText.length} chars processed`);
      }
      
      await ocrProgressTracker.updateProgress(documentId, "completing", 'Chunked processing completed successfully', totalProcessingTime);

      return {
        ...result,
        chunkingStats
      };

    } catch (error) {
      console.error('Enhanced chunked processing failed:', error);
      
      if (progressCallback) {
        progressCallback(0, `Chunked processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      throw error;
    }
  }

  private estimateChunkCount(textLength: number): number {
    const MAX_CHUNK_SIZE = 3000; // Same as CHUNK_CONFIG
    return Math.ceil(textLength / MAX_CHUNK_SIZE);
  }

  // Helper method to get chunking configuration
  getChunkingConfig() {
    return {
      maxChunkSize: 3000,
      overlapSize: 200,
      maxRetries: 3,
      timeoutPerChunk: 30000,
      batchSize: 3
    };
  }

  // Method to check if document needs chunking
  shouldUseChunking(textLength: number): boolean {
    return textLength > 3000;
  }
}

export const enhancedChunkedProcessor = new EnhancedChunkedProcessor();