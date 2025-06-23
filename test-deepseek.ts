import { DeepSeekService } from './server/deepseek-service.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function testDeepSeekIntegration() {
  console.log('🧪 Testing DeepSeek Integration...');
  console.log('API Key configured:', process.env.OPENAI_API_KEY ? '✅ Yes' : '❌ No');
  
  const deepSeekService = new DeepSeekService();
  
  try {
    // Test 1: Simple text analysis
    console.log('\n📝 Test 1: Text Analysis');
    const analysisResult = await deepSeekService.analyzeDocument(
      'Đây là một văn bản tiếng Việt để test. This is a Vietnamese text for testing.',
      'Test document analysis'
    );
    console.log('✅ Text analysis successful:', analysisResult);
    
    // Test 2: Check if there are any uploaded images to test OCR
    const uploadsDir = './uploads';
    const fs = await import('fs');
    const files = fs.readdirSync(uploadsDir).filter(f => 
      f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg')
    );
    
    if (files.length > 0) {
      console.log('\n🖼️ Test 2: Image OCR Processing');
      const testImagePath = path.join(uploadsDir, files[0]);
      console.log('Testing with image:', files[0]);
      
      const ocrResult = await deepSeekService.processDocumentImage(
        testImagePath, 
        'Vietnamese identity document'
      );
      
      console.log('✅ OCR processing successful:');
      console.log('- Extracted text length:', ocrResult.extractedText.length);
      console.log('- Confidence:', ocrResult.confidence);
      console.log('- Processing time:', ocrResult.processingTime, 'ms');
      console.log('- Sample text:', ocrResult.extractedText.substring(0, 100) + '...');
    } else {
      console.log('\n🖼️ Test 2: No images found in uploads folder to test OCR');
    }
    
  } catch (error) {
    console.error('❌ DeepSeek integration test failed:', error.message);
    console.error('Error details:', error);
  }
}

testDeepSeekIntegration();