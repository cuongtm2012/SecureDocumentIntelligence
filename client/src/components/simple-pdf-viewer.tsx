import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Download,
  FileText,
  X,
  Loader2,
  Copy,
  Save,
  Edit3,
  Eye,
  RotateCcw,
  Type,
  FileDown
} from 'lucide-react';

interface SimplePDFViewerProps {
  documentId: number;
  fileName: string;
  extractedText: string;
  confidence: number;
  onClose: () => void;
  onTextEdit?: (newText: string) => void;
  onExport?: (format: string) => void;
}

export function SimplePDFViewer({
  documentId,
  fileName,
  extractedText,
  confidence,
  onClose,
  onTextEdit,
  onExport
}: SimplePDFViewerProps) {
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [editedText, setEditedText] = useState(extractedText);
  const [isLoading, setIsLoading] = useState(true);
  const [pdfImages, setPdfImages] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [lineCount, setLineCount] = useState(0);

  // Load PDF as images from the server
  useEffect(() => {
    const loadPdfImages = async () => {
      try {
        setIsLoading(true);
        setError('');

        // Request PDF pages as images from the server
        const response = await fetch(`/api/documents/${documentId}/pages`);
        
        if (!response.ok) {
          throw new Error(`Failed to load PDF pages: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.images) {
          setPdfImages(data.images);
          setTotalPages(data.images.length);
          console.log(`✅ Loaded ${data.images.length} PDF pages as images`);
        } else {
          // Fallback: show the raw PDF in an iframe
          const pdfUrl = `/api/documents/${documentId}/raw?t=${Date.now()}`;
          setPdfImages([pdfUrl]);
          setTotalPages(1);
          console.log('📄 Falling back to direct PDF display');
        }
      } catch (error: any) {
        console.error('❌ Failed to load PDF images:', error);
        setError(error.message || 'Failed to load PDF content');
        
        // Ultimate fallback: try to show the raw PDF
        const pdfUrl = `/api/documents/${documentId}/raw?t=${Date.now()}`;
        setPdfImages([pdfUrl]);
        setTotalPages(1);
      } finally {
        setIsLoading(false);
      }
    };

    loadPdfImages();
  }, [documentId]);

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1));
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(200, prev + 25));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(50, prev - 25));
  };

  // Text statistics calculator
  useEffect(() => {
    const words = editedText.trim().split(/\s+/).filter(word => word.length > 0);
    const lines = editedText.split('\n').length;
    setWordCount(words.length);
    setLineCount(lines);
  }, [editedText]);

  const handleTextSave = () => {
    if (onTextEdit && editedText !== extractedText) {
      onTextEdit(editedText);
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

  const handleExportText = () => {
    const blob = new Blob([editedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}_extracted_text.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Text exported successfully" });
  };

  const handleDiscardChanges = () => {
    setEditedText(extractedText);
    setIsEditing(false);
    toast({ title: "Changes discarded" });
  };

  const renderPdfContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-500">Loading PDF content...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center text-red-600">
            <FileText className="h-12 w-12 mx-auto mb-2" />
            <p className="font-medium">Failed to load PDF</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      );
    }

    const currentImage = pdfImages[currentPage - 1];
    const isPdfFile = currentImage?.endsWith('.pdf') || currentImage?.includes('/raw');

    if (isPdfFile) {
      // Show raw PDF in iframe as fallback
      return (
        <div className="h-full w-full">
          <iframe
            src={currentImage}
            className="w-full h-full border-0"
            style={{ minHeight: '600px' }}
            title={`PDF Document - ${fileName}`}
            allow="autoplay; clipboard-read; clipboard-write"
          />
        </div>
      );
    }

    // Show image pages
    return (
      <div className="flex items-center justify-center h-full">
        <img
          src={currentImage}
          alt={`Page ${currentPage} of ${fileName}`}
          style={{ 
            transform: `scale(${zoom / 100})`,
            maxWidth: '100%',
            maxHeight: '100%'
          }}
          className="border border-gray-200 shadow-lg"
        />
      </div>
    );
  };

  return (
    <div className="flex h-full max-h-[95vh]">
      {/* PDF Viewer Panel */}
      <div className="flex-1 flex flex-col">
        {/* Header Controls */}
        <div className="flex items-center justify-between p-4 border-b bg-white">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold truncate">{fileName}</h3>
            <Badge variant={confidence > 80 ? "default" : confidence > 60 ? "secondary" : "destructive"}>
              {confidence.toFixed(1)}% confidence
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoom <= 50}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm min-w-[60px] text-center">{zoom}%</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoom >= 200}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm min-w-[80px] text-center">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* PDF Content */}
        <div className="flex-1 overflow-auto bg-gray-50">
          {renderPdfContent()}
        </div>
      </div>

      {/* Enhanced Text Editor Panel */}
      <div className="w-96 border-l bg-white dark:bg-gray-900 flex flex-col">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2 text-base">
              <Edit3 className="h-4 w-4" />
              <span>Extracted Text</span>
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {confidence}% confidence
            </Badge>
          </div>
          
          {/* Text Statistics */}
          <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>{wordCount} words</span>
            <span>{lineCount} lines</span>
            <span>{editedText.length} chars</span>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col p-0">
          <Tabs defaultValue="editor" className="h-full flex flex-col">
            <TabsList className="mx-4 mt-4">
              <TabsTrigger value="editor" className="text-xs">
                <Type className="h-3 w-3 mr-1" />
                Editor
              </TabsTrigger>
              <TabsTrigger value="preview" className="text-xs">
                <Eye className="h-3 w-3 mr-1" />
                Preview
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="editor" className="flex-1 m-4 mt-2">
              <div className="h-full flex flex-col">
                <Textarea
                  value={editedText}
                  onChange={(e) => {
                    setEditedText(e.target.value);
                    setIsEditing(true);
                  }}
                  placeholder="Extracted text will appear here..."
                  className="flex-1 resize-none font-mono text-sm min-h-[350px] focus:ring-2 focus:ring-blue-500"
                />
                
                {/* Editor Controls */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
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
                      onClick={handleExportText}
                      className="text-xs"
                    >
                      <FileDown className="h-3 w-3 mr-1" />
                      Export
                    </Button>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {isEditing && editedText !== extractedText && (
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
                          onClick={handleTextSave}
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
            </TabsContent>
            
            <TabsContent value="preview" className="flex-1 m-4 mt-2">
              <ScrollArea className="h-full border rounded-md">
                <div className="p-4 prose prose-sm dark:prose-invert max-w-none">
                  {editedText ? (
                    <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
                      {editedText}
                    </pre>
                  ) : (
                    <div className="text-center text-gray-500 italic">
                      No text extracted yet
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </div>
    </div>
  );
}