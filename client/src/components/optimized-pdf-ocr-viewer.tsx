import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  X,
  FileText,
  Image as ImageIcon,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EnhancedPDFViewer } from "./enhanced-pdf-viewer";
import { ScrollableTextPanel } from "./scrollable-text-panel";

interface OptimizedPDFOCRViewerProps {
  file: {
    id: string;
    name: string;
    type: 'image' | 'pdf';
    size: number;
    result?: {
      extractedText: string;
      confidence: number;
      pageCount?: number;
    };
  };
  documentId: number;
  onClose: () => void;
  onTextEdit: (fileId: string, newText: string) => void;
  onExport: (fileId: string, format: 'txt' | 'pdf' | 'docx') => void;
}

export function OptimizedPDFOCRViewer({ 
  file, 
  documentId, 
  onClose, 
  onTextEdit, 
  onExport 
}: OptimizedPDFOCRViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [syncScroll, setSyncScroll] = useState(false);
  const { toast } = useToast();

  // Extract current text and confidence
  const extractedText = file.result?.extractedText || '';
  const confidence = file.result?.confidence || 0;
  const totalPages = file.result?.pageCount || 1;

  // Handle text editing
  const handleTextEdit = (newText: string) => {
    onTextEdit(file.id, newText);
  };

  // Handle export
  const handleExport = (format: 'txt' | 'pdf' | 'docx') => {
    onExport(file.id, format);
    toast({
      title: `Export ${format.toUpperCase()} started`,
      description: "Your file will be downloaded shortly.",
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {file.type === 'pdf' ? (
                <FileText className="h-5 w-5 text-red-600" />
              ) : (
                <ImageIcon className="h-5 w-5 text-blue-600" />
              )}
              <h2 className="text-lg font-semibold">{file.name}</h2>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {Math.round(confidence * 100)}% confidence
              </Badge>
              
              {file.type === 'pdf' && totalPages > 1 && (
                <Badge variant="secondary">
                  Page {currentPage} of {totalPages}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sync Scroll Toggle */}
            <Button
              variant={syncScroll ? "default" : "outline"}
              size="sm"
              onClick={() => setSyncScroll(!syncScroll)}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Sync
            </Button>

            {/* Export Options */}
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => handleExport('txt')}>
                TXT
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleExport('pdf')}>
                PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleExport('docx')}>
                DOCX
              </Button>
            </div>

            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main Content - Two Panel Layout */}
        <div className="flex-1 flex min-h-0">
          {/* Left Panel - Document Viewer */}
          <div className="w-1/2 border-r">
            <EnhancedPDFViewer
              file={file}
              documentId={documentId}
              zoom={zoom}
              rotation={rotation}
              currentPage={currentPage}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onPageChange={setCurrentPage}
            />
          </div>

          {/* Right Panel - Scrollable Text */}
          <div className="w-1/2">
            <ScrollableTextPanel
              extractedText={extractedText}
              confidence={confidence}
              isEditable={true}
              onTextEdit={handleTextEdit}
              className="h-full"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t bg-gray-50 dark:bg-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-4">
              <span>{extractedText.length.toLocaleString()} characters</span>
              <span>{extractedText.split(/\s+/).filter(w => w.length > 0).length.toLocaleString()} words</span>
              <span>File size: {(file.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
            
            <div className="text-xs">
              {file.type === 'pdf' ? 'PDF Document' : 'Image Document'} • 
              {confidence > 0.8 ? ' High Quality' : confidence > 0.6 ? ' Good Quality' : ' Review Required'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
