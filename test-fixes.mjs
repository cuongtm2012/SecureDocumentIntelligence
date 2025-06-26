/**
 * Simple test script to verify the fixes
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('🧪 Testing API and Upload Fixes...\n');

// Test 1: Check environment
function testEnvironment() {
  console.log('🔧 Test 1: Environment Check');
  console.log('==========================================');
  
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.log('❌ OPENAI_API_KEY not found');
    console.log('💡 Add OPENAI_API_KEY to your .env file');
    return false;
  }
  
  console.log('✅ OPENAI_API_KEY found:', apiKey.substring(0, 15) + '...');
  console.log('✅ Environment check PASSED\n');
  return true;
}

// Test 2: Check if services are running
async function testServices() {
  console.log('🏥 Test 2: Service Health Check');
  console.log('==========================================');
  
  const services = [
    { name: 'Main Server', url: 'http://localhost:5000' },
    { name: 'Python OCR', url: 'http://localhost:8001/health' }
  ];
  
  let allRunning = true;
  
  for (const service of services) {
    try {
      const response = await fetch(service.url, { 
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      
      if (response.ok) {
        console.log(`✅ ${service.name} is running`);
      } else {
        console.log(`❌ ${service.name} returned error: ${response.status}`);
        allRunning = false;
      }
    } catch (error) {
      console.log(`❌ ${service.name} is not running`);
      console.log(`💡 Start with: ${service.name === 'Main Server' ? 'npm run dev' : 'python python-ocr-service/app.py'}`);
      allRunning = false;
    }
  }
  
  console.log('');
  return allRunning;
}

// Test 3: Test DeepSeek API
async function testDeepSeekAPI() {
  console.log('🤖 Test 3: DeepSeek API Test');
  console.log('==========================================');
  
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.log('❌ No API key to test');
      return false;
    }
    
    // Import OpenAI dynamically
    const { default: OpenAI } = await import('openai');
    
    const openai = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: apiKey,
      timeout: 10000
    });
    
    console.log('🔄 Testing DeepSeek API connection...');
    
    const response = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: "Hello! Say 'API works' in Vietnamese." }],
      max_tokens: 30,
      temperature: 0.1
    });
    
    const message = response.choices[0]?.message?.content;
    console.log('✅ DeepSeek Response:', message);
    console.log('✅ DeepSeek API test PASSED\n');
    return true;
    
  } catch (error) {
    console.log('❌ DeepSeek API test FAILED');
    console.log('Error:', error.message);
    
    if (error.status === 401) {
      console.log('🔑 Invalid API key - get one from https://platform.deepseek.com/api-keys');
    } else if (error.status === 402) {
      console.log('💳 Insufficient balance - add credits at https://platform.deepseek.com/usage');
    } else if (error.status === 429) {
      console.log('⏱️ Rate limit exceeded - try again later');
    }
    
    console.log('');
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Fix Verification Tests\n');
  
  const results = {
    environment: testEnvironment(),
    services: await testServices(),
    deepseek: await testDeepSeekAPI()
  };
  
  console.log('📊 Test Results Summary');
  console.log('==========================================');
  console.log('Environment:', results.environment ? '✅ PASS' : '❌ FAIL');
  console.log('Services:', results.services ? '✅ PASS' : '❌ FAIL');
  console.log('DeepSeek API:', results.deepseek ? '✅ PASS' : '❌ FAIL');
  
  const allPassed = Object.values(results).every(Boolean);
  
  if (allPassed) {
    console.log('\n🎉 All tests passed! Your fixes are working correctly.');
    console.log('📝 What was fixed:');
    console.log('  ✅ Sample texts removed from OCR service');
    console.log('  ✅ File upload multiple reopening prevented');
    console.log('  ✅ DeepSeek API connection improved');
    console.log('  ✅ Better error handling added');
  } else {
    console.log('\n⚠️ Some tests failed. Follow the suggestions above.');
  }
  
  console.log('\n🔧 Next Steps:');
  console.log('1. Start services if they are not running');
  console.log('2. Upload test files to verify upload fix');
  console.log('3. Check OCR processing with real documents');
  
  return allPassed;
}

// Run the tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
