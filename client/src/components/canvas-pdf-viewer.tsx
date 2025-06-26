import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft,
  ChevronRight,
  FileText,
  AlertTriangle,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Import PDF.js
import * as pdfjsLib from 'pdfjs-dist';

interface CanvasPDFViewerProps {
  file: {
    id: string;
    name: string;
    type: 'pdf';
    size: number;
  };
  documentId: number;
  zoom: number;
  currentPage: number;
  onZoomChange: (zoom: number) => void;
  onPageChange: (page: number) => void;
}

export function CanvasPDFViewer({
  file,
  documentId,
  zoom,
  currentPage,
  onZoomChange,
  onPageChange,
}: CanvasPDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const mountedRef = useRef<boolean>(true);
  const { toast } = useToast();

  // Track component mount/unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Cancel any ongoing render task
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, []);

  // Load PDF document
  useEffect(() => {
    const loadPDF = async () => {
      if (!mountedRef.current) return;
      
      try {
        setLoading(true);
        setError(null);
        
        const pdfUrl = `/api/documents/${documentId}/raw?t=${Date.now()}`;
        console.log('📄 Loading PDF from:', pdfUrl);
        
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        
        if (!mountedRef.current) return;
        
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setLoading(false);
        
        console.log('✅ PDF loaded successfully:', pdf.numPages, 'pages');
        toast({
          title: "PDF Loaded",
          description: `Successfully loaded ${pdf.numPages} page${pdf.numPages !== 1 ? 's' : ''}`,
        });
        
      } catch (err: any) {
        if (!mountedRef.current) return;
        console.error('❌ PDF load error:', err);
        setError(err.message || 'Failed to load PDF');
        setLoading(false);
      }
    };

    loadPDF();
  }, [documentId, toast]);

  // Render current page
  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current || !mountedRef.current) return;
      
      // Cancel any existing render task
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // Ignore cancellation errors
        }
        renderTaskRef.current = null;
      }

      try {
        const canvas = canvasRef.current;
        if (!canvas || !mountedRef.current) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        const page = await pdfDoc.getPage(currentPage);
        if (!mountedRef.current) return;

        const viewport = page.getViewport({ scale: zoom });
        
        // Set canvas dimensions
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Clear canvas before rendering
        context.clearRect(0, 0, canvas.width, canvas.height);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        // Check if component is still mounted before starting render
        if (!mountedRef.current) return;

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        
        // Only update state if component is still mounted
        if (mountedRef.current) {
          renderTaskRef.current = null;
          console.log(`✅ Page ${currentPage} rendered successfully`);
        }
        
      } catch (error: any) {
        if (!mountedRef.current) return;
        
        // Ignore cancellation errors
        if (error.name === 'RenderingCancelledException') {
          console.log('🔄 Page render cancelled');
          return;
        }
        
        console.error('❌ Page render error:', error);
        setError(`Failed to render page ${currentPage}: ${error.message}`);
      }
    };

    renderPage();
  }, [pdfDoc, currentPage, zoom]);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < numPages) {
      onPageChange(currentPage + 1);
    }
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(zoom * 1.2, 3);
    onZoomChange(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom / 1.2, 0.3);
    onZoomChange(newZoom);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Loader2 className="h-8 w-8 animate-spin mb-4" />
        <p className="text-sm font-medium">Loading PDF...</p>
        <p className="text-xs text-gray-500">Using direct PDF.js canvas rendering</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-red-600 mb-2">PDF Load Error</h3>
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <Button size="sm" onClick={() => window.location.reload()}>
          Reload Page
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls Header */}
      <div className="p-3 border-b bg-gray-50 dark:bg-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-red-600" />
            <h3 className="font-medium">PDF Viewer (Canvas)</h3>
            {numPages > 0 && (
              <Badge variant="secondary">
                {numPages} page{numPages !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <Button size="sm" variant="outline" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm px-2 min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button size="sm" variant="outline" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            
            {/* Page Navigation */}
            <div className="flex items-center gap-1 ml-4">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handlePrevPage}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm px-2 min-w-[80px] text-center">
                {currentPage} / {numPages}
              </span>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleNextPage}
                disabled={currentPage >= numPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* PDF Canvas */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            className="border border-gray-300 rounded-lg shadow-lg max-w-full"
            style={{ 
              display: 'block',
              maxHeight: '80vh'
            }}
          />
        </div>
      </div>
    </div>
  );
}