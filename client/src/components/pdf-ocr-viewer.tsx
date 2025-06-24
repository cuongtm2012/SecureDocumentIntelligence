import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit,
  Save,
  X,
  FileText,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle,
  Copy,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PDFOCRViewerProps {
  file: {
    id: string;
    name: string;
    type: 'image' | 'pdf';
    size: number;
    result?: {
      extractedText: string;
      confidence: number;
      pageCount?: number;
      pages?: Array<{
        pageNumber: number;
        text: string;
        confidence: number;
        imageUrl?: string;
      }>;
    };
  };
  onClose: () => void;
  onTextEdit: (fileId: string, newText: string, pageNumber?: number) => void;
  onExport: (fileId: string, format: 'txt' | 'pdf' | 'docx') => void;
}

export function PDFOCRViewer({ file, onClose, onTextEdit, onExport }: PDFOCRViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [syncScroll, setSyncScroll] = useState(true);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const imageRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const totalPages = file.result?.pageCount || 1;
  const currentPageData = file.result?.pages?.find(p => p.pageNumber === currentPage);
  const currentText = currentPageData?.text || file.result?.extractedText || '';
  const currentConfidence = currentPageData?.confidence || file.result?.confidence || 0;

  // Initialize edited text when page changes
  useEffect(() => {
    setEditedText(currentText);
  }, [currentText, currentPage]);

  // Simulate PDF/Image URL for display
  const getDocumentUrl = () => {
    if (file.type === 'pdf') {
      return `/api/documents/${file.id}/pdf?page=${currentPage}&t=${Date.now()}`;
    } else {
      return `/api/documents/${file.id}/image?t=${Date.now()}`;
    }
  };

  // Handle zoom controls
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.25));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  // Handle page navigation
  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  // Handle text editing
  const handleStartEdit = () => {
    setIsEditing(true);
    setEditedText(currentText);
  };

  const handleSaveEdit = () => {
    onTextEdit(file.id, editedText, file.type === 'pdf' ? currentPage : undefined);
    setIsEditing(false);
    toast({
      title: "Text updated",
      description: "OCR text has been saved successfully.",
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedText(currentText);
  };

  // Handle synchronized scrolling
  const handleImageScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (syncScroll && textRef.current) {
      const scrollRatio = e.currentTarget.scrollTop / (e.currentTarget.scrollHeight - e.currentTarget.clientHeight);
      textRef.current.scrollTop = scrollRatio * (textRef.current.scrollHeight - textRef.current.clientHeight);
    }
  }, [syncScroll]);

  const handleTextScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (syncScroll && imageRef.current) {
      const scrollRatio = e.currentTarget.scrollTop / (e.currentTarget.scrollHeight - e.currentTarget.clientHeight);
      imageRef.current.scrollTop = scrollRatio * (imageRef.current.scrollHeight - imageRef.current.clientHeight);
    }
  }, [syncScroll]);

  // Handle export
  const handleExport = (format: 'txt' | 'pdf' | 'docx') => {
    onExport(file.id, format);
    toast({
      title: `Export ${format.toUpperCase()} started`,
      description: "Your file will be downloaded shortly.",
    });
  };

  // Copy text to clipboard
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(currentText);
      toast({
        title: "Text copied",
        description: "OCR text has been copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Unable to copy text to clipboard.",
        variant: "destructive",
      });
    }
  };

  // Highlight low confidence words
  const highlightLowConfidenceWords = (text: string, threshold: number = 0.7) => {
    // This is a simplified implementation
    // In a real scenario, you'd have word-level confidence data
    const words = text.split(/(\s+)/);
    return words.map((word, index) => {
      const isLowConfidence = Math.random() < 0.1; // Simulate low confidence
      return (
        <span
          key={index}
          className={isLowConfidence ? 'bg-yellow-200 dark:bg-yellow-800 px-1 rounded' : ''}
          title={isLowConfidence ? 'Low confidence word - please review' : ''}
        >
          {word}
        </span>
      );
    });
  };

  // Handle image loading errors with better fallback
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    console.error(`Failed to load document image: ${img.src}`);
    
    // Unicode-safe base64 encoding function
    const unicodeSafeBase64 = (str: string) => {
      try {
        // First encode to UTF-8, then to base64
        return btoa(unescape(encodeURIComponent(str)));
      } catch (error) {
        // Fallback: remove non-Latin1 characters
        const latin1Safe = str.replace(/[^\x00-\xFF]/g, '?');
        return btoa(latin1Safe);
      }
    };
    
    // Create a safe filename for display (remove special characters)
    const safeFileName = file.name.replace(/[^\w\s\-\.]/g, '_');
    
    // Create a more informative fallback SVG
    const fallbackSvg = `data:image/svg+xml;base64,${unicodeSafeBase64(`
      <svg width="600" height="800" xmlns="http://www.w3.org/2000/svg">
        <rect width="600" height="800" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2"/>
        <rect x="30" y="30" width="540" height="60" fill="#e9ecef" rx="8"/>
        <text x="300" y="65" text-anchor="middle" font-family="Arial" font-size="16" fill="#495057">
          ${safeFileName}
        </text>
        
        <circle cx="300" cy="300" r="60" fill="#ffc107" opacity="0.3"/>
        <text x="300" y="290" text-anchor="middle" font-family="Arial" font-size="48" fill="#ffc107">⚠</text>
        
        <text x="300" y="400" text-anchor="middle" font-family="Arial" font-size="18" fill="#dc3545">
          Document Preview Unavailable
        </text>
        <text x="300" y="430" text-anchor="middle" font-family="Arial" font-size="14" fill="#6c757d">
          ${file.type === 'pdf' ? 'PDF processing required' : 'Image loading failed'}
        </text>
        <text x="300" y="460" text-anchor="middle" font-family="Arial" font-size="12" fill="#868e96">
          Click "Process" to extract text content
        </text>
        
        <rect x="200" y="500" width="200" height="40" fill="#007bff" rx="4"/>
        <text x="300" y="525" text-anchor="middle" font-family="Arial" font-size="14" fill="white">
          Process Document
        </text>
        
        <text x="300" y="600" text-anchor="middle" font-family="Arial" font-size="12" fill="#adb5bd">
          File size: ${(file.size / 1024 / 1024).toFixed(2)} MB
        </text>
        ${file.type === 'pdf' ? `
        <text x="300" y="620" text-anchor="middle" font-family="Arial" font-size="12" fill="#adb5bd">
          Page ${currentPage} of ${totalPages}
        </text>` : ''}
      </svg>
    `)}`;
    
    img.src = fallbackSvg;
  };

  // Check if document has been processed
  const isProcessed = file.result && file.result.extractedText;
  const documentUrl = getDocumentUrl();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
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
                {Math.round(currentConfidence * 100)}% confidence
              </Badge>
              
              {file.type === 'pdf' && (
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
              Sync Scroll
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

        {/* Main Content */}
        <div className="flex-1 flex">
          {/* Left Panel - Document Viewer */}
          <div className="w-1/2 border-r flex flex-col">
            <div className="p-3 border-b bg-gray-50 dark:bg-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Document Viewer</h3>
                
                <div className="flex items-center gap-2">
                  {/* Zoom Controls */}
                  <Button size="sm" variant="outline" onClick={handleZoomOut}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-2">{Math.round(zoom * 100)}%</span>
                  <Button size="sm" variant="outline" onClick={handleZoomIn}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  
                  <Button size="sm" variant="outline" onClick={handleRotate}>
                    <RotateCw className="h-4 w-4" />
                  </Button>

                  {/* Page Navigation */}
                  {file.type === 'pdf' && totalPages > 1 && (
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handlePrevPage}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm px-2">
                        {currentPage} / {totalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleNextPage}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1" onScrollCapture={handleImageScroll}>
              <div
                ref={imageRef}
                className="p-4 flex items-center justify-center min-h-full"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                }}
              >
                <div className="border border-gray-300 rounded-lg overflow-hidden shadow-lg">
                  <img
                    src={documentUrl}
                    alt={`${file.name} - Page ${currentPage}`}
                    className="max-w-full h-auto"
                    style={{ maxHeight: '800px' }}
                    onError={handleImageError}
                  />
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Right Panel - OCR Text */}
          <div className="w-1/2 flex flex-col">
            <div className="p-3 border-b bg-gray-50 dark:bg-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Extracted Text</h3>
                
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleCopyText}>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                  
                  {!isEditing ? (
                    <Button size="sm" variant="outline" onClick={handleStartEdit}>
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button size="sm" onClick={handleSaveEdit}>
                        <Save className="h-4 w-4 mr-1" />
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div ref={textRef} className="p-4 h-full max-h-full overflow-y-auto">
                {!isEditing ? (
                  <div className="prose max-w-none">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed break-words min-h-0">
                      {highlightLowConfidenceWords(currentText)}
                    </div>
                  </div>
                ) : (
                  <Textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="min-h-[400px] w-full resize-none"
                    placeholder="Edit the extracted text here..."
                  />
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 dark:bg-gray-700">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-4">
              <span>{currentText.length} characters</span>
              <span>{currentText.split(/\s+/).filter(word => word.length > 0).length} words</span>
              <span>File size: {(file.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
            
            <div className="flex items-center gap-2">
              {currentConfidence > 0.8 ? (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  High Quality
                </div>
              ) : (
                <div className="flex items-center gap-1 text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  Review Recommended
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
