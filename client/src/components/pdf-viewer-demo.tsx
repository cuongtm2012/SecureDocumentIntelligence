import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PDFViewer } from './pdf-viewer';
import { AdvancedPDFViewer } from './advanced-pdf-viewer';
import { 
  Upload, 
  FileText, 
  Info, 
  ExternalLink,
  Code,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

export function PDFViewerDemo() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadSuccess, setLoadSuccess] = useState<boolean>(false);
  const [extractedTexts, setExtractedTexts] = useState<{[key: number]: string}>({});

  // Sample PDF URLs for testing
  const samplePDFs = [
    {
      name: 'Sample PDF (Small)',
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
    },
    {
      name: 'Mozilla PDF.js Test',
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf'
    }
  ];

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setLoadError(null);
      setLoadSuccess(false);
      setExtractedTexts({});
    } else {
      setLoadError('Please select a valid PDF file');
    }
  };

  const handleUrlChange = (url: string) => {
    setPdfUrl(url);
    setSelectedFile(null);
    setLoadError(null);
    setLoadSuccess(false);
    setExtractedTexts({});
  };

  const handleLoadError = (error: Error) => {
    setLoadError(error.message);
    setLoadSuccess(false);
  };

  const handleLoadSuccess = (pdf: pdfjsLib.PDFDocumentProxy) => {
    setLoadSuccess(true);
    setLoadError(null);
    console.log('✅ PDF loaded with', pdf.numPages, 'pages');
  };

  const handleTextExtract = (text: string, pageNumber: number) => {
    setExtractedTexts(prev => ({
      ...prev,
      [pageNumber]: text
    }));
    console.log(`📄 Text extracted from page ${pageNumber}:`, text.substring(0, 100) + '...');
  };

  const hasValidSource = selectedFile || pdfUrl;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            PDF.js Viewer Demo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* PDF Source Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Choose PDF Source</h3>
            
            <div className="grid md:grid-cols-2 gap-4">
              {/* File Upload */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Upload PDF File</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="pdf-file">Select PDF File</Label>
                    <Input
                      id="pdf-file"
                      type="file"
                      accept=".pdf"
                      onChange={handleFileUpload}
                      className="cursor-pointer"
                    />
                  </div>
                  {selectedFile && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span>{selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* URL Input */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">PDF URL</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="pdf-url">Enter PDF URL</Label>
                    <Input
                      id="pdf-url"
                      placeholder="https://example.com/document.pdf"
                      value={pdfUrl}
                      onChange={(e) => handleUrlChange(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">Or try a sample PDF:</Label>
                    <div className="space-y-1">
                      {samplePDFs.map((sample) => (
                        <Button
                          key={sample.name}
                          variant="outline"
                          size="sm"
                          className="w-full justify-start text-xs"
                          onClick={() => handleUrlChange(sample.url)}
                        >
                          <ExternalLink className="h-3 w-3 mr-2" />
                          {sample.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Status Indicators */}
          <div className="space-y-2">
            {loadError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Error:</strong> {loadError}
                </AlertDescription>
              </Alert>
            )}
            
            {loadSuccess && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Success:</strong> PDF loaded successfully!
                </AlertDescription>
              </Alert>
            )}

            {Object.keys(extractedTexts).length > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Text Extracted:</strong> Found text on {Object.keys(extractedTexts).length} page(s)
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* PDF Viewers */}
          {hasValidSource && (
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="basic">Basic PDF Viewer</TabsTrigger>
                <TabsTrigger value="advanced">Advanced PDF Viewer</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="mt-4">
                <PDFViewer
                  pdfFile={selectedFile || undefined}
                  pdfUrl={pdfUrl || undefined}
                  onLoadError={handleLoadError}
                  onLoadSuccess={handleLoadSuccess}
                  className="w-full"
                />
              </TabsContent>

              <TabsContent value="advanced" className="mt-4">
                <AdvancedPDFViewer
                  pdfFile={selectedFile || undefined}
                  pdfUrl={pdfUrl || undefined}
                  onLoadError={handleLoadError}
                  onLoadSuccess={handleLoadSuccess}
                  onTextExtract={handleTextExtract}
                  className="w-full"
                />
              </TabsContent>
            </Tabs>
          )}

          {/* Usage Examples */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Code className="h-5 w-5" />
              Usage Examples
            </h3>
            
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Basic Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-900 text-gray-100 p-3 rounded-lg text-sm">
                    <pre>{`import { PDFViewer } from './pdf-viewer';

// Load from URL
<PDFViewer 
  pdfUrl="https://example.com/doc.pdf"
  onLoadSuccess={(pdf) => console.log(pdf)}
  onLoadError={(err) => console.error(err)}
/>

// Load from File
<PDFViewer 
  pdfFile={selectedFile}
  onLoadSuccess={(pdf) => console.log(pdf)}
/>`}</pre>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Advanced Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-900 text-gray-100 p-3 rounded-lg text-sm">
                    <pre>{`import { AdvancedPDFViewer } from './advanced-pdf-viewer';

<AdvancedPDFViewer 
  pdfUrl="https://example.com/doc.pdf"
  onTextExtract={(text, page) => {
    console.log(\`Page \${page}: \${text}\`);
  }}
  onLoadSuccess={(pdf) => {
    console.log(\`Loaded \${pdf.numPages} pages\`);
  }}
/>`}</pre>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Features Overview */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">✨ Features</h3>
            
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-blue-600">Basic PDF Viewer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Single page viewing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Zoom in/out controls</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Page navigation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Document rotation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Download functionality</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Error handling</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-purple-600">Advanced PDF Viewer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>All basic features +</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Continuous page view</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Text extraction</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Full-text search</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Copy extracted text</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Multi-tab interface</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Performance Tips */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">🚀 Performance Best Practices</h3>
            
            <div className="space-y-3">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Worker Configuration:</strong> PDF.js worker is configured to use CDN for better performance and smaller bundle size.
                </AlertDescription>
              </Alert>
              
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Memory Management:</strong> Components properly clean up render tasks and PDF documents on unmount.
                </AlertDescription>
              </Alert>
              
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Lazy Loading:</strong> Advanced viewer only renders visible pages in continuous mode for better performance.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}