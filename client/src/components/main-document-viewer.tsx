import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Download, 
  Copy, 
  FileText, 
  Image as ImageIcon, 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  Edit3,
  Save,
  Eye,
  AlertTriangle,
  X,
  FileDown,
  RotateCcw,
  Type,
  Loader2,
  EyeOff,
  ChevronLeft,
  ChevronRight
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
  ocrResult?: {
    metadata?: {
      deepseek_analysis?: {
        applied: boolean;
        originalText?: string;
        analysis?: any;
      };
    };
  };
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
  const [showComparison, setShowComparison] = useState(false);

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
    } else if (document.fileType === 'pdf' && document.id) {
      // Fallback for when documentId is not available but id is
      loadPdfPagesWithId(document.id);
    }
  }, [document.documentId, document.fileType, document.id]);

  // Update edited text when page changes
  useEffect(() => {
    setEditedText(getDisplayText());
  }, [currentPageData.extractedText, currentPage, deepSeekAnalysis]);

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

  const loadPdfPagesWithId = async (docId: string) => {
    try {
      setIsLoading(true);
      setError('');

      const response = await fetch(`/api/documents/${docId}/pages`);

      if (!response.ok) {
        throw new Error(`Failed to load PDF pages: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.images) {
        setPdfImages(data.images);
        console.log(`✅ Loaded ${data.images.length} PDF pages as images`);
      } else {
        const pdfUrl = `/api/documents/${docId}/raw?t=${Date.now()}`;
        setPdfImages([pdfUrl]);
      }
    } catch (error: any) {
      console.error('❌ Failed to load PDF images:', error);
      setError(error.message || 'Failed to load PDF content');

      const pdfUrl = `/api/documents/${docId}/raw?t=${Date.now()}`;
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

  // Function to create highlighted text comparison
  const createHighlightedText = (originalText: string, enhancedText: string) => {
    if (!originalText || !enhancedText) return enhancedText;

    const originalLines = originalText.split('\n');
    const enhancedLines = enhancedText.split('\n');

    return enhancedLines.map((line, index) => {
      const originalLine = originalLines[index] || '';
      const isChanged = line !== originalLine;

      return (
        <div key={index} className={`${isChanged ? 'bg-green-100 border-l-4 border-green-500 pl-2 my-1' : ''}`}>
          {isChanged && (
            <div className="text-xs text-gray-500 mb-1">
              <span className="font-medium">Original:</span> {originalLine || '(empty)'}
            </div>
          )}
          <div className={isChanged ? 'font-medium text-green-800' : ''}>
            {line}
          </div>
        </div>
      );
    });
  };

  // Get DeepSeek analysis data
  const getDeepSeekAnalysis = () => {
    if (!document.ocrResult?.metadata?.deepseek_analysis) return null;
    return document.ocrResult.metadata.deepseek_analysis;
  };

  const deepSeekAnalysis = getDeepSeekAnalysis();

  // Function to render DeepSeek improvements
  const renderDeepSeekImprovements = () => {
    if (!deepSeekAnalysis || !deepSeekAnalysis.improvements || deepSeekAnalysis.improvements.length === 0) {
      return null;
    }

    return (
      <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
          <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">
            DeepSeek AI Improvements Applied
          </h4>
        </div>
        <div className="space-y-2">
          {deepSeekAnalysis.improvements.map((improvement: string, index: number) => (
            <div
              key={index}
              className="flex items-start gap-2 p-2 bg-yellow-100 dark:bg-yellow-800/30 rounded border-l-4 border-yellow-500"
            >
              <div className="w-1.5 h-1.5 bg-yellow-600 rounded-full mt-2 flex-shrink-0"></div>
              <span className="text-sm text-yellow-900 dark:text-yellow-100 font-medium">
                {improvement}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Function to get the display text (prioritize reconstructed text)
  const getDisplayText = () => {
    // If we have DeepSeek analysis with reconstructed text, use that
    if (deepSeekAnalysis && deepSeekAnalysis.reconstructedText) {
      return deepSeekAnalysis.reconstructedText;
    }
    // Otherwise use the original extracted text
    return currentPageData.extractedText || '';
  };

  // Render document content - supports multi-page scrolling
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

    // Handle multi-page PDF documents
    if (document.fileType === 'pdf' && pdfImages && pdfImages.length > 0) {
      const isPdfFile = pdfImages[0]?.endsWith('.pdf') || pdfImages[0]?.includes('/raw');

      if (isPdfFile) {
        // Single PDF file display
        return (
          <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <div className="w-full h-full max-w-full max-h-full">
              <iframe
                src={pdfImages[0]}
                className="w-full h-full border border-gray-300 rounded-lg shadow-lg"
                style={{ 
                  minHeight: mode === 'modal' ? '600px' : '500px',
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'white'
                }}
                title={`PDF Document - ${document.fileName}`}
                allow="autoplay; clipboard-read; clipboard-write; fullscreen"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                onLoad={() => {
                  console.log('✅ PDF iframe loaded successfully:', pdfImages[0]);
                  setError('');
                }}
                onError={() => {
                  console.error('❌ PDF iframe failed to load:', pdfImages[0]);
                  setError('Failed to load PDF document');
                }}
              />
            </div>
          </div>
        );
      }

      // Multi-page PDF as images - show all pages in scrollable view
      return (
        <div className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-800 space-y-6">
          {pdfImages.map((imageUrl, index) => (
            <div 
              key={index}
              className="relative flex flex-col items-center"
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transformOrigin: 'center',
                transition: 'transform 0.2s ease-in-out'
              }}
            >
              {/* Page number indicator */}
              <div className="mb-2 px-3 py-1 bg-blue-600 text-white rounded-full text-sm font-medium">
                Page {index + 1} of {pdfImages.length}
              </div>

              <img
                src={imageUrl}
                alt={`${document.fileName} - Page ${index + 1}`}
                className="max-w-full w-auto border rounded-lg shadow-lg bg-white"
                style={{
                  maxWidth: zoom > 100 ? 'none' : '90%',
                  height: 'auto'
                }}
                onLoad={() => {
                  console.log(`✅ Page ${index + 1} loaded successfully:`, imageUrl);
                }}
                onError={(e) => {
                  console.error(`❌ Page ${index + 1} failed to load:`, imageUrl);
                }}
              />
            </div>
          ))}

          {/* Scroll to top button */}
          <button
            onClick={() => {
              if (imageContainerRef.current) {
                imageContainerRef.current.scrollTop = 0;
              }
            }}
            className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-colors"
            title="Scroll to top"
          >
            <ChevronLeft className="h-5 w-5 rotate-90" />
          </button>
        </div>
      );
    }

    // Single image document
    const imageUrl = currentPageData.imageUrl;

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
                    {/* Page Navigation - shows total pages for PDFs */}
                    {document.pageCount && document.pageCount > 1 && (
                      <>
                        {document.fileType === 'pdf' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm px-2 bg-blue-100 dark:bg-blue-900 rounded">
                              {document.pageCount} pages (scrollable)
                            </span>
                          </div>
                        ) : (
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
                          </>
                        )}
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
                    <div className="space-y-4">
                      {/* Main text content */}
                      <div className="prose prose-sm max-w-none font-mono text-sm whitespace-pre-wrap">
                        {getDisplayText() || 'No text extracted'}
                      </div>

                      {/* DeepSeek improvements display */}
                      {renderDeepSeekImprovements()}

                      {/* Show confidence for reconstructed text */}
                      {deepSeekAnalysis && deepSeekAnalysis.reconstructedText && (
                        <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs">
                          <span className="text-green-700 dark:text-green-300">
                            ✅ Text enhanced by DeepSeek AI • Confidence: {Math.round(deepSeekAnalysis.confidence * 100)}%
                          </span>
                        </div>
                      )}
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
                  <div className="flex-1 flex flex-col p-6 space-y-4">
                    {/* Main text editor */}
                    <Textarea
                      value={editedText}
                      onChange={(e) => {
                        setEditedText(e.target.value);
                        setIsEditing(true);
                      }}
                      placeholder="Extracted text will appear here..."
                      className="flex-1 resize-none font-mono text-sm min-h-[300px] focus:ring-2 focus:ring-blue-500"
                    />

                    {/* DeepSeek improvements display */}
                    {renderDeepSeekImprovements()}

                    {/* Show confidence indicator */}
                    {deepSeekAnalysis && deepSeekAnalysis.reconstructedText && (
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <div className="flex items-center gap-2 text-sm">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-green-700 dark:text-green-300 font-medium">
                            Enhanced by DeepSeek AI
                          </span>
                          <Badge variant="outline" className="ml-auto">
                            {Math.round(deepSeekAnalysis.confidence * 100)}% confidence
                          </Badge>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="flex flex-wrap gap-2">
              <Button onClick={handleCopyText} variant="outline" size="sm" className="flex-1 sm:flex-none">
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
              <Button onClick={() => handleExportText('txt')} variant="outline" size="sm" className="flex-1 sm:flex-none">
                <FileDown className="h-3 w-3 mr-1" />
                Export
              </Button>
              {deepSeekAnalysis && deepSeekAnalysis.originalText && (
                <Button 
                  onClick={() => setShowComparison(!showComparison)} 
                  variant={showComparison ? "default" : "outline"} 
                  size="sm" 
                  className="flex-1 sm:flex-none"
                >
                  {showComparison ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                  {showComparison ? 'Hide Changes' : 'Show AI Edits'}
                </Button>
              )}
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
            Characters: {getDisplayText().length} • 
            Words: {getDisplayText().split(/\s+/).filter(w => w).length}
            {deepSeekAnalysis && deepSeekAnalysis.improvements && (
              <span className="ml-2 text-yellow-600 dark:text-yellow-400">
                • {deepSeekAnalysis.improvements.length} AI improvements
              </span>
            )}
          </div>
          <div>
            {deepSeekAnalysis && deepSeekAnalysis.reconstructedText ? (
              <span className="text-green-600 dark:text-green-400">
                DeepSeek confidence: {Math.round((deepSeekAnalysis.confidence || 0) * 100)}%
              </span>
            ) : (
              <span>
                OCR confidence: {Math.round((currentPageData.confidence || 0) * 100)}%
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}