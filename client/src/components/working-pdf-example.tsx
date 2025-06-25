import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { OptimizedPDFOCRViewer } from './optimized-pdf-ocr-viewer';
import { 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  Code,
  PlayCircle
} from 'lucide-react';

export function WorkingPDFExample() {
  const [showViewer, setShowViewer] = useState(false);

  // Example with VALID document ID
  const sampleFile = {
    id: 'sample-file-123', // This is the file ID (string)
    name: 'sample-document.pdf',
    type: 'pdf' as const,
    size: 1024000,
    result: {
      extractedText: 'This is sample extracted text from the PDF document. The OCR process has successfully identified and extracted this content with high confidence.',
      confidence: 0.95,
      pageCount: 3
    }
  };

  // IMPORTANT: This should be a valid numeric document ID from your database
  const validDocumentId = 1; // ✅ Valid numeric ID

  const handleTextEdit = (fileId: string, newText: string) => {
    console.log('✅ Text edited:', { fileId, newText });
  };

  const handleExport = (fileId: string, format: 'txt' | 'pdf' | 'docx') => {
    console.log('✅ Export requested:', { fileId, format });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            PDF Viewer - Working Example
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Issue Explanation */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Issue Fixed:</strong> The "NaN" in PDF URLs was caused by passing invalid document IDs. 
              Make sure to pass a valid numeric document ID, not the file ID string.
            </AlertDescription>
          </Alert>

          {/* Working Example */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">✅ Correct Implementation</h3>
            
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="border-green-200 bg-green-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-green-800">Valid Document Data</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>File ID:</span>
                    <Badge variant="outline">{sampleFile.id}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Document ID:</span>
                    <Badge className="bg-green-600">{validDocumentId}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>URL Will Be:</span>
                    <code className="text-xs bg-white px-1 rounded">
                      /api/documents/{validDocumentId}/raw
                    </code>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-blue-800">PDF.js Worker</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Local worker configured</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>CSP compliant</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Error handling added</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Button 
              onClick={() => setShowViewer(true)}
              className="w-full"
              size="lg"
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              Open Working PDF Viewer
            </Button>
          </div>

          {/* Key Fixes */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">🔧 Key Fixes Applied</h3>
            
            <div className="grid md:grid-cols-2 gap-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>1. Document ID Validation</strong><br/>
                  Added validation to ensure documentId is a valid number before constructing PDF URLs.
                </AlertDescription>
              </Alert>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>2. PDF Worker Setup</strong><br/>
                  Configured PDF.js worker locally in main.tsx to avoid CSP violations.
                </AlertDescription>
              </Alert>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>3. Error Handling</strong><br/>
                  Added comprehensive error states and debugging information.
                </AlertDescription>
              </Alert>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>4. URL Construction</strong><br/>
                  Fixed URL construction to use documentId instead of file.id for API calls.
                </AlertDescription>
              </Alert>
            </div>
          </div>

          {/* Code Example */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Code className="h-5 w-5" />
              Usage Example
            </h3>
            
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm">
{`// ✅ Correct way to use OptimizedPDFOCRViewer
<OptimizedPDFOCRViewer
  file={file}                    // File object with string ID
  documentId={document.id}       // ✅ Numeric document ID from database
  onClose={() => setShowViewer(false)}
  onTextEdit={(fileId, text) => handleTextEdit(fileId, text)}
  onExport={(fileId, format) => handleExport(fileId, format)}
/>

// ❌ Wrong way (causes NaN URLs)
<OptimizedPDFOCRViewer
  documentId={parseInt(file.id)}  // ❌ file.id is a nanoid string
  // ... other props
/>`}
              </pre>
            </div>
          </div>

          {/* Debugging Tips */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">🐛 Debugging Tips</h3>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">1</Badge>
                <span>Check browser console for "Valid document ID" or "Invalid document ID" logs</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">2</Badge>
                <span>Verify the PDF URL in Network tab: should not contain "NaN"</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">3</Badge>
                <span>Ensure the document exists in your database with the given ID</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">4</Badge>
                <span>Test the API endpoint directly: GET /api/documents/{id}/raw</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PDF Viewer Modal */}
      {showViewer && (
        <OptimizedPDFOCRViewer
          file={sampleFile}
          documentId={validDocumentId}
          onClose={() => setShowViewer(false)}
          onTextEdit={handleTextEdit}
          onExport={handleExport}
        />
      )}
    </div>
  );
}