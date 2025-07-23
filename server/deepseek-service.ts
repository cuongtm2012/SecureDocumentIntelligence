import OpenAI from "openai";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Initialize OpenAI client for DeepSeek
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000, // 60 second timeout
});

// Test API connection
async function testDeepSeekConnection() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️ DeepSeek API key not configured');
      return false;
    }
    
    console.log('🔄 Testing DeepSeek API connection...');
    const response = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 10
    });
    
    console.log('✅ DeepSeek API connection successful');
    return true;
  } catch (error: any) {
    console.error('❌ DeepSeek API connection failed:', error.message);
    if (error.status === 401) {
      console.error('🔑 Invalid API key - please check your OPENAI_API_KEY in .env file');
    } else if (error.status === 402) {
      console.error('💳 Insufficient balance - please add credits to your DeepSeek account');
    } else if (error.status === 429) {
      console.error('⏱️ Rate limit exceeded - please try again later');
    }
    return false;
  }
}

// Test connection on import
testDeepSeekConnection();

export interface DeepSeekOCRResult {
  extractedText: string;
  confidence: number;
  structuredData: any;
  processingTime: number;
  improvements?: string[];
  pageCount?: number;
  processingMethod?: string;
}

// Configuration for chunk processing
const CHUNK_CONFIG = {
  MAX_CHUNK_SIZE: 3000, // Maximum characters per chunk
  OVERLAP_SIZE: 200, // Overlap between chunks to maintain context
  MAX_RETRIES: 3, // Maximum retries for failed chunks
  TIMEOUT_PER_CHUNK: 30000, // 30 seconds per chunk
  BATCH_SIZE: 3, // Maximum concurrent chunks to process
};

export class DeepSeekService {
  async processDocumentImage(imagePath: string, documentType?: string): Promise<DeepSeekOCRResult> {
    const startTime = Date.now();
    
    try {
      // Read the image file and convert to base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(imagePath);
      
      // Create system prompt for document analysis
      const systemPrompt = this.createSystemPrompt(documentType);
      
      // DeepSeek doesn't support vision models, so we'll use their text model with OCR description
      // First, let's use a basic OCR approach and then enhance with DeepSeek analysis
      const sharp = await import('sharp');
      const { createWorker } = await import('tesseract.js');
      
      // Enhanced image preprocessing for Vietnamese text
      const processedImageBuffer = await sharp.default(imagePath)
        .resize({ width: 2000, withoutEnlargement: true }) // Upscale for better OCR
        .rotate() // Auto-rotate based on EXIF
        .greyscale() // Convert to grayscale for better text recognition
        .normalize() // Normalize contrast
        .sharpen({ sigma: 1, m1: 0.5, m2: 2 }) // Enhanced sharpening
        .threshold(128) // Binary threshold for clean text
        .png({ quality: 100 })
        .toBuffer();

      // Configure Tesseract for Vietnamese language with optimized settings
      const worker = await createWorker(['vie', 'eng'], 1, {
        logger: m => console.log(`Tesseract: ${m.status} - ${m.progress}`)
      });
      
      // Configure for better Vietnamese text recognition
      await worker.setParameters({
        'preserve_interword_spaces': '1'
      });

      const { data: { text: ocrText, confidence: ocrConfidence } } = await worker.recognize(processedImageBuffer);
      await worker.terminate();

      // Now use DeepSeek to enhance the OCR results and extract structured data
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `${systemPrompt}

The following text was extracted from a document image using OCR. Please analyze and structure this text according to the format specified above.`
          },
          {
            role: "user",
            content: `Please analyze this OCR-extracted text and provide structured data extraction:

OCR Text:
${ocrText}

OCR Confidence: ${(ocrConfidence / 100).toFixed(2)}

Please provide your response in the exact JSON format specified in the system prompt, improving upon the OCR results with intelligent analysis.`
          }
        ],
        temperature: 0.1,
        max_tokens: 4000
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error("No response from DeepSeek API");
      }

      // Parse the structured response and combine with OCR data
      const enhancedResult = this.parseDeepSeekResponse(responseContent);
      
      const processingTime = Date.now() - startTime;
      
      return {
        extractedText: ocrText, // Use original OCR text
        confidence: Math.max(ocrConfidence / 100, enhancedResult.confidence), // Use higher confidence
        structuredData: {
          ...enhancedResult.structuredData,
          ocrConfidence: ocrConfidence / 100,
          enhancedByAI: true,
          processingMethod: "Tesseract OCR + DeepSeek AI Analysis"
        },
        processingTime
      };
      
    } catch (error: any) {
      console.error('DeepSeek OCR processing error:', error);
      
      // Handle specific error types
      if (error.status === 402) {
        throw new Error(`DeepSeek API insufficient balance. Please add credits to your DeepSeek account.`);
      } else if (error.status === 401) {
        throw new Error(`DeepSeek API authentication failed. Please check your API key.`);
      } else if (error.status === 429) {
        throw new Error(`DeepSeek API rate limit exceeded. Please try again later.`);
      } else {
        throw new Error(`DeepSeek processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      default:
        return 'image/jpeg';
    }
  }

  private createSystemPrompt(documentType?: string): string {
    return `You are an advanced OCR and document analysis AI specialized in processing government and official documents. Your task is to:

1. Extract ALL text from the document image with high accuracy
2. Identify and structure key information fields
3. Classify the document type if not specified
4. Provide confidence assessment
5. Return results in a specific JSON format

Document Type Context: ${documentType || 'Unknown - please identify'}

CRITICAL: Return your response in this exact JSON format:
{
  "extractedText": "Complete extracted text from the document",
  "confidence": 0.95,
  "structuredData": {
    "documentType": "Type of document",
    "classification": "Security classification level",
    "caseNumber": "Case/Reference number if present",
    "date": "Document date if present",
    "issuer": "Issuing authority if present",
    "recipient": "Recipient if present",
    "subject": "Subject/title if present",
    "keyEntities": ["List of important names, places, organizations"],
    "keyDates": ["List of important dates mentioned"],
    "priority": "Priority level if indicated",
    "actionItems": ["List of action items or requirements"],
    "customFields": {}
  }
}

Guidelines:
- Extract text exactly as written, preserving formatting where possible
- Confidence should be between 0.0 and 1.0 based on image quality and text clarity
- For government documents, pay special attention to classification markings, case numbers, and official seals
- If certain fields are not present, use null or empty values
- Be extremely accurate with numbers, dates, and proper names
- Identify any redacted or illegible portions`;
  }

  private parseDeepSeekResponse(response: string): Omit<DeepSeekOCRResult, 'processingTime'> {
    try {
      console.log('Raw DeepSeek response:', response.substring(0, 500) + '...');
      
      // Clean the response first
      let cleanedResponse = response.trim();
      
      // Remove markdown code blocks if present
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      
      // Find JSON content between braces
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        let jsonString = jsonMatch[0];
        
        // Fix common JSON issues
        jsonString = jsonString
          .replace(/,\s*}/g, '}')  // Remove trailing commas
          .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
          .replace(/([{,]\s*)(\w+):/g, '$1"$2":')  // Add quotes to unquoted keys
          .replace(/:\s*'([^']*?)'/g, ': "$1"')  // Replace single quotes with double quotes
          .replace(/\\n/g, '\\n')  // Ensure proper newline escaping
          .replace(/[\x00-\x1F\x7F-\x9F]/g, '');  // Remove control characters
        
        try {
          const parsed = JSON.parse(jsonString);
          
          return {
            extractedText: parsed.extractedText || parsed.text || '',
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
            structuredData: parsed.structuredData || parsed.data || {}
          };
        } catch (parseError) {
          console.error('JSON parsing failed:', parseError);
          console.error('Attempted to parse:', jsonString.substring(0, 200));
          
          // Try to extract just the text content
          const textMatch = response.match(/"extractedText":\s*"([^"]*?)"/);
          const extractedText = textMatch ? textMatch[1] : response.substring(0, 1000);
          
          return {
            extractedText: extractedText,
            confidence: 0.7,
            structuredData: {
              documentType: 'Unknown',
              classification: 'Unclassified',
              error: 'JSON parsing failed, extracted partial content'
            }
          };
        }
      }
      
      // If no JSON found, treat as plain text response
      console.log('No JSON found in response, treating as plain text');
      return {
        extractedText: cleanedResponse.substring(0, 2000), // Limit text length
        confidence: 0.6,
        structuredData: {
          documentType: 'Unknown',
          classification: 'Unclassified',
          processingNote: 'Response was plain text, not JSON'
        }
      };
      
    } catch (error) {
      console.error('Error parsing DeepSeek response:', error);
      console.error('Original response length:', response.length);
      
      // Fallback: extract any readable text
      const fallbackText = response
        .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ' ') // Remove non-printable chars
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 1000);
      
      return {
        extractedText: fallbackText || 'Failed to extract text from response',
        confidence: 0.5,
        structuredData: {
          documentType: 'Unknown',
          classification: 'Unclassified',
          error: `Parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      };
    }
  }

  // Chunked processing for large documents
  async reconstructVietnameseText(rawOcrText: string): Promise<{
    reconstructedText: string;
    improvements: string[];
    confidence: number;
  }> {
    // Check if text is large enough to require chunking
    if (rawOcrText.length <= CHUNK_CONFIG.MAX_CHUNK_SIZE) {
      return this.processTextChunk(rawOcrText, 0, 1);
    }

    console.log(`📊 Large document detected (${rawOcrText.length} chars), processing in chunks...`);
    return this.processLargeTextInChunks(rawOcrText);
  }

  private async processLargeTextInChunks(rawOcrText: string): Promise<{
    reconstructedText: string;
    improvements: string[];
    confidence: number;
  }> {
    try {
      // Split text into chunks
      const chunks = this.splitTextIntoChunks(rawOcrText);
      console.log(`📄 Split text into ${chunks.length} chunks for processing`);

      // Process chunks in batches with retry logic
      const processedChunks = await this.processBatches(chunks);

      // Recombine processed chunks
      const combinedResult = this.recombineChunks(processedChunks);

      // Optional: Final pass to smooth chunk boundaries
      const finalResult = await this.smoothChunkBoundaries(combinedResult);

      console.log(`✅ Large document processing completed: ${finalResult.reconstructedText.length} chars`);
      return finalResult;

    } catch (error) {
      console.error('❌ Large document chunking failed:', error);
      // Fallback to simple processing
      return this.processTextChunk(rawOcrText, 0, 1);
    }
  }

  private splitTextIntoChunks(text: string): Array<{chunk: string, index: number, originalStart: number}> {
    const chunks: Array<{chunk: string, index: number, originalStart: number}> = [];
    let currentPosition = 0;
    let chunkIndex = 0;

    while (currentPosition < text.length) {
      let chunkEnd = Math.min(currentPosition + CHUNK_CONFIG.MAX_CHUNK_SIZE, text.length);
      
      // Try to break at sentence boundaries to maintain context
      if (chunkEnd < text.length) {
        const sentenceBreak = text.lastIndexOf('.', chunkEnd);
        const lineBreak = text.lastIndexOf('\n', chunkEnd);
        const breakPoint = Math.max(sentenceBreak, lineBreak);
        
        if (breakPoint > currentPosition + CHUNK_CONFIG.MAX_CHUNK_SIZE / 2) {
          chunkEnd = breakPoint + 1;
        }
      }

      // Include overlap from previous chunk
      let chunkStart = currentPosition;
      if (chunkIndex > 0) {
        chunkStart = Math.max(0, currentPosition - CHUNK_CONFIG.OVERLAP_SIZE);
      }

      const chunk = text.slice(chunkStart, chunkEnd);
      chunks.push({
        chunk: chunk,
        index: chunkIndex,
        originalStart: currentPosition
      });

      currentPosition = chunkEnd;
      chunkIndex++;
    }

    return chunks;
  }

  private async processBatches(chunks: Array<{chunk: string, index: number, originalStart: number}>): Promise<Array<{
    reconstructedText: string;
    improvements: string[];
    confidence: number;
    index: number;
  }>> {
    const results: Array<{
      reconstructedText: string;
      improvements: string[];
      confidence: number;
      index: number;
    }> = [];

    // Process chunks in batches
    for (let i = 0; i < chunks.length; i += CHUNK_CONFIG.BATCH_SIZE) {
      const batch = chunks.slice(i, i + CHUNK_CONFIG.BATCH_SIZE);
      console.log(`🔄 Processing batch ${Math.floor(i / CHUNK_CONFIG.BATCH_SIZE) + 1}/${Math.ceil(chunks.length / CHUNK_CONFIG.BATCH_SIZE)} (${batch.length} chunks)`);

      const batchPromises = batch.map(chunkData => 
        this.processChunkWithRetry(chunkData.chunk, chunkData.index, chunks.length)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, batchIndex) => {
        const chunkIndex = batch[batchIndex].index;
        if (result.status === 'fulfilled') {
          results.push({
            ...result.value,
            index: chunkIndex
          });
        } else {
          console.error(`❌ Chunk ${chunkIndex} failed:`, result.reason);
          // Add fallback result for failed chunk
          results.push({
            reconstructedText: batch[batchIndex].chunk,
            improvements: ['Failed to process chunk, using original text'],
            confidence: 0.5,
            index: chunkIndex
          });
        }
      });

      // Add delay between batches to avoid rate limiting
      if (i + CHUNK_CONFIG.BATCH_SIZE < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Sort results by index to maintain order
    return results.sort((a, b) => a.index - b.index);
  }

  private async processChunkWithRetry(chunkText: string, chunkIndex: number, totalChunks: number): Promise<{
    reconstructedText: string;
    improvements: string[];
    confidence: number;
  }> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= CHUNK_CONFIG.MAX_RETRIES; attempt++) {
      try {
        console.log(`🔧 Processing chunk ${chunkIndex + 1}/${totalChunks} (attempt ${attempt})`);
        return await this.processTextChunk(chunkText, chunkIndex, totalChunks);
      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️ Chunk ${chunkIndex + 1} attempt ${attempt} failed:`, error);
        
        if (attempt < CHUNK_CONFIG.MAX_RETRIES) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error(`Failed to process chunk after ${CHUNK_CONFIG.MAX_RETRIES} attempts`);
  }

  private async processTextChunk(chunkText: string, chunkIndex: number, totalChunks: number): Promise<{
    reconstructedText: string;
    improvements: string[];
    confidence: number;
  }> {
    try {
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `Bạn là chuyên gia xử lý văn bản tiếng Việt, chuyên về việc phục hồi văn bản hành chính/pháp lý bị lỗi OCR.

Nhiệm vụ của bạn:
- Phục hồi lại văn bản gốc từ text đã bị lỗi OCR
- Sửa các lỗi chính tả, lỗi ký tự, lỗi định dạng
- Đảm bảo đúng thể thức văn bản hành chính Việt Nam
- Chuẩn hóa câu chữ pháp lý
- Tuyệt đối KHÔNG tự ý thêm hoặc bớt nội dung

Trả về kết quả theo định dạng JSON:
{
  "reconstructedText": "văn bản đã được phục hồi",
  "improvements": ["danh sách các cải tiến đã thực hiện"],
  "confidence": 0.95
}`
          },
          {
            role: "user",
            content: `Dưới đây là một đoạn văn bản hành chính/pháp lý của cơ quan nhà nước Việt Nam, nhưng đã bị lỗi nhiều ký tự do nhận diện từ ảnh (OCR).

${totalChunks > 1 ? `Đây là phần ${chunkIndex + 1}/${totalChunks} của tài liệu. Chú ý duy trì tính liên kết với các phần khác.` : ''}

Nhiệm vụ của bạn:
Phục hồi lại văn bản gốc, viết lại đoạn văn bản sao cho đúng thể thức, chuẩn câu chữ pháp lý, sửa các lỗi chính tả, lỗi ký tự, lỗi định dạng do OCR gây ra.
Tuyệt đối không tự ý thêm hoặc bớt nội dung, chỉ sửa các lỗi và căn chỉnh cho đúng văn phong văn bản hành chính.

Đây là đoạn raw text cần phục hồi:
${chunkText}`
          }
        ],
        temperature: 0.1,
        max_tokens: 4000
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error("No response from DeepSeek API for text reconstruction");
      }

      // Parse the JSON response
      try {
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            reconstructedText: parsed.reconstructedText || chunkText,
            improvements: parsed.improvements || [`Chunk ${chunkIndex + 1}/${totalChunks} processed`],
            confidence: parsed.confidence || 0.8
          };
        }
      } catch (parseError) {
        console.warn('Failed to parse JSON response, using raw response');
      }

      // Fallback: treat as plain text response
      return {
        reconstructedText: responseContent.replace(/^[^a-zA-ZÀ-ỹ]*/, '').trim(),
        improvements: [`DeepSeek chunk ${chunkIndex + 1}/${totalChunks} processed (fallback)`],
        confidence: 0.7
      };

    } catch (error: any) {
      console.error(`DeepSeek chunk ${chunkIndex + 1}/${totalChunks} error:`, error);
      
      // Handle specific error types
      if (error.status === 402) {
        throw new Error(`DeepSeek API insufficient balance. Please add credits to your DeepSeek account.`);
      } else if (error.status === 401) {
        throw new Error(`DeepSeek API authentication failed. Please check your API key.`);
      } else if (error.status === 429) {
        throw new Error(`DeepSeek API rate limit exceeded. Please try again later.`);
      } else {
        throw new Error(`Text reconstruction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private recombineChunks(processedChunks: Array<{
    reconstructedText: string;
    improvements: string[];
    confidence: number;
    index: number;
  }>): {
    reconstructedText: string;
    improvements: string[];
    confidence: number;
  } {
    console.log('🔧 Recombining processed chunks...');
    
    // Combine texts, removing overlap
    let combinedText = '';
    let allImprovements: string[] = [];
    let totalConfidence = 0;

    processedChunks.forEach((chunk, i) => {
      if (i === 0) {
        // First chunk: use as-is
        combinedText = chunk.reconstructedText;
      } else {
        // Subsequent chunks: remove overlap from the beginning
        let chunkText = chunk.reconstructedText;
        
        // Try to find overlap with previous chunk
        const overlapSearch = Math.min(CHUNK_CONFIG.OVERLAP_SIZE, chunkText.length);
        const lastPart = combinedText.slice(-overlapSearch);
        
        if (lastPart.length > 0) {
          const overlapIndex = chunkText.indexOf(lastPart);
          if (overlapIndex >= 0 && overlapIndex < overlapSearch) {
            chunkText = chunkText.slice(overlapIndex + lastPart.length);
          }
        }
        
        combinedText += chunkText;
      }
      
      allImprovements.push(...chunk.improvements);
      totalConfidence += chunk.confidence;
    });

    const averageConfidence = processedChunks.length > 0 ? totalConfidence / processedChunks.length : 0;
    
    console.log(`✅ Recombined ${processedChunks.length} chunks into ${combinedText.length} characters`);
    
    return {
      reconstructedText: combinedText,
      improvements: allImprovements,
      confidence: averageConfidence
    };
  }

  private async smoothChunkBoundaries(combinedResult: {
    reconstructedText: string;
    improvements: string[];
    confidence: number;
  }): Promise<{
    reconstructedText: string;
    improvements: string[];
    confidence: number;
  }> {
    // Skip final pass if text is still too large or if confidence is already high
    if (combinedResult.reconstructedText.length > CHUNK_CONFIG.MAX_CHUNK_SIZE * 2 || combinedResult.confidence > 0.9) {
      return combinedResult;
    }

    try {
      console.log('🔧 Performing final smoothing pass...');
      
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `Bạn là chuyên gia hoàn thiện văn bản tiếng Việt. Nhiệm vụ của bạn là:
- Làm mượt các đoạn nối giữa các phần văn bản đã được xử lý riêng lẻ
- Đảm bảo tính liên kết và mạch lạc của toàn bộ văn bản
- Sửa lỗi nhỏ về ngữ pháp và chính tả còn sót lại
- KHÔNG thêm hoặc bớt nội dung, chỉ làm mượt các chỗ nối

Trả về kết quả theo định dạng JSON:
{
  "reconstructedText": "văn bản đã được làm mượt",
  "improvements": ["danh sách các cải tiến đã thực hiện"],
  "confidence": 0.95
}`
          },
          {
            role: "user",
            content: `Đây là văn bản đã được xử lý từng phần và ghép lại. Hãy làm mượt các chỗ nối và hoàn thiện văn bản:

${combinedResult.reconstructedText}`
          }
        ],
        temperature: 0.1,
        max_tokens: 4000,
        timeout: CHUNK_CONFIG.TIMEOUT_PER_CHUNK
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        return combinedResult; // Return original if no response
      }

      try {
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            reconstructedText: parsed.reconstructedText || combinedResult.reconstructedText,
            improvements: [...combinedResult.improvements, ...parsed.improvements || ['Final smoothing applied']],
            confidence: Math.min(parsed.confidence || combinedResult.confidence, 1.0)
          };
        }
      } catch (parseError) {
        console.warn('Failed to parse smoothing response, using original');
      }

      return combinedResult;

    } catch (error) {
      console.warn('Final smoothing failed, using combined result:', error);
      return combinedResult;
    }
  }

  async analyzeDocument(extractedText: string, documentContext?: string): Promise<any> {
    try {
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `You are an expert document analyst for government and official documents. Analyze the provided text and extract key insights, patterns, and structured information.

Context: ${documentContext || 'General document analysis'}

Provide analysis in JSON format with:
- summary: Brief summary of the document
- keyFindings: Important findings or information
- entities: People, organizations, locations mentioned
- dates: Important dates and timelines
- actionItems: Any actions required or mentioned
- riskAssessment: Security or operational risks identified
- recommendations: Any recommendations for follow-up`
          },
          {
            role: "user",
            content: `Please analyze this document text:\n\n${extractedText}`
          }
        ],
        temperature: 0.2,
        max_tokens: 2000
      });

      const analysisContent = completion.choices[0]?.message?.content;
      if (!analysisContent) {
        throw new Error("No analysis response from DeepSeek API");
      }

      // Try to parse as JSON, fallback to text if needed
      try {
        const jsonMatch = analysisContent.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: analysisContent };
      } catch {
        return { analysis: analysisContent };
      }
      
    } catch (error) {
      console.error('DeepSeek document analysis error:', error);
      throw new Error(`Document analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async processPDFDocument(pdfPath: string, documentType?: string): Promise<DeepSeekOCRResult> {
    const startTime = Date.now();
    
    try {
      console.log(`Processing PDF document with DeepSeek AI: ${pdfPath}`);
      
      // First, extract text from PDF using pdf-parse
      let pdfData;
      try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfParse = (await import('pdf-parse')).default;
        pdfData = await pdfParse(pdfBuffer);
      } catch (importError) {
        console.error('PDF-parse import error, trying alternative approach:', importError);
        // Fallback to a different PDF processing approach
        throw new Error('PDF text extraction failed - library issue');
      }
      
      console.log(`📄 PDF extracted text length: ${pdfData.text.length} characters`);
      console.log(`📄 PDF pages: ${pdfData.numpages}`);
      
      if (!pdfData.text || pdfData.text.trim().length < 10) {
        throw new Error('PDF contains no readable text or text is too short');
      }

      // Now use DeepSeek to reconstruct and enhance the extracted text
      const reconstruction = await this.reconstructVietnameseText(pdfData.text);
      
      // Also perform document analysis
      const analysis = await this.analyzeDocument(
        reconstruction.reconstructedText, 
        `Vietnamese PDF document analysis: ${documentType}`
      );

      const processingTime = Date.now() - startTime;

      return {
        extractedText: reconstruction.reconstructedText,
        confidence: Math.max(0.8, reconstruction.confidence), // PDF text extraction usually reliable
        structuredData: {
          documentType: documentType || 'Vietnamese PDF Document',
          pageCount: pdfData.numpages,
          originalTextLength: pdfData.text.length,
          reconstructedTextLength: reconstruction.reconstructedText.length,
          improvements: reconstruction.improvements,
          analysis: analysis,
          pdfMetadata: pdfData.metadata || {}
        },
        processingTime,
        improvements: [
          "PDF text extracted using pdf-parse",
          "Vietnamese text reconstruction applied",
          ...reconstruction.improvements
        ],
        pageCount: pdfData.numpages,
        processingMethod: 'pdf-parse-deepseek-reconstruction'
      };

    } catch (error: any) {
      console.error('DeepSeek PDF processing error:', error);
      
      // If DeepSeek fails, still try to extract basic PDF text
      try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfParse = (await import('pdf-parse')).default;
        const pdfData = await pdfParse(pdfBuffer);
        
        console.log('⚠️ DeepSeek failed, returning basic PDF text extraction');
        
        return {
          extractedText: pdfData.text || "Could not extract text from PDF",
          confidence: 0.7,
          structuredData: {
            documentType: documentType || 'Vietnamese PDF Document',
            pageCount: pdfData.numpages,
            error: 'DeepSeek enhancement failed, basic extraction only',
            pdfMetadata: pdfData.metadata || {}
          },
          processingTime: Date.now() - startTime,
          improvements: ["Basic PDF text extraction only (DeepSeek failed)"],
          pageCount: pdfData.numpages,
          processingMethod: 'pdf-parse-fallback'
        };
        
      } catch (fallbackError) {
        throw new Error(`PDF processing completely failed: ${error.message}. Fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
      }
    }
  }

  private estimatePageCount(text: string): number {
    // Estimate page count based on text length
    const wordCount = text.split(/\s+/).length;
    return Math.max(1, Math.ceil(wordCount / 500));
  }
}

export const deepSeekService = new DeepSeekService();