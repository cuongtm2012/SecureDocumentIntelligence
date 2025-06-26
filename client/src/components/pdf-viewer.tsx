import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Download,
  FileText,
  AlertTriangle,
  Loader2,
  RotateCw
} from 'lucide-react';

// Configure PDF.js worker
if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  console.log('✅ PDF.js worker configured for basic PDFViewer');
}

interface PDFViewerProps {
  pdfUrl?: string;
  pdfFile?: File;
  className?: string;
  onLoadError?: (error: Error) => void;
  onLoadSuccess?: (pdf: pdfjsLib.PDFDocumentProxy) => void;
}

export function PDFViewer({ 
  pdfUrl, 
  pdfFile, 
  className = '',
  onLoadError,
  onLoadSuccess 
}: PDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderTask, setRenderTask] = useState<pdfjsLib.RenderTask | null>(null);

  // Load PDF from URL or File
  const loadPDF = useCallback(async () => {
    if (!pdfUrl && !pdfFile) return;

    setLoading(true);
    setError(null);

    try {
      let loadingTask: pdfjsLib.PDFDocumentLoadingTask;

      if (pdfFile) {
        // Load from File object
        const arrayBuffer = await pdfFile.arrayBuffer();
        loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      } else if (pdfUrl) {
        // Load from URL
        loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          httpHeaders: {
            'Cache-Control': 'no-cache'
          },
          // Add CORS handling
          withCredentials: false
        });
      } else {
        throw new Error('No PDF source provided');
      }

      const pdfDocument = await loadingTask.promise;
      setPdf(pdfDocument);
      setTotalPages(pdfDocument.numPages);
      setCurrentPage(1);
      
      onLoadSuccess?.(pdfDocument);
      console.log('✅ PDF loaded successfully:', {
        pages: pdfDocument.numPages,
        fingerprints: pdfDocument.fingerprints
      });

    } catch (err) {
      const error = err as Error;
      console.error('❌ PDF loading error:', error);
      setError(error.message || 'Failed to load PDF');
      onLoadError?.(error);
    } finally {
      setLoading(false);
    }
  }, [pdfUrl, pdfFile, onLoadError, onLoadSuccess]);

  // Render specific page
  const renderPage = useCallback(async (pageNumber: number) => {
    if (!pdf || !canvasRef.current) {
      console.warn('⚠️ Cannot render: PDF or canvas not available');
      return;
    }

    // Cancel previous render task if still running
    if (renderTask) {
      renderTask.cancel();
    }

    try {
      const page = await pdf.getPage(pageNumber);
      const canvas = canvasRef.current;
      
      // Ensure canvas is still mounted
      if (!canvas) {
        console.warn('⚠️ Canvas unmounted during render');
        return;
      }

      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Cannot get canvas 2D context - canvas may be corrupted');
      }

      // Clear any previous content
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Calculate viewport with scale and rotation
      const viewport = page.getViewport({ 
        scale: scale,
        rotation: rotation 
      });

      // Set canvas dimensions
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Set canvas style for better display
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';

      // Render the page
      const newRenderTask = page.render({
        canvasContext: context,
        viewport: viewport
      });

      setRenderTask(newRenderTask);

      await newRenderTask.promise;
      console.log(`✅ Page ${pageNumber} rendered successfully`);

    } catch (err) {
      if (err instanceof Error && err.name !== 'RenderingCancelledException') {
        console.error('❌ Page rendering error:', err);
        setError(`Failed to render page ${pageNumber}: ${err.message}`);
      }
    }
  }, [pdf, scale, rotation, renderTask]);

  // Load PDF when URL or file changes
  useEffect(() => {
    loadPDF();
  }, [loadPDF]);

  // Render current page when PDF, page, scale, or rotation changes
  useEffect(() => {
    if (pdf && currentPage) {
      renderPage(currentPage);
    }
  }, [pdf, currentPage, renderPage]);

  // Navigation handlers
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

  // Zoom handlers
  const zoomIn = () => {
    setScale(prev => Math.min(prev * 1.2, 3.0));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(prev / 1.2, 0.3));
  };

  const resetZoom = () => {
    setScale(1.0);
  };

  // Rotation handler
  const rotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  // Download handler
  const downloadPDF = () => {
    if (pdfUrl) {
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = 'document.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (pdfFile) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfFile);
      link.download = pdfFile.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (renderTask) {
        renderTask.cancel();
      }
      if (pdf) {
        pdf.destroy();
      }
    };
  }, [pdf, renderTask]);

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>PDF Loading Error:</strong> {error}
            </AlertDescription>
          </Alert>
          <Button 
            onClick={loadPDF} 
            className="mt-4"
            variant="outline"
          >
            Retry Loading
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading PDF...</p>
        </CardContent>
      </Card>
    );
  }

  if (!pdf) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm text-gray-600">No PDF loaded</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            PDF Viewer
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              Page {currentPage} of {totalPages}
            </Badge>
            <Badge variant="outline">
              {Math.round(scale * 100)}%
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Controls */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevPage}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <span className="text-sm px-2 min-w-[100px] text-center">
              {currentPage} / {totalPages}
            </span>
            
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

        {/* PDF Canvas */}
        <div className="p-4 overflow-auto max-h-[70vh] flex justify-center bg-gray-100">
          <canvas
            ref={canvasRef}
            className="border border-gray-300 shadow-lg bg-white"
            style={{
              maxWidth: '100%',
              height: 'auto'
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}