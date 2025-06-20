import OpenAI from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.OPENAI_API_KEY
});

export interface DeepSeekOCRResult {
  extractedText: string;
  confidence: number;
  structuredData: any;
  processingTime: number;
}

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
      
      // Send image to DeepSeek for OCR and analysis
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please extract all text from this document image and provide structured analysis as specified in the system prompt."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 4000
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error("No response from DeepSeek API");
      }

      // Parse the structured response
      const result = this.parseDeepSeekResponse(responseContent);
      
      const processingTime = Date.now() - startTime;
      
      return {
        ...result,
        processingTime
      };
      
    } catch (error) {
      console.error('DeepSeek OCR processing error:', error);
      throw new Error(`DeepSeek processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          extractedText: parsed.extractedText || '',
          confidence: parsed.confidence || 0.8,
          structuredData: parsed.structuredData || {}
        };
      }
      
      // Fallback: treat entire response as extracted text
      return {
        extractedText: response,
        confidence: 0.7,
        structuredData: {
          documentType: 'Unknown',
          classification: 'Unclassified'
        }
      };
    } catch (error) {
      console.error('Error parsing DeepSeek response:', error);
      return {
        extractedText: response,
        confidence: 0.6,
        structuredData: {
          documentType: 'Unknown',
          classification: 'Unclassified',
          error: 'Failed to parse structured data'
        }
      };
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
}

export const deepSeekService = new DeepSeekService();