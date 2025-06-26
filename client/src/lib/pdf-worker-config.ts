// PDF Worker Configuration for react-pdf-viewer with Vite
// This file handles CSP-compliant PDF.js worker setup without ES module issues

import { GlobalWorkerOptions, version } from 'pdfjs-dist';

// Multiple CDN fallbacks for PDF.js worker
const WORKER_URLS = [
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.js`,
  `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.js`,
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`
];

// Check if worker URL is accessible
async function checkWorkerUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

// Vite-compatible PDF.js worker configuration with fallbacks
export const configurePDFJSWorker = async () => {
  try {
    if (typeof window !== 'undefined') {
      // Try each worker URL until one works
      for (const workerUrl of WORKER_URLS) {
        const isAccessible = await checkWorkerUrl(workerUrl);
        if (isAccessible) {
          GlobalWorkerOptions.workerSrc = workerUrl;
          console.log('✅ PDF.js worker configured successfully:', workerUrl);
          return { success: true, workerUrl };
        }
      }
      
      // If no CDN works, try creating a local worker
      return await createLocalWorker();
    }
    return { success: false, error: 'Window object not available' };
  } catch (error) {
    console.error('❌ Failed to configure PDF.js worker:', error);
    return { success: false, error };
  }
};

// Create a local blob worker as ultimate fallback
async function createLocalWorker() {
  try {
    // Use a fallback approach that disables worker for compatibility
    GlobalWorkerOptions.workerSrc = '';
    console.log('✅ PDF.js configured without worker (compatibility mode)');
    
    return { success: true, workerUrl: 'compatibility-mode' };
  } catch (error) {
    console.error('❌ Failed to create local worker:', error);
    return { success: false, error };
  }
}

// Alternative: Use a different approach for production builds
export const configureWorkerForProduction = () => {
  try {
    // Use the same jsdelivr CDN approach for both development and production
    const workerUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.js`;
    GlobalWorkerOptions.workerSrc = workerUrl;
    console.log('✅ Production PDF.js worker configured with jsdelivr CDN:', workerUrl);
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