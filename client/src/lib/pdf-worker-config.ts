// PDF Worker Configuration for react-pdf-viewer with Vite
// This file handles CSP-compliant PDF.js worker setup without ES module issues

import { GlobalWorkerOptions, version } from 'pdfjs-dist';

// Vite-compatible PDF.js worker configuration
export const configurePDFJSWorker = () => {
  try {
    if (typeof window !== 'undefined') {
      // Use CDN worker for reliable loading - this avoids local file issues
      const workerUrl = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;
      
      GlobalWorkerOptions.workerSrc = workerUrl;
      console.log('✅ PDF.js worker configured with CDN:', workerUrl);
      
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
    // Use the same CDN approach for both development and production
    const workerUrl = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;
    GlobalWorkerOptions.workerSrc = workerUrl;
    console.log('✅ Production PDF.js worker configured with CDN:', workerUrl);
    return { success: true, workerUrl };
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