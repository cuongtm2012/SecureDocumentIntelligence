
// VietOCR service has been removed
// This file is kept for compatibility but all functionality is disabled

export interface VietOCRResult {
  success: boolean;
  extractedData: any;
  confidence: number;
  processingTime: number;
  processingMethod: string;
  rawText?: string;
  regions?: Array<any>;
  error?: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  text: string;
  structured_data: any;
  image_path: string;
  timestamp: number;
}

export class VietOCRQdrantProcessor {
  async processIDCard(filePath: string): Promise<VietOCRResult> {
    return {
      success: false,
      extractedData: {},
      confidence: 0,
      processingTime: 0,
      processingMethod: 'vietocr-disabled',
      error: 'VietOCR service has been removed'
    };
  }

  async searchSimilarDocuments(query: string, limit: number = 5): Promise<VectorSearchResult[]> {
    return [];
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    return {
      status: 'disabled',
      details: {
        script_exists: false,
        vietocr_available: false,
        qdrant_available: false,
        python_available: false,
        error: 'VietOCR service has been removed'
      }
    };
  }
}

export const vietOCRQdrantProcessor = new VietOCRQdrantProcessor();
