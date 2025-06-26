#!/usr/bin/env node

/**
 * Test script to verify API fixes
 * Tests both DeepSeek API and file upload handling
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('🧪 Testing API Fixes...\n');

// Test 1: DeepSeek API Configuration
async function testDeepSeekAPI() {
  console.log('📡 Test 1: DeepSeek API Connection');
  console.log('==========================================');
  
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.log('❌ OPENAI_API_KEY not found in environment variables');
      console.log('💡 Please set OPENAI_API_KEY in your .env file');
      return false;
    }
    
    console.log('🔑 API Key found:', apiKey.substring(0, 15) + '...');
    
    // Use dynamic import for OpenAI since it's ESM
    const { default: OpenAI } = await import('openai');
    
    const openai = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: apiKey,
      timeout: 10000, // 10 second timeout for testing
    });
    
    console.log('🔄 Testing connection to DeepSeek API...');
    
    const response = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "user",
          content: "Say 'API connection successful' in Vietnamese"
        }
      ],
      max_tokens: 20,
      temperature: 0.1
    });
    
    const message = response.choices[0]?.message?.content;
    console.log('✅ DeepSeek API Response:', message);
    console.log('✅ API connection test PASSED\n');
    return true;
    
  } catch (error) {
    console.log('❌ DeepSeek API test FAILED');
    console.log('Error details:', error.message);
    
    if (error.status === 401) {
      console.log('🔑 Authentication failed - please check your API key');
      console.log('💡 Get a valid API key from: https://platform.deepseek.com/api-keys');
    } else if (error.status === 402) {
      console.log('💳 Insufficient balance - please add credits to your account');
      console.log('💡 Add credits at: https://platform.deepseek.com/usage');
    } else if (error.status === 429) {
      console.log('⏱️ Rate limit exceeded - please try again later');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log('🌐 Network connection failed - check your internet connection');
    }
    
    console.log('');
    return false;
  }
}

// Test 2: Server Health Check
async function testServerHealth() {
  console.log('🏥 Test 2: Server Health Check');
  console.log('==========================================');
  
  try {
    // Test if the Node.js server is running
    const response = await fetch('http://localhost:5000/api/health', {
      method: 'GET',
      timeout: 5000
    });
    
    if (response.ok) {
      const health = await response.json();
      console.log('✅ Main server is running');
      console.log('Server status:', health.status);
      console.log('');
      return true;
    } else {
      console.log('❌ Main server returned error:', response.status);
      console.log('');
      return false;
    }
  } catch (error) {
    console.log('❌ Main server is not running');
    console.log('💡 Start the server with: npm run dev');
    console.log('Error:', error.message);
    console.log('');
    return false;
  }
}

// Test 3: Python OCR Service
async function testPythonOCR() {
  console.log('🐍 Test 3: Python OCR Service');
  console.log('==========================================');
  
  try {
    const response = await fetch('http://localhost:8001/health', {
      method: 'GET',
      timeout: 5000
    });
    
    if (response.ok) {
      const health = await response.json();
      console.log('✅ Python OCR service is running');
      console.log('Service status:', health.status);
      console.log('Tesseract available:', health.tesseract_available);
      console.log('Vietnamese available:', health.vietnamese_available);
      console.log('');
      return true;
    } else {
      console.log('❌ Python OCR service returned error:', response.status);
      console.log('');
      return false;
    }
  } catch (error) {
    console.log('❌ Python OCR service is not running');
    console.log('💡 Start the service with: cd python-ocr-service && python app.py');
    console.log('Error:', error.message);
    console.log('');
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting API Fix Verification Tests\n');
  
  const results = {
    deepseek: await testDeepSeekAPI(),
    server: await testServerHealth(),
    pythonOCR: await testPythonOCR()
  };
  
  console.log('📊 Test Results Summary');
  console.log('==========================================');
  console.log('DeepSeek API:', results.deepseek ? '✅ PASS' : '❌ FAIL');
  console.log('Main Server:', results.server ? '✅ PASS' : '❌ FAIL');
  console.log('Python OCR:', results.pythonOCR ? '✅ PASS' : '❌ FAIL');
  
  const allPassed = Object.values(results).every(Boolean);
  
  if (allPassed) {
    console.log('\n🎉 All tests passed! Your setup is working correctly.');
    console.log('💡 You can now use the application with real OCR processing.');
  } else {
    console.log('\n⚠️ Some tests failed. Please fix the issues above before proceeding.');
    console.log('💡 Check the error messages and follow the suggested solutions.');
  }
  
  console.log('\n📝 Next Steps:');
  console.log('1. If DeepSeek API failed: Update your API key in .env file');
  console.log('2. If servers are down: Start them with npm run dev and python app.py');
  console.log('3. Upload test files to verify the upload fix is working');
  
  process.exit(allPassed ? 0 : 1);
}

export { testDeepSeekAPI, testServerHealth, testPythonOCR };

// Handle module loading
runAllTests().catch(console.error);
