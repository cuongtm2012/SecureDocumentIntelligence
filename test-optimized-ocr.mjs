/**
 * Test script to demonstrate optimized OCR processing with real-time progress tracking
 */
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000';

async function testOptimizedOCR() {
  console.log('🚀 Testing Optimized OCR Processing System');
  console.log('=' .repeat(60));
  
  try {
    // 1. Get available documents
    console.log('📊 Fetching available documents...');
    const documentsResponse = await fetch(`${API_BASE}/api/documents`);
    const documents = await documentsResponse.json();
    
    console.log(`Found ${documents.length} documents in the system`);
    
    // Find a PDF document for testing
    const pdfDoc = documents.find(doc => doc.mimeType?.includes('pdf') && doc.fileSize > 100000);
    if (!pdfDoc) {
      console.log('❌ No suitable PDF documents found for testing');
      return;
    }
    
    console.log(`📄 Selected document for testing: ${pdfDoc.originalName} (${Math.round(pdfDoc.fileSize/1024)}KB)`);
    
    // 2. Start optimized OCR processing
    console.log('\n⚡ Starting optimized OCR processing...');
    const processingStart = Date.now();
    
    const processResponse = await fetch(`${API_BASE}/api/documents/${pdfDoc.id}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!processResponse.ok) {
      throw new Error(`Processing failed: ${processResponse.statusText}`);
    }
    
    const result = await processResponse.json();
    const processingTime = Date.now() - processingStart;
    
    // 3. Display results
    console.log('\n📈 Processing Results:');
    console.log('=' .repeat(40));
    console.log(`✅ Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`⏱️  Total Processing Time: ${Math.round(processingTime / 1000)}s`);
    console.log(`🔤 Extracted Text Length: ${result.document?.extractedText?.length || 0} characters`);
    console.log(`📊 Confidence Score: ${Math.round((result.document?.confidence || 0) * 100)}%`);
    
    if (result.document?.structuredData) {
      try {
        const structured = JSON.parse(result.document.structuredData);
        console.log(`📑 Page Count: ${structured.pageCount || 'N/A'}`);
        console.log(`🎯 Processing Method: ${structured.processingMode || 'N/A'}`);
        
        if (structured.performanceMetrics) {
          console.log('\n⚡ Performance Metrics:');
          console.log(`   • PDF Conversion: ${structured.performanceMetrics.conversionTime || 0}ms`);
          console.log(`   • OCR Processing: ${structured.performanceMetrics.ocrTime || 0}ms`);
          console.log(`   • Average per Page: ${structured.performanceMetrics.averagePageTime || 0}ms`);
          console.log(`   • Pages per Second: ${structured.performanceMetrics.pagesPerSecond || 0}`);
        }
      } catch (e) {
        console.log('⚠️  Could not parse structured data');
      }
    }
    
    // 4. Show text preview
    if (result.document?.extractedText) {
      console.log('\n📝 Extracted Text Preview (first 300 characters):');
      console.log('-'.repeat(50));
      console.log(result.document.extractedText.substring(0, 300));
      if (result.document.extractedText.length > 300) {
        console.log('... [truncated]');
      }
    }
    
    console.log('\n🎉 Optimized OCR test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testOptimizedOCR();