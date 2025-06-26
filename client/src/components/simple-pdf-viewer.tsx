import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  FileText, 
  AlertTriangle,
  CheckCircle,
  Eye,
  RefreshCw
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export function SimplePDFViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const logMessage = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    console.log(`[PDF Viewer] ${message}`);
    if (type === 'error') {
      setError(message);
      setSuccess(null);
    } else if (type === 'success') {
      setSuccess(message);
      setError(null);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === 'application/pdf') {
        setSelectedFile(file);
        setError(null);
        logMessage(`Selected file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      } else {
        logMessage('Please select a PDF file', 'error');
      }
    }
  };

  const loadPDF = async () => {
    if (!selectedFile) {
      logMessage('No file selected', 'error');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      logMessage('Starting PDF loading...');
      
      // Convert file to array buffer
      const arrayBuffer = await selectedFile.arrayBuffer();
      logMessage('File converted to array buffer');

      // Create loading task
      const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        // Add these options to handle potential issues
        isEvalSupported: false,
        useSystemFonts: true,
        standardFontDataUrl: null
      });

      logMessage('PDF loading task created');

      // Load the document
      const pdf = await loadingTask.promise;
      logMessage(`PDF loaded successfully! Pages: ${pdf.numPages}`, 'success');

      setPdfDocument(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);

      // Render the first page
      await renderPage(pdf, 1);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logMessage(`Failed to load PDF: ${errorMessage}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderPage = async (pdf: pdfjsLib.PDFDocumentProxy, pageNumber: number) => {
    if (!canvasRef.current) {
      logMessage('Canvas not available', 'error');
      return;
    }

    try {
      logMessage(`Rendering page ${pageNumber}...`);

      const page = await pdf.getPage(pageNumber);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Cannot get 2D context');
      }

      // Clear previous content
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Calculate scale to fit container
      const containerWidth = canvas.parentElement?.clientWidth || 800;
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(containerWidth / viewport.width, 1.5);
      const scaledViewport = page.getViewport({ scale });

      // Set canvas dimensions
      canvas.height = scaledViewport.height;
      canvas.width = scaledViewport.width;
      canvas.style.width = `${scaledViewport.width}px`;
      canvas.style.height = `${scaledViewport.height}px`;

      logMessage(`Canvas dimensions: ${canvas.width}x${canvas.height}, scale: ${scale.toFixed(2)}`);

      // Render the page
      const renderTask = page.render({
        canvasContext: context,
        viewport: scaledViewport
      });

      await renderTask.promise;
      logMessage(`Page ${pageNumber} rendered successfully!`, 'success');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logMessage(`Failed to render page ${pageNumber}: ${errorMessage}`, 'error');
      throw err;
    }
  };

  const goToPage = async (pageNumber: number) => {
    if (pdfDocument && pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
      await renderPage(pdfDocument, pageNumber);
    }
  };

  const testBasicCanvas = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) {
      logMessage('Cannot get canvas context', 'error');
      return;
    }

    // Draw test pattern
    canvas.width = 400;
    canvas.height = 300;

    context.fillStyle = '#f8f9fa';
    context.fillRect(0, 0, 400, 300);

    context.fillStyle = '#007bff';
    context.fillRect(50, 50, 300, 200);

    context.fillStyle = 'white';
    context.font = '24px Arial';
    context.textAlign = 'center';
    context.fillText('Canvas Working!', 200, 150);

    logMessage('Canvas test completed successfully', 'success');
  };

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Simple PDF Viewer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Select PDF File:</label>
            <div className="flex gap-2">
              <Input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileSelect}
                ref={fileInputRef}
                className="flex-1"
              />
              <Button onClick={testBasicCanvas} variant="outline">
                Test Canvas
              </Button>
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-2 flex-wrap">
            <Button 
              onClick={loadPDF} 
              disabled={!selectedFile || loading}
              className="flex-1"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Eye className="h-4 w-4 mr-2" />
              )}
              Load PDF
            </Button>
          </div>

          {/* Status Messages */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {/* Page Navigation */}
          {pdfDocument && (
            <div className="flex items-center justify-between">
              <Button 
                variant="outline" 
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                Previous
              </Button>
              
              <Badge variant="outline">
                Page {currentPage} of {totalPages}
              </Badge>
              
              <Button 
                variant="outline" 
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PDF Display */}
      <Card>
        <CardHeader>
          <CardTitle>PDF Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 flex justify-center">
            <canvas
              ref={canvasRef}
              className="border border-gray-400 bg-white shadow-lg max-w-full"
              style={{ height: 'auto' }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
