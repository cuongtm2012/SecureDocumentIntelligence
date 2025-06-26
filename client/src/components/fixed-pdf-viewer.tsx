import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

export function FixedPDFViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderTask, setRenderTask] = useState<pdfjsLib.RenderTask | null>(null);

  // Initialize PDF.js worker
  useEffect(() => {
    if (typeof window !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      console.log('✅ PDF.js worker initialized:', pdfjsLib.GlobalWorkerOptions.workerSrc);
    }
  }, []);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === 'application/pdf') {
        setSelectedFile(file);
        setError(null);
        console.log(`📄 File selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      } else {
        setError('Please select a valid PDF file');
      }
    }
  }, []);

  const loadPDF = useCallback(async () => {
    if (!selectedFile) {
      setError('No file selected');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🚀 Starting PDF load...');
      
      // Cancel any existing render task
      if (renderTask) {
        renderTask.cancel();
        setRenderTask(null);
      }

      // Clean up previous document
      if (pdfDocument) {
        pdfDocument.destroy();
      }

      // Convert file to ArrayBuffer
      const arrayBuffer = await selectedFile.arrayBuffer();
      console.log('📊 File converted to ArrayBuffer');

      // Create PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        isEvalSupported: false,
        useSystemFonts: true
      });

      const pdf = await loadingTask.promise;
      console.log(`✅ PDF loaded: ${pdf.numPages} pages`);

      setPdfDocument(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
      setScale(1.0);
      setRotation(0);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('❌ PDF loading failed:', errorMessage);
      setError(`Failed to load PDF: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [selectedFile, renderTask, pdfDocument]);

  const renderPage = useCallback(async (pageNumber: number) => {
    if (!pdfDocument || !canvasRef.current) {
      console.warn('⚠️ Cannot render: missing PDF document or canvas');
      return;
    }

    // Cancel previous render task
    if (renderTask) {
      renderTask.cancel();
    }

    try {
      console.log(`🎨 Rendering page ${pageNumber}...`);

      const page = await pdfDocument.getPage(pageNumber);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Cannot get 2D context from canvas');
      }

      // Clear canvas
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Calculate viewport
      const viewport = page.getViewport({ 
        scale: scale,
        rotation: rotation 
      });

      // Set canvas dimensions
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Set CSS dimensions for proper display
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      console.log(`📐 Canvas dimensions: ${canvas.width}x${canvas.height}, scale: ${scale}`);

      // Start rendering
      const newRenderTask = page.render({
        canvasContext: context,
        viewport: viewport
      });

      setRenderTask(newRenderTask);
      await newRenderTask.promise;
      
      console.log(`✅ Page ${pageNumber} rendered successfully`);
      setError(null);

    } catch (err) {
      if (err instanceof Error && err.name !== 'RenderingCancelledException') {
        const errorMessage = err.message;
        console.error(`❌ Render error:`, errorMessage);
        setError(`Failed to render page: ${errorMessage}`);
      }
    }
  }, [pdfDocument, scale, rotation, renderTask]);

  // Auto-render when page changes
  useEffect(() => {
    if (pdfDocument && currentPage) {
      renderPage(currentPage);
    }
  }, [pdfDocument, currentPage, renderPage]);

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const zoomIn = () => {
    setScale(prev => Math.min(prev * 1.2, 3.0));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(prev / 1.2, 0.3));
  };

  const resetZoom = () => {
    setScale(1.0);
  };

  const rotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const downloadPDF = () => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      const link = document.createElement('a');
      link.href = url;
      link.download = selectedFile.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (renderTask) {
        renderTask.cancel();
      }
      if (pdfDocument) {
        pdfDocument.destroy();
      }
    };
  }, [renderTask, pdfDocument]);

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Fixed PDF Viewer
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
              <Button 
                onClick={loadPDF} 
                disabled={!selectedFile || loading}
              >
                {loading ? 'Loading...' : 'Load PDF'}
              </Button>
            </div>
          </div>

          {/* Status Messages */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {pdfDocument && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                PDF loaded successfully! {totalPages} pages total.
              </AlertDescription>
            </Alert>
          )}

          {/* Controls */}
          {pdfDocument && (
            <div className="flex items-center justify-between p-4 border rounded bg-gray-50">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPrevPage}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <Badge variant="outline">
                  {currentPage} / {totalPages}
                </Badge>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextPage}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={zoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                
                <Button variant="outline" size="sm" onClick={resetZoom}>
                  {Math.round(scale * 100)}%
                </Button>
                
                <Button variant="outline" size="sm" onClick={zoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                
                <Button variant="outline" size="sm" onClick={rotate}>
                  <RotateCw className="h-4 w-4" />
                </Button>
                
                <Button variant="outline" size="sm" onClick={downloadPDF}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
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
          <div className="border border-gray-300 rounded-lg p-4 bg-gray-100 overflow-auto max-h-[70vh]">
            {pdfDocument ? (
              <div className="flex justify-center">
                <canvas
                  ref={canvasRef}
                  className="border border-gray-400 bg-white shadow-lg"
                  style={{
                    maxWidth: '100%',
                    height: 'auto'
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                <div className="text-center">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>Select and load a PDF file to view it here</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
