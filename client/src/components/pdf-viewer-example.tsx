import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PDFViewerExample() {
  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>PDF Viewer Implementation Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">✅ What's Fixed:</h3>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li><strong>PDF Preview:</strong> Now uses `react-pdf` for proper PDF rendering</li>
              <li><strong>Scrollable Text:</strong> Text panel now has proper `overflow-y: auto` with custom scrollbars</li>
              <li><strong>API Endpoint:</strong> Added `/api/documents/:id/raw` for serving raw PDF files</li>
              <li><strong>Error Handling:</strong> Graceful fallbacks when PDF fails to load</li>
              <li><strong>CORS Support:</strong> Headers configured for react-pdf compatibility</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">🔧 Implementation Details:</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Enhanced PDF Viewer</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <ul className="list-disc list-inside space-y-1">
                    <li>Uses react-pdf for proper PDF rendering</li>
                    <li>Zoom controls (25% increments)</li>
                    <li>Page navigation for multi-page PDFs</li>
                    <li>Rotation controls (90° increments)</li>
                    <li>Loading states and error handling</li>
                    <li>Fallback to SVG placeholder when needed</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Scrollable Text Panel</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <ul className="list-disc list-inside space-y-1">
                    <li>Fixed height with `overflow-y: auto`</li>
                    <li>Custom webkit scrollbars (styled)</li>
                    <li>Search functionality with highlighting</li>
                    <li>Text editing with auto-resize</li>
                    <li>Copy to clipboard functionality</li>
                    <li>Text statistics and quality indicators</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">📋 Key CSS for Scrollable Text:</h3>
            <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg text-sm overflow-x-auto">
{`.scrollable-text-container {
  height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #CBD5E0 #F7FAFC;
}

.scrollable-text-container::-webkit-scrollbar {
  width: 8px;
}

.scrollable-text-container::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}

.scrollable-text-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.scrollable-text-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}`}
            </pre>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">🔗 API Endpoints:</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">GET /api/documents/:id/raw</code>
                <span>- Serves raw PDF files for react-pdf</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">GET /api/documents/:id/pdf?page=1</code>
                <span>- Serves PDF as image (fallback)</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">GET /api/documents/:id/image</code>
                <span>- Serves image files directly</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">🚀 Usage Example:</h3>
            <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg text-sm overflow-x-auto">
{`import { OptimizedPDFOCRViewer } from './optimized-pdf-ocr-viewer';

// Usage in your component
<OptimizedPDFOCRViewer
  file={{
    id: "1",
    name: "document.pdf",
    type: "pdf",
    size: 1024000,
    result: {
      extractedText: "Sample extracted text...",
      confidence: 0.95,
      pageCount: 3
    }
  }}
  documentId={1}
  onClose={() => setShowViewer(false)}
  onTextEdit={(fileId, newText) => handleTextEdit(fileId, newText)}
  onExport={(fileId, format) => handleExport(fileId, format)}
/>`}
            </pre>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">💡 Pro Tips:</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-blue-700 dark:text-blue-300">
              <li>PDF.js worker is loaded from CDN for better performance</li>
              <li>Text panel auto-adjusts height and includes custom scrollbars</li>
              <li>Error boundaries handle PDF loading failures gracefully</li>
              <li>CORS headers are set properly for cross-origin PDF access</li>
              <li>Mobile responsive design with proper touch scrolling</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
