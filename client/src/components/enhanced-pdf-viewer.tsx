import React, { useState, useEffect, useCallback } from 'react';
import { Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
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

// Remove the external CDN URL - worker is now configured in pdf-worker-config.ts

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
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const { toast } = useToast();

  // Configure the default layout plugin
  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => [
      defaultTabs[1], // Bookmarks
      defaultTabs[2], // Attachments
    ],
  });

  // Get PDF URL
  const getPdfUrl = useCallback(() => {
    return `/api/documents/${documentId}/raw?t=${Date.now()}`;
  }, [documentId]);

  // Initialize PDF
  useEffect(() => {
    if (file.type === 'pdf') {
      const url = getPdfUrl();
      setPdfUrl(url);
      console.log(`📄 PDF URL set: ${url}`);
    }
  }, [file.type, getPdfUrl]);

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

  // PDF Document Component
  const PDFDocument = () => {
    if (file.type !== 'pdf') return null;

    return (
      <div className="h-full">
        {/* Remove Worker wrapper - worker is now globally configured */}
        <Viewer
          fileUrl={pdfUrl}
          plugins={[defaultLayoutPluginInstance]}
          onDocumentLoad={(e) => {
            console.log('✅ PDF document loaded:', e.doc.numPages, 'pages');
            setNumPages(e.doc.numPages);
            setLoading(false);
            setError(null);
            toast({
              title: "PDF Loaded",
              description: `Successfully loaded ${e.doc.numPages} page${e.doc.numPages !== 1 ? 's' : ''}`,
            });
          }}
          onPageChange={(e) => {
            onPageChange(e.currentPage + 1); // Convert 0-based to 1-based
          }}
          renderError={(error) => (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
              <h3 className="text-lg font-semibold text-red-600 mb-2">PDF Render Error</h3>
              <p className="text-sm text-gray-600 mb-4">
                {error.message || 'Failed to render PDF content'}
              </p>
              <div className="text-xs text-gray-500 mt-2">
                <p><strong>CSP Fix Applied:</strong></p>
                <ul className="list-disc list-inside space-y-1">
                  <li>PDF worker now loads locally (no external CDN)</li>
                  <li>This should resolve CSP script-src violations</li>
                  <li>Check console for any remaining errors</li>
                </ul>
              </div>
              <Button size="sm" onClick={() => window.location.reload()}>
                Reload Page
              </Button>
            </div>
          )}
          renderLoader={(percentages) => (
            <div className="flex flex-col items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin mb-2" />
              <div className="text-center">
                <p className="text-sm font-medium">Loading PDF...</p>
                <p className="text-xs text-gray-500">
                  {Math.round(percentages * 100)}% complete
                </p>
                <p className="text-xs text-green-600 mt-1">
                  ✅ Using CSP-compliant local worker
                </p>
              </div>
            </div>
          )}
        />
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
            src={`/api/documents/${documentId}/image?t=${Date.now()}`}
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
            {/* Basic controls for non-PDF files */}
            {file.type !== 'pdf' && (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>

      {/* Document Content */}
      <div className="flex-1 overflow-hidden">
        {file.type === 'pdf' ? <PDFDocument /> : <ImageViewer />}
      </div>
    </div>
  );
}
