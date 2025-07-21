/**
 * Test script to validate OCR accuracy improvements after fixing optimized processor
 */
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000';

async function testOCRAccuracyImprovements() {
  console.log('🔍 Testing OCR Accuracy Improvements');
  console.log('=' .repeat(50));
  
  try {
    // Get available documents for testing
    const documentsResponse = await fetch(`${API_BASE}/api/documents`);
    const documents = await documentsResponse.json();
    
    // Find the document we've been testing (document 68)
    const testDoc = documents.find(doc => doc.id === 68);
    
    if (!testDoc) {
      console.log('❌ Test document (ID: 68) not found');
      return;
    }
    
    console.log(`📄 Testing document: ${testDoc.originalName}`);
    console.log(`📊 Previous results: ${testDoc.extractedText?.length || 0} chars, ${Math.round((testDoc.confidence || 0) * 100)}% confidence`);
    console.log();
    
    // Test the improved OCR processor
    console.log('⚡ Starting improved OCR processing...');
    const startTime = Date.now();
    
    const processResponse = await fetch(`${API_BASE}/api/documents/68/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!processResponse.ok) {
      throw new Error(`Processing failed: ${processResponse.statusText}`);
    }
    
    const result = await processResponse.json();
    const totalTime = Date.now() - startTime;
    
    // Display comparison results
    console.log('\n📈 Accuracy Improvement Results:');
    console.log('=' .repeat(40));
    
    const newConfidence = Math.round((result.document?.confidence || 0) * 100);
    const newTextLength = result.document?.extractedText?.length || 0;
    
    console.log(`✅ Processing Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`⏱️  Total Processing Time: ${Math.round(totalTime / 1000)}s`);
    console.log(`🔤 Extracted Text Length: ${newTextLength} characters`);
    console.log(`📊 Confidence Score: ${newConfidence}%`);
    
    // Calculate improvements
    const prevConfidence = Math.round((testDoc.confidence || 0) * 100);
    const prevTextLength = testDoc.extractedText?.length || 0;
    
    console.log('\n📊 Comparison with Previous Results:');
    console.log('-' .repeat(40));
    console.log(`Confidence: ${prevConfidence}% → ${newConfidence}% (${newConfidence - prevConfidence > 0 ? '+' : ''}${newConfidence - prevConfidence}%)`);
    console.log(`Text Length: ${prevTextLength} → ${newTextLength} chars (${newTextLength - prevTextLength > 0 ? '+' : ''}${newTextLength - prevTextLength})`);
    
    // Performance analysis
    if (result.document?.structuredData) {
      try {
        const structured = JSON.parse(result.document.structuredData);
        if (structured.performanceMetrics) {
          console.log('\n⚡ Performance Metrics:');
          console.log('-' .repeat(30));
          console.log(`• PDF Conversion: ${structured.performanceMetrics.conversionTime || 0}ms`);
          console.log(`• OCR Processing: ${structured.performanceMetrics.ocrTime || 0}ms`);
          console.log(`• Pages per Second: ${structured.performanceMetrics.pagesPerSecond || 0}`);
        }
      } catch (e) {
        console.log('⚠️  Could not parse performance metrics');
      }
    }
    
    // Show extracted text sample
    if (result.document?.extractedText && result.document.extractedText.length > 0) {
      console.log('\n📝 Extracted Text Sample (first 500 characters):');
      console.log('-' .repeat(50));
      console.log(result.document.extractedText.substring(0, 500));
      if (result.document.extractedText.length > 500) {
        console.log('... [truncated]');
      }
    }
    
    // Final assessment
    console.log('\n🎯 Accuracy Assessment:');
    console.log('-' .repeat(30));
    
    if (newConfidence >= 80) {
      console.log('🎉 EXCELLENT: High confidence OCR results');
    } else if (newConfidence >= 60) {
      console.log('✅ GOOD: Acceptable OCR accuracy');
    } else if (newConfidence >= 40) {
      console.log('⚠️  MODERATE: Some accuracy concerns');
    } else {
      console.log('❌ LOW: OCR accuracy needs improvement');
    }
    
    if (newTextLength > prevTextLength) {
      console.log('📈 IMPROVED: More text extracted than before');
    } else if (newTextLength === prevTextLength) {
      console.log('📊 CONSISTENT: Same amount of text extracted');
    } else {
      console.log('📉 DECREASED: Less text extracted than before');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the accuracy test
testOCRAccuracyImprovements();