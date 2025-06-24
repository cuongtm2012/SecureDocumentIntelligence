// PDF.js Worker Configuration
// This file handles PDF.js worker setup with multiple fallback options

import { pdfjs } from 'react-pdf';

/**
 * Configure PDF.js worker with multiple fallback strategies
 * Call this once in your app initialization
 */
export function configurePDFWorker() {
  // Skip configuration on server-side
  if (typeof window === 'undefined') return;

  console.log('🔧 Configuring PDF.js worker...');

  // Strategy 1: Use local worker from node_modules (Vite will handle this)
  try {
    // Get the current PDF.js version
    const version = pdfjs.version;
    console.log(`📄 PDF.js version: ${version}`);

    // For Vite environments, try to use local worker
    if (import.meta.env.PROD) {
      // Production: Use CDN for reliability
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.js`;
      console.log('[OK] PDF Worker: Using unpkg CDN for production');
      return;
    } else {
      // Development: Try local first, then CDN fallback
      try {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.js',
          import.meta.url,
        ).toString();
        console.log('[OK] PDF Worker: Using local worker via import.meta.url');
        return;
      } catch (localError) {
        console.warn('[WARNING] PDF Worker: Local worker failed, trying CDN...');
      }
    }
  } catch (error) {
    console.warn('[WARNING] PDF Worker: Version detection failed:', error);
  }

  // Strategy 2: Use reliable CDN with version fallback
  try {
    const version = pdfjs.version || '3.11.174'; // Fallback version
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.js`;
    console.log('[OK] PDF Worker: Using unpkg CDN');
    return;
  } catch (error) {
    console.warn('[WARNING] PDF Worker: unpkg CDN failed:', error);
  }

  // Strategy 3: Alternative CDN fallback
  try {
    const version = pdfjs.version || '3.11.174';
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.js`;
    console.log('[OK] PDF Worker: Using jsdelivr CDN');
    return;
  } catch (error) {
    console.warn('[WARNING] PDF Worker: jsdelivr CDN failed:', error);
  }

  // Strategy 4: Last resort - CDNJS
  try {
    const version = pdfjs.version || '3.11.174';
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;
    console.log('[OK] PDF Worker: Using CDNJS');
    return;
  } catch (error) {
    console.error('[ERROR] PDF Worker: All strategies failed:', error);
    throw new Error('Failed to configure PDF.js worker. Check network connectivity and CORS settings.');
  }
}

/**
 * For environments where you want to use a specific worker URL
 */
export function setPDFWorkerSrc(workerSrc: string) {
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  console.log('✅ PDF Worker: Using custom worker source:', workerSrc);
}

/**
 * Get the current worker source
 */
export function getPDFWorkerSrc(): string | undefined {
  return pdfjs.GlobalWorkerOptions.workerSrc;
}

/**
 * Validate that PDF worker is properly configured
 */
export async function validatePDFWorker(): Promise<boolean> {
  try {
    const workerSrc = pdfjs.GlobalWorkerOptions.workerSrc;
    if (!workerSrc) {
      console.error('❌ PDF Worker: No worker source configured');
      return false;
    }

    // Try to fetch the worker to validate it's accessible
    const response = await fetch(workerSrc, { method: 'HEAD' });
    if (response.ok) {
      console.log('✅ PDF Worker: Worker source is accessible');
      return true;
    } else {
      console.error('❌ PDF Worker: Worker source returned:', response.status);
      return false;
    }
  } catch (error) {
    console.error('❌ PDF Worker: Validation failed:', error);
    return false;
  }
}

// Auto-configure when this module is imported
configurePDFWorker();
