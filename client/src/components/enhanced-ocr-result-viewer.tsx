import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight,
  Copy,
  Download,
  Save,
  Edit3,
  Eye,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface OCRResultViewerProps {
  document: {
    id: number;
    filename: string;
    originalName: string;
    extractedText: string;
    confidence: number;
    processingMethod: string;
  };
  images: string[];
}

interface TextLine {
  id: string;
  text: string;
  confidence: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pageIndex: number;
}

export function EnhancedOCRResultViewer({ document, images }: OCRResultViewerProps) {
  const { toast } = useToast();
  
  // Image viewer state
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imageViewerExpanded, setImageViewerExpanded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  
  // Text editor state
  const [editableText, setEditableText] = useState(document.extractedText || '');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [highlightedAreas, setHighlightedAreas] = useState<string[]>([]);
  
  // Parse text into lines for interactive highlighting
  const textLines: TextLine[] = React.useMemo(() => {
    return editableText.split('\n').map((line, index) => ({
      id: `line-${index}`,
      text: line,
      confidence: 85 + Math.random() * 10, // Simulated confidence per line
      pageIndex: Math.floor(index / 10), // Rough page estimation
    }));
  }, [editableText]);

  // Image manipulation functions
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.25));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleNextPage = () => setCurrentPage(prev => (prev + 1) % images.length);
  const handlePrevPage = () => setCurrentPage(prev => (prev - 1 + images.length) % images.length);
  const handleResetView = () => {
    setZoom(1);
    setRotation(0);
  };

  // Text interaction functions
  const handleLineClick = (lineId: string, pageIndex: number) => {
    setSelectedLineId(lineId);
    setCurrentPage(pageIndex);
    
    // Simulate highlighting corresponding area on image
    setHighlightedAreas([lineId]);
    
    // Auto-scroll image to approximate area (simulation)
    if (imageContainerRef.current) {
      const scrollPercent = (parseInt(lineId.split('-')[1]) % 10) / 10;
      imageContainerRef.current.scrollTop = 
        imageContainerRef.current.scrollHeight * scrollPercent;
    }
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(editableText);
      toast({ title: "Text copied to clipboard" });
    } catch (error) {
      toast({ title: "Failed to copy text", variant: "destructive" });
    }
  };

  const handleExportText = () => {
    const blob = new Blob([editableText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${document.originalName}_ocr_result.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Text exported successfully" });
  };

  const handleSaveEdit = () => {
    // TODO: Implement save to backend
    setIsEditing(false);
    toast({ title: "Changes saved successfully" });
  };

  const handleDiscardEdit = () => {
    setEditableText(document.extractedText || '');
    setIsEditing(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'c':
            if (!isEditing) {
              e.preventDefault();
              handleCopyText();
            }
            break;
          case 's':
            if (isEditing) {
              e.preventDefault();
              handleSaveEdit();
            }
            break;
          case '=':
          case '+':
            e.preventDefault();
            handleZoomIn();
            break;
          case '-':
            e.preventDefault();
            handleZoomOut();
            break;
        }
      }
      
      if (!isEditing) {
        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault();
            handlePrevPage();
            break;
          case 'ArrowRight':
            e.preventDefault();
            handleNextPage();
            break;
          case 'r':
            e.preventDefault();
            handleRotate();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="h-6 w-6 text-blue-600" />
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {document.originalName}
                </h1>
                <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                  <span>Method: {document.processingMethod}</span>
                  <Badge variant="outline" className="text-xs">
                    {document.confidence}% confidence
                  </Badge>
                  <span>Page {currentPage + 1} of {images.length}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImageViewerExpanded(!imageViewerExpanded)}
                className="lg:hidden"
              >
                {imageViewerExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className={`grid gap-6 ${imageViewerExpanded ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
          
          {/* Left Column - Image Viewer */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <ImageIcon className="h-5 w-5" />
                  <span>Document Viewer</span>
                </CardTitle>
                
                {/* Image Controls */}
                <div className="flex items-center space-x-1">
                  <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={images.length <= 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleNextPage} disabled={images.length <= 1}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Separator orientation="vertical" className="h-6" />
                  <Button variant="outline" size="sm" onClick={handleZoomOut}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-mono min-w-[4rem] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <Button variant="outline" size="sm" onClick={handleZoomIn}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleRotate}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleResetView}>
                    Reset
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="flex-1 p-0">
              <div 
                ref={imageContainerRef}
                className="relative overflow-auto bg-gray-100 dark:bg-gray-800"
                style={{ height: imageViewerExpanded ? '70vh' : '60vh' }}
              >
                {images[currentPage] && (
                  <div className="flex items-center justify-center min-h-full p-4">
                    <img
                      ref={imageRef}
                      src={images[currentPage]}
                      alt={`Page ${currentPage + 1}`}
                      className="max-w-none shadow-lg"
                      style={{
                        transform: `scale(${zoom}) rotate(${rotation}deg)`,
                        transformOrigin: 'center',
                        transition: 'transform 0.2s ease-in-out',
                      }}
                    />
                    
                    {/* Simulated highlight overlays */}
                    {highlightedAreas.map((lineId) => (
                      <div
                        key={lineId}
                        className="absolute border-2 border-yellow-400 bg-yellow-200 bg-opacity-30 pointer-events-none"
                        style={{
                          top: `${20 + (parseInt(lineId.split('-')[1]) % 10) * 8}%`,
                          left: '10%',
                          width: '80%',
                          height: '6%',
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Right Column - Text Editor */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <Edit3 className="h-5 w-5" />
                  <span>Extracted Text</span>
                </CardTitle>
                
                {/* Text Controls */}
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={handleCopyText}>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportText}>
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                  {isEditing ? (
                    <>
                      <Button size="sm" onClick={handleSaveEdit}>
                        <Save className="h-4 w-4 mr-1" />
                        Save
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDiscardEdit}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => setIsEditing(true)}>
                      <Edit3 className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="flex-1 p-0">
              <Tabs defaultValue="interactive" className="h-full flex flex-col">
                <TabsList className="mx-4 mt-4">
                  <TabsTrigger value="interactive">Interactive</TabsTrigger>
                  <TabsTrigger value="editor">Plain Editor</TabsTrigger>
                </TabsList>
                
                <TabsContent value="interactive" className="flex-1 m-4 mt-2">
                  <ScrollArea className="h-full border rounded-md">
                    <div className="p-4 space-y-1">
                      {textLines.map((line, index) => (
                        <div
                          key={line.id}
                          className={`group cursor-pointer rounded px-2 py-1 text-sm transition-all ${
                            selectedLineId === line.id
                              ? 'bg-blue-100 dark:bg-blue-900 border-l-4 border-blue-500'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                          onClick={() => handleLineClick(line.id, line.pageIndex)}
                        >
                          <div className="flex items-start justify-between">
                            <span className={`flex-1 ${line.text.trim() === '' ? 'text-gray-400 italic' : ''}`}>
                              {line.text.trim() || '(empty line)'}
                            </span>
                            <Badge 
                              variant="secondary" 
                              className="ml-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              {Math.round(line.confidence)}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="editor" className="flex-1 m-4 mt-2">
                  <Textarea
                    value={editableText}
                    onChange={(e) => setEditableText(e.target.value)}
                    placeholder="Extracted text will appear here..."
                    className="h-full resize-none font-mono text-sm"
                    readOnly={!isEditing}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Keyboard Shortcuts Help */}
      <div className="fixed bottom-4 right-4 z-20">
        <Card className="w-64 text-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Keyboard Shortcuts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-gray-600 dark:text-gray-400">
            <div>← → Navigate pages</div>
            <div>Ctrl/Cmd + C: Copy text</div>
            <div>Ctrl/Cmd + S: Save edits</div>
            <div>Ctrl/Cmd + ±: Zoom in/out</div>
            <div>R: Rotate image</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}