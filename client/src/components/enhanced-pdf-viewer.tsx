import React, { useState, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Download,
  AlertTriangle,
  Loader2,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Bug
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PDFDebugConsole } from './pdf-debug-console';

// Import PDF worker configuration
import '@/lib/pdf-worker';

interface EnhancedPDFViewerProps {
  file: {
    id: string;
    name: string;
    type: 'image' | 'pdf';
    size: number;
  };
  documentId: number;
  zoom: number;
  rotation: number;
  currentPage: number;
  onZoomChange: (zoom: number) => void;
  onRotationChange: (rotation: number) => void;
  onPageChange: (page: number) => void;
}

export function EnhancedPDFViewer({
  file,
  documentId,
  zoom,
  rotation,
  currentPage,
  onZoomChange,
  onRotationChange,
  onPageChange,
}: EnhancedPDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const { toast } = useToast();

  // Get document URL
  const getDocumentUrl = useCallback(() => {
    if (file.type === 'pdf') {
      return `/api/documents/${documentId}/pdf?page=${currentPage}&t=${Date.now()}`;
    } else {
      return `/api/documents/${documentId}/image?t=${Date.now()}`;
    }
  }, [file.type, documentId, currentPage]);
  // Get PDF URL for react-pdf with better error handling
  const getPdfUrl = useCallback(() => {
    const baseUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const url = `${baseUrl}/api/documents/${documentId}/raw`;
    console.log(`📄 PDF URL: ${url}`);
    return url;
  }, [documentId]);

  // Enhanced document load handlers
  const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log(`[OK] PDF loaded successfully: ${numPages} pages`);
    setNumPages(numPages);
    setLoading(false);
    setError(null);
    
    toast({
      title: "PDF Loaded",
      description: `Successfully loaded ${numPages} page${numPages !== 1 ? 's' : ''}`,
    });
  };

  const handleDocumentLoadError = (error: Error) => {
    console.error('[ERROR] PDF load error:', error);
    console.error('PDF URL was:', getPdfUrl());
    
    let errorMessage = 'Unknown error';
    
    if (error.message.includes('fetch')) {
      errorMessage = 'Network error - could not fetch PDF file';
    } else if (error.message.includes('worker')) {
      errorMessage = 'PDF worker configuration error';
    } else if (error.message.includes('cors')) {
      errorMessage = 'CORS error - PDF not accessible';
    } else if (error.message.includes('404')) {
      errorMessage = 'PDF file not found on server';
    } else {
      errorMessage = `PDF load failed: ${error.message}`;
    }
    
    setError(errorMessage);
    setLoading(false);
    
    toast({
      title: "PDF Load Failed",
      description: errorMessage,
      variant: "destructive",
    });
  };

  const handlePageLoadSuccess = () => {
    setLoading(false);
  };

  const handlePageLoadError = (error: Error) => {
    console.error('📄 Page load error:', error);
    setError(`Failed to load page: ${error.message}`);
    setLoading(false);
  };

  // Navigation handlers
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

  // Zoom handlers
  const handleZoomIn = () => {
    const newZoom = Math.min(zoom * 1.2, 3);
    onZoomChange(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom / 1.2, 0.3);
    onZoomChange(newZoom);
  };

  const handleRotate = () => {
    const newRotation = (rotation + 90) % 360;
    onRotationChange(newRotation);
  };
  // Retry loading with enhanced diagnostics
  const handleRetry = async () => {
    console.log('🔄 Retrying PDF load...');
    setLoading(true);
    setError(null);
    
    // Test URL accessibility first
    try {
      const testUrl = getPdfUrl();
      console.log(`🧪 Testing URL accessibility: ${testUrl}`);
      
      const response = await fetch(testUrl, { method: 'HEAD' });
      console.log(`📊 URL test response: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      console.log('[OK] URL is accessible, proceeding with PDF load...');    } catch (fetchError) {
      console.error('[ERROR] URL test failed:', fetchError);
      setError(`URL not accessible: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
      setLoading(false);
      return;
    }
    
    // Check PDF worker
    try {
      const workerSrc = pdfjs.GlobalWorkerOptions.workerSrc;
      console.log(`🔧 Current worker: ${workerSrc}`);
      
      if (!workerSrc) {
        throw new Error('PDF worker not configured');
      }    } catch (workerError) {
      console.error('[ERROR] Worker check failed:', workerError);
      setError(`Worker error: ${workerError instanceof Error ? workerError.message : 'Unknown error'}`);
      setLoading(false);
      return;
    }
    
    console.log('[OK] All tests passed, retrying PDF load...');
  };

  // PDF Viewer Component
  const PDFDocument = () => {
    if (file.type !== 'pdf') return null;

    return (
      <div className="flex flex-col items-center space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span>Loading PDF...</span>
          </div>
        )}

        {error && (
          <Card className="w-full max-w-md">
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Failed to Load PDF</h3>
              <p className="text-sm text-gray-600 mb-4">{error}</p>
              <Button onClick={handleRetry} size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {!error && (
          <Document
            file={getPdfUrl()}
            onLoadSuccess={handleDocumentLoadSuccess}
            onLoadError={handleDocumentLoadError}
            loading={
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span>Loading PDF...</span>
              </div>
            }
            error={
              <Card className="w-full max-w-md">
                <CardContent className="p-6 text-center">
                  <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">PDF Load Error</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Unable to load the PDF file. Please check if the file exists and is accessible.
                  </p>
                  <Button onClick={handleRetry} size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                </CardContent>
              </Card>
            }
          >
            <Page
              pageNumber={currentPage}
              scale={zoom}
              rotate={rotation}
              onLoadSuccess={handlePageLoadSuccess}
              onLoadError={handlePageLoadError}
              loading={
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading page...</span>
                </div>
              }
              error={
                <div className="text-center py-4">
                  <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Failed to load page {currentPage}</p>
                </div>
              }
            />
          </Document>
        )}
      </div>
    );
  };

  // Image Viewer Component
  const ImageViewer = () => {
    if (file.type !== 'image') return null;

    return (
      <div className="flex justify-center">
        <div
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
          }}
        >
          <img
            src={getDocumentUrl()}
            alt={file.name}
            className="max-w-full h-auto border border-gray-300 rounded-lg shadow-lg"
            style={{ maxHeight: '800px' }}
            onLoad={() => {
              setLoading(false);
              setError(null);
            }}
            onError={(e) => {
              console.error('🖼️ Image load error:', e);
              setError('Failed to load image');
              setLoading(false);
            }}
          />
        </div>
      </div>
    );
  };
  return (
    <div className="flex flex-col h-full">
      {/* Debug Console */}
      {showDebug && (
        <div className="border-b">
          <PDFDebugConsole documentId={documentId} />
        </div>
      )}

      {/* Controls Header */}
      <div className="p-3 border-b bg-gray-50 dark:bg-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {file.type === 'pdf' ? (
              <FileText className="h-5 w-5 text-red-600" />
            ) : (
              <ImageIcon className="h-5 w-5 text-blue-600" />
            )}
            <h3 className="font-medium">Document Viewer</h3>
            {file.type === 'pdf' && numPages > 0 && (
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
              <Button size="sm" variant="outline" onClick={handleRotate}>
              <RotateCw className="h-4 w-4" />
            </Button>

            {/* Debug Toggle */}
            <Button 
              size="sm" 
              variant={showDebug ? "default" : "outline"} 
              onClick={() => setShowDebug(!showDebug)}
            >
              <Bug className="h-4 w-4" />
            </Button>

            {/* Page Navigation */}
            {file.type === 'pdf' && numPages > 1 && (
              <div className="flex items-center gap-1 ml-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm px-2 min-w-[60px] text-center">
                  {currentPage} / {numPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleNextPage}
                  disabled={currentPage === numPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Document Content */}
      <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900">
        <div className="p-4 flex justify-center min-h-full">
          {file.type === 'pdf' ? <PDFDocument /> : <ImageViewer />}
        </div>
      </div>
    </div>
  );
}
