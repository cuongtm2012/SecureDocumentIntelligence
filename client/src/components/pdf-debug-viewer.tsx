import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { 
  AlertTriangle, 
  CheckCircle, 
  FileText, 
  RefreshCw,
  Eye,
  Code
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

export function PDFDebugViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev, logMessage]);
    console.log(logMessage);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const testPDFLoading = async () => {
    clearLogs();
    setIsLoading(true);
    setError(null);
    
    try {
      addLog('Starting PDF loading test...');
      
      // Test 1: Check PDF.js worker
      addLog(`PDF.js version: ${pdfjsLib.version}`);
      addLog(`Worker source: ${pdfjsLib.GlobalWorkerOptions.workerSrc}`);
      
      // Test 2: Load a simple test PDF
      const testUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
      addLog(`Loading test PDF from: ${testUrl}`);
      
      const loadingTask = pdfjsLib.getDocument({
        url: testUrl,
        httpHeaders: {
          'Cache-Control': 'no-cache'
        },
        withCredentials: false
      });
      
      addLog('PDF loading task created...');
      
      const pdf = await loadingTask.promise;
      addLog(`✅ PDF loaded successfully! Pages: ${pdf.numPages}`);
      addLog(`PDF fingerprints: ${JSON.stringify(pdf.fingerprints)}`);
      
      setPdfDocument(pdf);
      setCurrentPage(1);
      
      // Test 3: Render first page
      await renderPage(pdf, 1);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      addLog(`❌ PDF loading failed: ${errorMessage}`);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const renderPage = async (pdf: pdfjsLib.PDFDocumentProxy, pageNumber: number) => {
    if (!canvasRef.current) {
      addLog('❌ Canvas not available for rendering');
      return;
    }

    try {
      addLog(`Rendering page ${pageNumber}...`);
      
      const page = await pdf.getPage(pageNumber);
      addLog(`✅ Page ${pageNumber} obtained`);
      
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error('Cannot get 2D context from canvas');
      }
      
      // Clear canvas
      context.clearRect(0, 0, canvas.width, canvas.height);
      addLog('Canvas cleared');
      
      // Calculate viewport
      const viewport = page.getViewport({ scale: 1.5 });
      addLog(`Viewport calculated: ${viewport.width}x${viewport.height}`);
      
      // Set canvas dimensions
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';
      
      addLog(`Canvas dimensions set: ${canvas.width}x${canvas.height}`);
      
      // Render
      const renderTask = page.render({
        canvasContext: context,
        viewport: viewport
      });
      
      addLog('Render task started...');
      await renderTask.promise;
      addLog(`✅ Page ${pageNumber} rendered successfully!`);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      addLog(`❌ Page rendering failed: ${errorMessage}`);
      throw err;
    }
  };

  const testCanvasWorking = () => {
    if (!canvasRef.current) {
      addLog('❌ Canvas ref not available');
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) {
      addLog('❌ Cannot get 2D context');
      return;
    }

    // Draw a simple test pattern
    canvas.width = 400;
    canvas.height = 300;
    
    // Clear and draw test pattern
    context.fillStyle = '#f0f0f0';
    context.fillRect(0, 0, 400, 300);
    
    context.fillStyle = '#333';
    context.fillRect(50, 50, 300, 200);
    
    context.fillStyle = '#fff';
    context.font = '20px Arial';
    context.fillText('Canvas Test', 150, 150);
    
    addLog('✅ Canvas test pattern drawn successfully');
  };

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            PDF Debug Viewer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={testPDFLoading} disabled={isLoading}>
              {isLoading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Test PDF Loading
            </Button>
            
            <Button variant="outline" onClick={testCanvasWorking}>
              <Code className="h-4 w-4 mr-2" />
              Test Canvas
            </Button>
            
            <Button variant="outline" onClick={clearLogs}>
              Clear Logs
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {pdfDocument && (
            <div className="flex items-center gap-2">
              <Badge variant="default">
                PDF Loaded: {pdfDocument.numPages} pages
              </Badge>
              <Badge variant="outline">
                Current Page: {currentPage}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Canvas for PDF rendering */}
      <Card>
        <CardHeader>
          <CardTitle>PDF Canvas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-gray-300 p-4 rounded-lg">
            <canvas
              ref={canvasRef}
              className="border border-gray-300 bg-white shadow-sm"
              style={{
                maxWidth: '100%',
                height: 'auto'
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Debug Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Debug Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={logs.join('\n')}
            readOnly
            className="font-mono text-sm min-h-[200px]"
            placeholder="Debug logs will appear here..."
          />
        </CardContent>
      </Card>
    </div>
  );
}
