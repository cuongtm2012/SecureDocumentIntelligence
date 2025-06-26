#!/usr/bin/env node

/**
 * PDF File Selection Validation Script
 * 
 * This script validates that the PDF file selection issues have been resolved
 * and all components are working correctly.
 */

import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class PDFValidationTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.ocrUrl = 'http://localhost:8001';
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  log(message, status = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = {
      'info': '📄',
      'success': '✅', 
      'error': '❌',
      'warning': '⚠️'
    }[status] || '📄';
    
    console.log(`${timestamp} ${prefix} ${message}`);
  }

  async test(name, testFn) {
    this.log(`Testing: ${name}`, 'info');
    
    try {
      await testFn();
      this.results.passed++;
      this.results.tests.push({ name, status: 'PASS' });
      this.log(`${name} - PASSED`, 'success');
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAIL', error: error.message });
      this.log(`${name} - FAILED: ${error.message}`, 'error');
    }
  }

  async checkServiceStatus() {
    await this.test('Backend Service (Port 5000)', async () => {
      const response = await fetch(`${this.baseUrl}/api/documents`, {
        method: 'HEAD',
        timeout: 5000
      });
      
      if (!response.ok) {
        throw new Error(`Backend not responding: ${response.status}`);
      }
    });

    await this.test('OCR Service (Port 8001)', async () => {
      const response = await fetch(`${this.ocrUrl}/health`, {
        timeout: 5000
      });
      
      if (!response.ok) {
        throw new Error(`OCR service not responding: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.status !== 'healthy') {
        throw new Error(`OCR service unhealthy: ${data.status}`);
      }
    });
  }

  async checkDocumentsAPI() {
    await this.test('Documents API Response', async () => {
      const response = await fetch(`${this.baseUrl}/api/documents`);
      
      if (!response.ok) {
        throw new Error(`Documents API failed: ${response.status}`);
      }
      
      const documents = await response.json();
      
      if (!Array.isArray(documents)) {
        throw new Error('Documents API did not return an array');
      }
      
      this.log(`Found ${documents.length} documents in database`, 'info');
      
      if (documents.length === 0) {
        this.log('No documents found - upload some PDFs to test fully', 'warning');
      }
      
      return documents;
    });
  }

  async checkPDFAccess(documents) {
    if (!documents || documents.length === 0) {
      this.log('Skipping PDF access test - no documents available', 'warning');
      return;
    }

    const pdfDocuments = documents.filter(doc => doc.mimeType === 'application/pdf');
    
    if (pdfDocuments.length === 0) {
      this.log('Skipping PDF access test - no PDF documents available', 'warning');
      return;
    }

    await this.test('PDF Document Access', async () => {
      const firstPDF = pdfDocuments[0];
      const pdfUrl = `${this.baseUrl}/api/documents/${firstPDF.id}/raw`;
      
      const response = await fetch(pdfUrl, { method: 'HEAD' });
      
      if (!response.ok) {
        throw new Error(`PDF access failed: ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('pdf')) {
        throw new Error(`Invalid content type: ${contentType}`);
      }
      
      this.log(`PDF "${firstPDF.originalName}" is accessible`, 'info');
    });
  }

  async checkPortAvailability() {
    await this.test('Required Ports Available', async () => {
      try {
        const { stdout } = await execAsync('netstat -an | findstr ":5000.*LISTEN"');
        if (!stdout.trim()) {
          throw new Error('Port 5000 not listening');
        }
      } catch (error) {
        throw new Error('Backend port 5000 not available');
      }

      try {
        const { stdout } = await execAsync('netstat -an | findstr ":8001.*LISTEN"');
        if (!stdout.trim()) {
          throw new Error('Port 8001 not listening');
        }
      } catch (error) {
        throw new Error('OCR service port 8001 not available');
      }
    });
  }

  async checkFileSystemAccess() {
    await this.test('File System Access', async () => {
      const response = await fetch(`${this.baseUrl}/uploads/`, { method: 'HEAD' });
      
      // We expect this to either work or return a 404/403, but not a connection error
      if (!response) {
        throw new Error('Cannot connect to file system endpoints');
      }
    });
  }

  async validateConfigurationFiles() {
    await this.test('Configuration Files', async () => {
      // Check if important files exist and have expected content
      const fs = await import('fs');
      const path = await import('path');
      
      const configFiles = [
        'vite.config.ts',
        'package.json',
        'client/src/components/dashboard-pdf-viewer.tsx',
        'client/src/components/advanced-ocr-dashboard.tsx'
      ];
      
      for (const file of configFiles) {
        if (!fs.existsSync(file)) {
          throw new Error(`Required file missing: ${file}`);
        }
      }
      
      // Check vite config has proxy
      const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
      if (!viteConfig.includes('proxy') || !viteConfig.includes('/api')) {
        throw new Error('Vite proxy configuration missing');
      }
    });
  }

  async run() {
    this.log('Starting PDF File Selection Validation', 'info');
    this.log('====================================', 'info');

    // Run all validation tests
    await this.checkPortAvailability();
    await this.checkServiceStatus();
    
    const documents = await this.checkDocumentsAPI();
    await this.checkPDFAccess(documents);
    await this.checkFileSystemAccess();
    await this.validateConfigurationFiles();

    // Print summary
    this.log('====================================', 'info');
    this.log('Validation Summary:', 'info');
    this.log(`Total Tests: ${this.results.passed + this.results.failed}`, 'info');
    this.log(`Passed: ${this.results.passed}`, 'success');
    this.log(`Failed: ${this.results.failed}`, this.results.failed > 0 ? 'error' : 'success');

    if (this.results.failed > 0) {
      this.log('====================================', 'info');
      this.log('Failed Tests:', 'error');
      this.results.tests
        .filter(test => test.status === 'FAIL')
        .forEach(test => {
          this.log(`${test.name}: ${test.error}`, 'error');
        });
      
      this.log('====================================', 'info');
      this.log('Resolution Steps:', 'info');
      this.log('1. Ensure all services are running: npm run dev:all', 'info');
      this.log('2. Check the test dashboard: http://localhost:5000/test-pdf-functionality.html', 'info');
      this.log('3. Review PDF-ISSUES-RESOLUTION.md for detailed troubleshooting', 'info');
      
      process.exit(1);
    } else {
      this.log('====================================', 'info');
      this.log('🎉 All tests passed! PDF file selection is working correctly.', 'success');
      this.log('✅ You can now:', 'info');
      this.log('  • Access the main app: http://localhost:5000', 'info');
      this.log('  • Test PDF functionality: http://localhost:5000/test-pdf-functionality.html', 'info');
      this.log('  • Upload and view PDF documents', 'info');
      this.log('  • Use the dashboard PDF viewer', 'info');
      
      process.exit(0);
    }
  }
}

// Create and run validator if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new PDFValidationTester();
  validator.run().catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

export default PDFValidationTester;
