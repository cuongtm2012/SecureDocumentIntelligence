import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Image as ImageIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OCRResult {
  id: string;
  fileName: string;
  fileType: 'image' | 'pdf';
  extractedText: string;
  confidence: number;
  pageCount?: number;
  currentPage?: number;
  imageUrl: string;
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

interface EnhancedOCRViewerProps {
  result: OCRResult;
  onTextEdit: (resultId: string, newText: string, pageNumber?: number) => void;
  onExport: (resultId: string, format: 'txt' | 'pdf' | 'docx') => void;
  onClose: () => void;
}

export function EnhancedOCRViewer({
  result,
  onTextEdit,
  onExport,
  onClose
}: EnhancedOCRViewerProps) {
  // Debug log to check data structure
  console.log('EnhancedOCRViewer received result:', result);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [showHighlights, setShowHighlights] = useState(true);
  
  const imageRef = useRef<HTMLImageElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);

  const currentPageData = result.pages?.[currentPage - 1] || {
    pageNumber: 1,
    imageUrl: result.imageUrl || '',
    extractedText: result.extractedText || '',
    confidence: result.confidence || 0
  };

  useEffect(() => {
    setEditedText(currentPageData.extractedText || '');
  }, [currentPageData.extractedText, currentPage]);

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

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 400));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 25));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const handleSaveText = () => {
    onTextEdit(result.id, editedText, currentPage);
    setIsEditing(false);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= (result.pageCount || 1)) {
      setCurrentPage(newPage);
    }
  };

  const highlightLowConfidenceWords = (text: string) => {
    if (!showHighlights || !result.lowConfidenceWords) return text;

    let highlightedText = text;
    result.lowConfidenceWords.forEach(word => {
      if (word.confidence < 0.7) {
        const regex = new RegExp(`\\b${word.word}\\b`, 'gi');
        highlightedText = highlightedText.replace(
          regex, 
          `<span class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded" title="Low confidence: ${Math.round(word.confidence * 100)}%">${word.word}</span>`
        );
      }
    });

    return highlightedText;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {result.fileType === 'pdf' ? (
                <FileText className="h-5 w-5 text-red-500" />
              ) : (
                <ImageIcon className="h-5 w-5 text-blue-500" />
              )}
              <h2 className="text-lg font-semibold">{result.fileName}</h2>
            </div>
            
            <Badge variant="outline">
              Confidence: {Math.round((currentPageData.confidence || 0) * 100)}%
            </Badge>
            
            {result.pageCount && result.pageCount > 1 && (
              <Badge variant="secondary">
                Page {currentPage} of {result.pageCount}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Export Options */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onExport(result.id, 'txt')}
            >
              <Download className="h-4 w-4 mr-2" />
              TXT
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onExport(result.id, 'pdf')}
            >
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onExport(result.id, 'docx')}
            >
              <Download className="h-4 w-4 mr-2" />
              DOCX
            </Button>
            
            <Button size="sm" variant="ghost" onClick={onClose}>
              ×
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Left Panel - Image */}
        <div className="w-1/2 border-r flex flex-col">
          <div className="border-b p-3 flex items-center justify-between">
            <h3 className="font-medium">Original Document</h3>
            
            <div className="flex items-center gap-2">
              {/* Page Navigation for PDFs */}
              {result.pageCount && result.pageCount > 1 && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-2">
                    {currentPage} / {result.pageCount}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === result.pageCount}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Separator orientation="vertical" className="h-6 mx-2" />
                </>
              )}
              
              {/* Zoom Controls */}
              <Button size="sm" variant="outline" onClick={handleZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm px-2">{zoom}%</span>
              <Button size="sm" variant="outline" onClick={handleZoomIn}>
                <ZoomIn className="h-4 w-4" />
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
          
          <ScrollArea 
            className="flex-1"
            ref={imageContainerRef}
            onScroll={handleImageScroll}
          >
            <div className="p-4 flex justify-center">
              <div 
                className="relative inline-block"
                style={{
                  transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                  transformOrigin: 'center'
                }}
              >
                <img
                  ref={imageRef}
                  src={currentPageData.imageUrl}
                  alt={`${result.fileName} - Page ${currentPage}`}
                  className="max-w-none border rounded-lg shadow-lg"
                />
                
                {/* Highlight detected text regions */}
                {showHighlights && result.lowConfidenceWords?.map((word, index) => (
                  <div
                    key={index}
                    className="absolute border-2 border-yellow-400 bg-yellow-200/30"
                    style={{
                      left: `${word.position.x}px`,
                      top: `${word.position.y}px`,
                      width: `${word.position.width}px`,
                      height: `${word.position.height}px`,
                    }}
                    title={`${word.word} (${Math.round(word.confidence * 100)}% confidence)`}
                  />
                ))}
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Right Panel - Text */}
        <div className="w-1/2 flex flex-col">
          <div className="border-b p-3 flex items-center justify-between">
            <h3 className="font-medium">Extracted Text</h3>
            
            <div className="flex items-center gap-2">
              {result.lowConfidenceWords && result.lowConfidenceWords.length > 0 && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {result.lowConfidenceWords.length} low confidence words
                </Badge>
              )}
              
              {isEditing ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
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
              <div 
                className="prose prose-sm max-w-none font-mono text-sm whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ 
                  __html: highlightLowConfidenceWords(currentPageData.extractedText || '') 
                }}
              />
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t p-3 bg-gray-50 dark:bg-gray-900">
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
