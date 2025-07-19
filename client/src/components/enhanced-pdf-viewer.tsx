import React, { useState, useEffect, useCallback } from 'react';
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
import { CanvasPDFViewer } from './canvas-pdf-viewer';

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
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Navigation handlers
  const handlePrevPage = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < 10) { // Assume max 10 pages for now
      onPageChange(currentPage + 1);
    }
  };

  // Zoom handlers
  const handleZoomIn = () => {
    const newZoom = Math.min(zoom * 1.2, 5.0);
    onZoomChange(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom / 1.2, 0.1);
    onZoomChange(newZoom);
  };

  const handleZoomReset = () => {
    onZoomChange(1.0);
  };

  const handleRotate = () => {
    const newRotation = (rotation + 90) % 360;
    onRotationChange(newRotation);
  };

  // PDF Document Component - Use Canvas PDF Viewer
  const PDFDocument = () => {
    if (file.type !== 'pdf') return null;

    return (
      <CanvasPDFViewer
        file={file as { id: string; name: string; type: 'pdf'; size: number }}
        documentId={documentId}
        zoom={zoom}
        currentPage={currentPage}
        onZoomChange={onZoomChange}
        onPageChange={onPageChange}
      />
    );
  };

  // Image Viewer Component
  const ImageViewer = () => {
    if (file.type !== 'image') return null;

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Controls Header */}
        <div className="p-3 border-b bg-gray-50 dark:bg-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-blue-600" />
              <h3 className="font-medium">Image Viewer</h3>
            </div>
            
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleZoomReset}
                className="min-w-[60px]"
              >
                {Math.round(zoom * 100)}%
              </Button>
              <Button size="sm" variant="outline" onClick={handleZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={handleRotate}>
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Image Content */}
        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-800">
          <div className="flex justify-center items-center min-h-full p-4">
            <div
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                transition: 'transform 0.2s ease-in-out',
              }}
            >
              <img
                src={`/api/documents/${documentId}/image?t=${Date.now()}`}
                alt={file.name}
                className="max-w-none h-auto border border-gray-300 rounded-lg shadow-lg"
                style={{ 
                  maxWidth: 'calc(100vw - 100px)',
                  maxHeight: 'calc(100vh - 200px)'
                }}
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
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {file.type === 'pdf' ? <PDFDocument /> : <ImageViewer />}
    </div>
  );
}
