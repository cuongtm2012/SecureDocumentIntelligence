import OpenAI from 'openai';

export class VietnameseTextCleaner {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is required for Vietnamese text cleaning');
    }
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: 'https://api.deepseek.com'
    });
  }

  async cleanVietnameseText(rawOcrText: string, documentType: string = 'identity document'): Promise<{
    cleanedText: string;
    structuredData: any;
    improvements: string[];
  }> {
    try {
      const systemPrompt = `You are an expert Vietnamese language processing AI specialized in cleaning and correcting OCR-extracted text from Vietnamese identity documents.

Your task is to:
1. Fix Vietnamese diacritics and spelling errors
2. Correct common OCR misrecognitions (like confusing similar characters)
3. Reconstruct fragmented sentences into coherent Vietnamese text
4. Preserve all factual information accurately
5. Format the output in clean, readable Vietnamese

Common OCR errors to fix:
- Missing or incorrect diacritics (à, á, ạ, ả, ã, â, ầ, ấ, ậ, ẩ, ẫ, ă, ằ, ắ, ặ, ẳ, ẵ, etc.)
- Character confusion (I/l, O/0, rn/m, etc.)
- Broken words and spacing issues
- Garbled special characters

For Vietnamese ID cards, extract and clean these fields:
- Full name (Họ và tên)
- ID number (Số CCCD)
- Date of birth (Ngày sinh)
- Gender (Giới tính)
- Nationality (Quốc tịch)
- Place of origin (Quê quán)
- Place of residence (Nơi thường trú)
- Issue/expiry dates

Respond in JSON format with:
{
  "cleanedText": "corrected Vietnamese text",
  "structuredData": {
    "documentType": "type",
    "idNumber": "number",
    "fullName": "name",
    "dateOfBirth": "date",
    "gender": "gender",
    "nationality": "nationality",
    "placeOfOrigin": "place",
    "placeOfResidence": "place"
  },
  "improvements": ["list of corrections made"]
}`;

      const completion = await this.openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Please clean and correct this Vietnamese OCR text from a ${documentType}:

${rawOcrText}

Please provide the cleaned text and structured data extraction in the specified JSON format.`
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error("No response from text cleaning service");
      }

      try {
        const result = JSON.parse(responseContent);
        return {
          cleanedText: result.cleanedText || rawOcrText,
          structuredData: result.structuredData || {},
          improvements: result.improvements || []
        };
      } catch (parseError) {
        // If JSON parsing fails, return basic cleaning
        const basicCleaning = this.basicVietnameseClean(rawOcrText);
        return {
          cleanedText: basicCleaning,
          structuredData: {},
          improvements: ['Applied basic text cleaning due to parsing error']
        };
      }

    } catch (error: any) {
      console.error('Vietnamese text cleaning error:', error);
      
      // Fallback to basic cleaning if AI service fails
      const basicCleaning = this.basicVietnameseClean(rawOcrText);
      return {
        cleanedText: basicCleaning,
        structuredData: {},
        improvements: ['Applied basic cleaning due to service error']
      };
    }
  }

  private basicVietnameseClean(text: string): string {
    // Basic text cleaning for Vietnamese
    let cleaned = text;

    // Fix common spacing issues
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Fix broken words
    cleaned = cleaned.replace(/([a-zA-ZÀ-ỹ])\s+([a-zA-ZÀ-ỹ])/g, '$1$2');

    // Remove excessive punctuation
    cleaned = cleaned.replace(/[^\w\s\/\-\.,:()àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸ]/g, ' ');

    // Normalize Vietnamese text structure
    cleaned = cleaned.replace(/\n\s*\n/g, '\n');

    // Common Vietnamese phrase corrections
    const corrections = {
      'CONG HOA XA HOI CHU NGHIA VIET NAM': 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
      'Doc lap - Tu do - Hanh phuc': 'Độc lập - Tự do - Hạnh phúc',
      'CAN CUOC CONG DAN': 'CĂN CƯỚC CÔNG DÂN',
      'Citizen Identity Card': 'Citizen Identity Card',
      'Ho va ten': 'Họ và tên',
      'Ngay sinh': 'Ngày sinh',
      'Gioi tinh': 'Giới tính',
      'Quoc tich': 'Quốc tịch',
      'Que quan': 'Quê quán',
      'Noi thuong tru': 'Nơi thường trú'
    };

    for (const [wrong, correct] of Object.entries(corrections)) {
      cleaned = cleaned.replace(new RegExp(wrong, 'gi'), correct);
    }

    return cleaned;
  }

  async enhanceStructuredData(originalData: any, cleanedText: string): Promise<any> {
    // Enhance the structured data extraction using the cleaned text
    const enhanced = { ...originalData };

    if (cleanedText.includes('CĂN CƯỚC CÔNG DÂN') || cleanedText.includes('Citizen Identity Card')) {
      enhanced.documentType = 'Vietnamese Citizen Identity Card';
      enhanced.country = 'Vietnam';

      // Extract ID number
      const idMatch = cleanedText.match(/(?:số|sev|cccd|id)[\s:]*([0-9]{12})/i);
      if (idMatch && !enhanced.idNumber) {
        enhanced.idNumber = idMatch[1];
      }

      // Extract clean name
      const nameMatch = cleanedText.match(/(?:họ và tên|full name)[\s:]*([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+)/i);
      if (nameMatch && (!enhanced.fullName || enhanced.fullName.length < nameMatch[1].trim().length)) {
        enhanced.fullName = nameMatch[1].trim();
      }

      // Extract date of birth
      const dobMatch = cleanedText.match(/(?:ngày sinh|date of birth)[\s:]*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{4})/i);
      if (dobMatch && !enhanced.dateOfBirth) {
        enhanced.dateOfBirth = dobMatch[1];
      }

      // Extract gender
      const genderMatch = cleanedText.match(/(?:giới tính|sex)[\s:]*([^\n]+?)(?:\n|quốc|nationality)/i);
      if (genderMatch && !enhanced.gender) {
        const gender = genderMatch[1].trim().toLowerCase();
        enhanced.gender = gender.includes('nam') ? 'Nam' : gender.includes('nữ') ? 'Nữ' : gender;
      }

      // Extract nationality
      if (cleanedText.includes('Việt Nam') && !enhanced.nationality) {
        enhanced.nationality = 'Việt Nam';
      }
    }

    return enhanced;
  }
}

export const vietnameseTextCleaner = new VietnameseTextCleaner();