
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  Edit3,
  Save,
  Eye,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  X,
  Copy,
  FileDown,
  RotateCcw,
  Type,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DocumentData {
  id: string;
  fileName: string;
  fileType: 'image' | 'pdf';
  extractedText: string;
  confidence: number;
  pageCount?: number;
  currentPage?: number;
  imageUrl?: string;
  documentId?: number;
  pages?: Array<{
    pageNumber: number;
    imageUrl: string;
    extractedText: string;
    confidence: number;
  }>;
  lowConfidenceWords?: Array<{
    word: string;
    confidence: number;
    position: { x: number; y: number; width: number; height: number };
  }>;
}

interface UnifiedDocumentViewerProps {
  document: DocumentData;
  onTextEdit?: (documentId: string, newText: string, pageNumber?: number) => void;
  onExport?: (documentId: string, format: 'txt' | 'pdf' | 'docx') => void;
  onClose: () => void;
  mode?: 'modal' | 'split' | 'fullscreen';
}

export function UnifiedDocumentViewer({
  document,
  onTextEdit,
  onExport,
  onClose,
  mode = 'modal'
}: UnifiedDocumentViewerProps) {
  const { toast } = useToast();
  
  // State management
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [showHighlights, setShowHighlights] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [pdfImages, setPdfImages] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'viewer' | 'text'>('viewer');
  const [wordCount, setWordCount] = useState(0);
  const [lineCount, setLineCount] = useState(0);
  
  // Refs
  const imageRef = useRef<HTMLImageElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);

  // Get current page data
  const currentPageData = document.pages?.[currentPage - 1] || {
    pageNumber: 1,
    imageUrl: document.imageUrl || '',
    extractedText: document.extractedText || '',
    confidence: document.confidence || 0
  };

  // Load PDF pages if it's a PDF
  useEffect(() => {
    if (document.fileType === 'pdf' && document.documentId) {
      loadPdfPages();
    }
  }, [document.documentId, document.fileType]);

  // Update edited text when page changes
  useEffect(() => {
    setEditedText(currentPageData.extractedText || '');
  }, [currentPageData.extractedText, currentPage]);

  // Calculate text statistics
  useEffect(() => {
    const words = editedText.trim().split(/\s+/).filter(word => word.length > 0);
    const lines = editedText.split('\n').length;
    setWordCount(words.length);
    setLineCount(lines);
  }, [editedText]);

  const loadPdfPages = async () => {
    try {
      setIsLoading(true);
      setError('');

      const response = await fetch(`/api/documents/${document.documentId}/pages`);
      
      if (!response.ok) {
        throw new Error(`Failed to load PDF pages: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.images) {
        setPdfImages(data.images);
        console.log(`✅ Loaded ${data.images.length} PDF pages as images`);
      } else {
        const pdfUrl = `/api/documents/${document.documentId}/raw?t=${Date.now()}`;
        setPdfImages([pdfUrl]);
      }
    } catch (error: any) {
      console.error('❌ Failed to load PDF images:', error);
      setError(error.message || 'Failed to load PDF content');
      
      const pdfUrl = `/api/documents/${document.documentId}/raw?t=${Date.now()}`;
      setPdfImages([pdfUrl]);
    } finally {
      setIsLoading(false);
    }
  };

  // Navigation handlers
  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < (document.pageCount || 1)) {
      setCurrentPage(prev => prev + 1);
    }
  };

  // Zoom handlers
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 400));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 25));
  const handleZoomReset = () => setZoom(100);
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const handleFitToScreen = () => {
    if (imageRef.current && imageContainerRef.current) {
      const container = imageContainerRef.current;
      const containerWidth = container.clientWidth - 32;
      const containerHeight = container.clientHeight - 32;
      const imageWidth = imageRef.current.naturalWidth;
      const imageHeight = imageRef.current.naturalHeight;
      
      const scaleX = containerWidth / imageWidth;
      const scaleY = containerHeight / imageHeight;
      const scale = Math.min(scaleX, scaleY, 1);
      
      setZoom(Math.round(scale * 100));
    }
  };

  // Text handling
  const handleSaveText = () => {
    if (onTextEdit) {
      onTextEdit(document.id, editedText, currentPage);
      setIsEditing(false);
      toast({ title: "Changes saved successfully" });
    }
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(editedText);
      toast({ title: "Text copied to clipboard" });
    } catch (error) {
      toast({ title: "Failed to copy text", variant: "destructive" });
    }
  };

  const handleExportText = (format: 'txt' | 'pdf' | 'docx') => {
    if (onExport) {
      onExport(document.id, format);
    } else {
      // Fallback: export as text file
      const blob = new Blob([editedText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${document.fileName}_extracted_text.txt`;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "Text exported successfully" });
    }
  };

  const handleDiscardChanges = () => {
    setEditedText(currentPageData.extractedText || '');
    setIsEditing(false);
    toast({ title: "Changes discarded" });
  };

  // Scroll synchronization
  const handleImageScroll = useCallback(() => {
    if (!imageContainerRef.current || !textContainerRef.current) return;
    
    const imageContainer = imageContainerRef.current;
    const textContainer = textContainerRef.current;
    
    const scrollPercentage = imageContainer.scrollTop / 
      (imageContainer.scrollHeight - imageContainer.clientHeight);
    
    textContainer.scrollTop = scrollPercentage * 
      (textContainer.scrollHeight - textContainer.clientHeight);
  }, []);

  const handleTextScroll = useCallback(() => {
    if (!imageContainerRef.current || !textContainerRef.current) return;
    
    const imageContainer = imageContainerRef.current;
    const textContainer = textContainerRef.current;
    
    const scrollPercentage = textContainer.scrollTop / 
      (textContainer.scrollHeight - textContainer.clientHeight);
    
    imageContainer.scrollTop = scrollPercentage * 
      (imageContainer.scrollHeight - imageContainer.clientHeight);
  }, []);

  // Render document content
  const renderDocumentContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-500">Loading document...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center text-red-600">
            <AlertTriangle className="h-12 w-12 mx-auto mb-2" />
            <p className="font-medium">Failed to load document</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      );
    }

    const imageUrl = document.fileType === 'pdf' 
      ? pdfImages[currentPage - 1] 
      : currentPageData.imageUrl;

    const isPdfFile = imageUrl?.endsWith('.pdf') || imageUrl?.includes('/raw');

    if (isPdfFile) {
      return (
        <div className="h-full w-full">
          <iframe
            src={imageUrl}
            className="w-full h-full border-0"
            style={{ 
              minHeight: mode === 'modal' ? '600px' : '500px',
              width: '100%',
              height: '100%'
            }}
            title={`PDF Document - ${document.fileName}`}
            allow="autoplay; clipboard-read; clipboard-write"
            onLoad={() => {
              console.log('✅ PDF iframe loaded successfully:', imageUrl);
            }}
            onError={() => {
              console.error('❌ PDF iframe failed to load:', imageUrl);
              setError('Failed to load PDF document');
            }}
          />
        </div>
      );
    }

    return (
      <div className="flex justify-center items-center min-h-[500px] p-4 bg-gray-50 dark:bg-gray-800">
        <div 
          className="relative inline-block"
          style={{
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
            transformOrigin: 'center',
            transition: 'transform 0.2s ease-in-out'
          }}
        >
          <img
            ref={imageRef}
            src={imageUrl}
            alt={`${document.fileName} - Page ${currentPage}`}
            className="max-w-full max-h-full w-auto h-auto border rounded-lg shadow-lg bg-white"
            style={{
              maxWidth: zoom > 100 ? 'none' : '100%',
              maxHeight: zoom > 100 ? 'none' : '75vh'
            }}
            onLoad={() => {
              console.log('✅ Image loaded successfully:', imageUrl);
              if (imageRef.current && zoom === 100) {
                const container = imageContainerRef.current;
                if (container) {
                  const containerWidth = container.clientWidth - 32;
                  const containerHeight = container.clientHeight - 32;
                  const imageWidth = imageRef.current.naturalWidth;
                  const imageHeight = imageRef.current.naturalHeight;
                  
                  const scaleX = containerWidth / imageWidth;
                  const scaleY = containerHeight / imageHeight;
                  const scale = Math.min(scaleX, scaleY, 1);
                  
                  if (scale < 1) {
                    setZoom(Math.round(scale * 100));
                  }
                }
              }
            }}
            onError={(e) => {
              console.error('❌ Image failed to load:', imageUrl);
              setError('Failed to load document image');
            }}
          />
          
          {/* Highlight detected text regions */}
          {showHighlights && document.lowConfidenceWords?.map((word, index) => (
            <div
              key={index}
              className="absolute border-2 border-yellow-400 bg-yellow-200/30"
              style={{
                left: `${word.position.x * (zoom / 100)}px`,
                top: `${word.position.y * (zoom / 100)}px`,
                width: `${word.position.width * (zoom / 100)}px`,
                height: `${word.position.height * (zoom / 100)}px`,
              }}
              title={`${word.word} (${Math.round(word.confidence * 100)}% confidence)`}
            />
          ))}
        </div>
      </div>
    );
  };

  const layoutClass = mode === 'fullscreen' ? 'fixed inset-0 z-50 bg-white' : 
                      mode === 'modal' ? 'h-full w-full' : 'h-full';

  return (
    <div className={cn(layoutClass, "flex flex-col h-full")}>
      {/* Header */}
      <div className="border-b p-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {document.fileType === 'pdf' ? (
                <FileText className="h-5 w-5 text-red-500" />
              ) : (
                <ImageIcon className="h-5 w-5 text-blue-500" />
              )}
              <h2 className="text-lg font-semibold">{document.fileName}</h2>
            </div>
            
            <Badge variant="outline">
              Confidence: {Math.round((currentPageData.confidence || 0) * 100)}%
            </Badge>
            
            {document.pageCount && document.pageCount > 1 && (
              <Badge variant="secondary">
                Page {currentPage} of {document.pageCount}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'viewer' | 'text')}>
              <TabsList>
                <TabsTrigger value="viewer">Viewer</TabsTrigger>
                <TabsTrigger value="text">Text</TabsTrigger>
              </TabsList>
            </Tabs>
            
            <Separator orientation="vertical" className="h-6" />
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExportText('txt')}
            >
              <Download className="h-4 w-4 mr-2" />
              TXT
            </Button>
            
            {onExport && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExportText('pdf')}
                >
                  PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExportText('docx')}
                >
                  DOCX
                </Button>
              </>
            )}
            
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'viewer' | 'text')}>
          <TabsContent value="viewer" className="h-full m-0">
            <div className="flex h-full">
              {/* Document Panel */}
              <div className="w-1/2 border-r flex flex-col h-full">
                <div className="border-b p-3 flex items-center justify-between flex-shrink-0">
                  <h3 className="font-medium">Document</h3>
                  
                  <div className="flex items-center gap-2">
                    {/* Page Navigation */}
                    {document.pageCount && document.pageCount > 1 && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handlePrevPage}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm px-2">
                          {currentPage} / {document.pageCount}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleNextPage}
                          disabled={currentPage === document.pageCount}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Separator orientation="vertical" className="h-6 mx-2" />
                      </>
                    )}
                    
                    {/* Zoom Controls */}
                    <Button size="sm" variant="outline" onClick={handleZoomOut} disabled={zoom <= 25}>
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-sm px-2 min-w-[3rem] text-center">{zoom}%</span>
                    <Button size="sm" variant="outline" onClick={handleZoomIn} disabled={zoom >= 400}>
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    
                    <Button size="sm" variant="outline" onClick={handleFitToScreen} title="Fit to screen">
                      Fit
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleZoomReset} title="Reset zoom">
                      100%
                    </Button>
                    
                    <Button size="sm" variant="outline" onClick={handleRotate}>
                      <RotateCw className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowHighlights(!showHighlights)}
                      className={cn(showHighlights && "bg-yellow-100 dark:bg-yellow-900")}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div 
                  className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-800"
                  ref={imageContainerRef}
                  onScroll={handleImageScroll}
                  style={{ 
                    minHeight: mode === 'modal' ? '600px' : '500px',
                    height: '100%'
                  }}
                >
                  {renderDocumentContent()}
                </div>
              </div>

              {/* Text Panel */}
              <div className="w-1/2 flex flex-col h-full">
                <div className="border-b p-3 flex items-center justify-between flex-shrink-0">
                  <h3 className="font-medium">Extracted Text</h3>
                  
                  <div className="flex items-center gap-2">
                    {document.lowConfidenceWords && document.lowConfidenceWords.length > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {document.lowConfidenceWords.length} low confidence words
                      </Badge>
                    )}
                    
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{wordCount} words</span>
                      <span>{lineCount} lines</span>
                      <span>{editedText.length} chars</span>
                    </div>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyText}
                      className="text-xs"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                    
                    {isEditing ? (
                      <>
                        <Button size="sm" variant="outline" onClick={handleDiscardChanges}>
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Discard
                        </Button>
                        <Button size="sm" onClick={handleSaveText}>
                          <Save className="h-4 w-4 mr-2" />
                          Save
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                        <Edit3 className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
                
                <ScrollArea 
                  className="flex-1 p-4"
                  ref={textContainerRef}
                  onScroll={handleTextScroll}
                >
                  {isEditing ? (
                    <Textarea
                      ref={textRef}
                      value={editedText}
                      onChange={(e) => setEditedText(e.target.value)}
                      className="min-h-full resize-none border-none focus:ring-0 font-mono text-sm"
                      placeholder="Extracted text will appear here..."
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none font-mono text-sm whitespace-pre-wrap">
                      {currentPageData.extractedText || 'No text extracted'}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="text" className="h-full m-0">
            <div className="h-full p-6">
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-2 text-base">
                      <Type className="h-4 w-4" />
                      <span>Extracted Text Editor</span>
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {Math.round((currentPageData.confidence || 0) * 100)}% confidence
                    </Badge>
                  </div>
                  
                  <div className="flex items-center space-x-4 text-xs text-gray-500 mt-2">
                    <span>{wordCount} words</span>
                    <span>{lineCount} lines</span>
                    <span>{editedText.length} chars</span>
                  </div>
                </CardHeader>
                
                <CardContent className="flex-1 flex flex-col p-0 h-full">
                  <div className="flex-1 flex flex-col p-6">
                    <Textarea
                      value={editedText}
                      onChange={(e) => {
                        setEditedText(e.target.value);
                        setIsEditing(true);
                      }}
                      placeholder="Extracted text will appear here..."
                      className="flex-1 resize-none font-mono text-sm min-h-[400px] focus:ring-2 focus:ring-blue-500"
                    />
                    
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyText}
                          className="text-xs"
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExportText('txt')}
                          className="text-xs"
                        >
                          <FileDown className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {isEditing && editedText !== currentPageData.extractedText && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleDiscardChanges}
                              className="text-xs"
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Discard
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSaveText}
                              className="text-xs bg-blue-600 hover:bg-blue-700"
                            >
                              <Save className="h-3 w-3 mr-1" />
                              Save
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <div className="border-t p-3 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <div>
            Characters: {(currentPageData.extractedText || '').length} • 
            Words: {(currentPageData.extractedText || '').split(/\s+/).filter(w => w).length}
          </div>
          <div>
            Processing confidence: {Math.round((currentPageData.confidence || 0) * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}
