// PDF Worker Configuration for react-pdf-viewer with Vite
// This file handles CSP-compliant PDF.js worker setup without ES module issues

import { GlobalWorkerOptions } from 'pdfjs-dist';

// Vite-compatible PDF.js worker configuration
export const configurePDFJSWorker = () => {
  try {
    if (typeof window !== 'undefined') {
      // For Vite: Use the worker file from public directory
      // This avoids ES module loading issues and CSP violations
      const workerUrl = '/pdf.worker.min.js';
      
      GlobalWorkerOptions.workerSrc = workerUrl;
      console.log('✅ PDF.js worker configured for Vite:', workerUrl);
      
      return { success: true, workerUrl };
    }
  } catch (error) {
    console.error('❌ Failed to configure PDF.js worker:', error);
    return { success: false, error };
  }
};

// Alternative: Use a different approach for production builds
export const configureWorkerForProduction = () => {
  try {
    // In production, we'll use a different strategy
    if (import.meta.env.PROD) {
      // Use the bundled worker from assets
      const workerUrl = new URL('/pdf.worker.min.js', window.location.origin).href;
      GlobalWorkerOptions.workerSrc = workerUrl;
      console.log('✅ Production PDF.js worker configured:', workerUrl);
      return { success: true, workerUrl };
    } else {
      // Development: use local file
      return configurePDFJSWorker();
    }
  } catch (error) {
    console.error('❌ Production worker configuration failed:', error);
    return { success: false, error };
  }
};

// Initialize PDF worker based on environment
const initializeWorker = () => {
  if (import.meta.env.PROD) {
    configureWorkerForProduction();
  } else {
    configurePDFJSWorker();
  }
};

// Initialize when module loads
initializeWorker();