import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { 
  X,
  FileText,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  Copy,
  Edit,
  Save,
  RefreshCw
} from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import * as pdfjsLib from 'pdfjs-dist';
import { configurePDFJSWorker } from '@/lib/pdf-worker-config';

interface DashboardPDFViewerProps {
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
  onTextEdit: (fileId: string, newText: string) => void;
  onExport: (fileId: string, format: 'txt' | 'pdf' | 'docx') => void;
  onClose: () => void;
}

export function DashboardPDFViewer({ 
  file, 
  documentId, 
  onTextEdit, 
  onExport, 
  onClose 
}: DashboardPDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  
  // PDF rendering state
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderTask, setRenderTask] = useState<pdfjsLib.RenderTask | null>(null);
  
  // Text editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  
  // Extract current text and confidence
  const extractedText = file.result?.extractedText || '';
  const confidence = file.result?.confidence || 0;

  // Initialize PDF.js worker
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Use the CDN worker URL as fallback to ensure it loads properly
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      console.log('✅ PDF.js worker initialized for dashboard with CDN fallback');
    }
  }, []);

  // Initialize text editing
  useEffect(() => {
    setEditedText(extractedText);
  }, [extractedText]);

  // Load PDF document from server
  const loadPDF = useCallback(async () => {
    if (file.type !== 'pdf') {
      console.log('📷 File is not PDF, skipping PDF loading');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🚀 Loading PDF from server for document ID:', documentId);
      
      // Cancel any existing render task
      if (renderTask) {
        renderTask.cancel();
        setRenderTask(null);
      }

      // Clean up previous document
      if (pdfDocument) {
        pdfDocument.destroy();
      }

      // Create PDF URL from document ID
      const pdfUrl = `/api/documents/${documentId}/raw?t=${Date.now()}`;
      console.log('📄 PDF URL:', pdfUrl);

      // Test if the URL is accessible
      const response = await fetch(pdfUrl, { method: 'HEAD' });
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        isEvalSupported: false,
        useSystemFonts: true
      });

      const pdf = await loadingTask.promise;
      console.log(`✅ PDF loaded: ${pdf.numPages} pages`);

      setPdfDocument(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
      setScale(1.0);
      setRotation(0);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('❌ PDF loading failed:', errorMessage);
      setError(`Failed to load PDF: ${errorMessage}`);
      
      toast({
        title: "PDF Loading Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [file.type, documentId, renderTask, pdfDocument, toast]);

  // Render PDF page
  const renderPage = useCallback(async (pageNumber: number) => {
    if (!pdfDocument || !canvasRef.current) {
      console.warn('⚠️ Cannot render: missing PDF document or canvas');
      return;
    }

    // Cancel previous render task
    if (renderTask) {
      renderTask.cancel();
    }

    try {
      console.log(`🎨 Rendering page ${pageNumber}...`);

      const page = await pdfDocument.getPage(pageNumber);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Cannot get 2D context from canvas');
      }

      // Clear canvas
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Calculate viewport
      const viewport = page.getViewport({ 
        scale: scale,
        rotation: rotation 
      });

      // Set canvas dimensions
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Set CSS dimensions for proper display
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      console.log(`📐 Canvas dimensions: ${canvas.width}x${canvas.height}, scale: ${scale}`);

      // Start rendering
      const newRenderTask = page.render({
        canvasContext: context,
        viewport: viewport
      });

      setRenderTask(newRenderTask);
      await newRenderTask.promise;
      
      console.log(`✅ Page ${pageNumber} rendered successfully`);
      setError(null);

    } catch (err) {
      if (err instanceof Error && err.name !== 'RenderingCancelledException') {
        const errorMessage = err.message;
        console.error(`❌ Render error:`, errorMessage);
        setError(`Failed to render page: ${errorMessage}`);
      }
    }
  }, [pdfDocument, scale, rotation, renderTask]);

  // Auto-load PDF on mount
  useEffect(() => {
    loadPDF();
  }, [loadPDF]);

  // Auto-render when page changes
  useEffect(() => {
    if (pdfDocument && currentPage) {
      renderPage(currentPage);
    }
  }, [pdfDocument, currentPage, renderPage]);

  // Navigation handlers
  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Zoom handlers
  const zoomIn = () => {
    setScale(prev => Math.min(prev * 1.2, 3.0));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(prev / 1.2, 0.3));
  };

  const resetZoom = () => {
    setScale(1.0);
  };

  // Rotation handler
  const rotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  // Text editing handlers
  const handleStartEdit = () => {
    setIsEditing(true);
    setEditedText(extractedText);
  };

  const handleSaveEdit = () => {
    onTextEdit(file.id, editedText);
    setIsEditing(false);
    toast({
      title: "Text updated",
      description: "OCR text has been saved successfully.",
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedText(extractedText);
  };

  // Copy text to clipboard
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(extractedText);
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

  // Export handlers
  const handleExport = (format: 'txt' | 'pdf' | 'docx') => {
    onExport(file.id, format);
    toast({
      title: `Export ${format.toUpperCase()} started`,
      description: "Your file will be downloaded shortly.",
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (renderTask) {
        renderTask.cancel();
      }
      if (pdfDocument) {
        pdfDocument.destroy();
      }
    };
  }, [renderTask, pdfDocument]);
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {file.type === 'pdf' ? (
              <FileText className="h-5 w-5 text-red-600" />
            ) : (
              <ImageIcon className="h-5 w-5 text-blue-600" />
            )}
            <span className="text-sm text-gray-600">{file.name}</span>
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
            
            <Badge variant="outline" className="text-xs">
              Doc ID: {documentId}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
          <div className="w-1/2 border-r flex flex-col">
            <div className="p-3 border-b bg-gray-50 dark:bg-gray-700">
              <h3 className="font-medium">
                {file.type === 'pdf' ? 'PDF Document' : 'Image Document'}
              </h3>
            </div>

            {/* Document Display Area */}
            <div className="flex-1 overflow-hidden">
              {file.type === 'pdf' ? (
                // PDF Viewer
                <div className="h-full flex flex-col">
                  {/* PDF Controls */}
                  {pdfDocument && (
                    <div className="flex items-center justify-between p-3 border-b bg-gray-50">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={goToPrevPage}
                          disabled={currentPage <= 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        
                        <Badge variant="outline">
                          {currentPage} / {totalPages}
                        </Badge>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={goToNextPage}
                          disabled={currentPage >= totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={zoomOut}>
                          <ZoomOut className="h-4 w-4" />
                        </Button>
                        
                        <Button variant="outline" size="sm" onClick={resetZoom}>
                          {Math.round(scale * 100)}%
                        </Button>
                        
                        <Button variant="outline" size="sm" onClick={zoomIn}>
                          <ZoomIn className="h-4 w-4" />
                        </Button>
                        
                        <Button variant="outline" size="sm" onClick={rotate}>
                          <RotateCw className="h-4 w-4" />
                        </Button>
                        
                        <Button variant="outline" size="sm" onClick={loadPDF}>
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* PDF Canvas Area */}
                  <div className="flex-1 overflow-auto bg-gray-100 p-4 flex justify-center items-center">
                    {loading && (
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-sm text-gray-600">Loading PDF...</p>
                      </div>
                    )}

                    {error && (
                      <Alert variant="destructive" className="max-w-md">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    {pdfDocument && !loading && !error && (
                      <canvas
                        ref={canvasRef}
                        className="border border-gray-400 bg-white shadow-lg max-w-full max-h-full"
                        style={{
                          maxWidth: '100%',
                          height: 'auto'
                        }}
                      />
                    )}

                    {!pdfDocument && !loading && !error && (
                      <div className="text-center text-gray-500">
                        <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <p>PDF loading...</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // Image Viewer
                <div className="h-full overflow-auto bg-gray-100 p-4 flex justify-center items-center">
                  <img
                    src={`/api/documents/${documentId}/image?t=${Date.now()}`}
                    alt={file.name}
                    className="max-w-full max-h-full border border-gray-300 rounded-lg shadow-lg"
                    onError={(e) => {
                      console.error('🖼️ Image load error:', e);
                      setError('Failed to load image');
                    }}
                  />
                </div>
              )}
            </div>
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
              <div className="p-4 h-full">
                {!isEditing ? (
                  <div className="prose max-w-none">
                    {extractedText ? (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed break-words min-h-0">
                        {extractedText}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-64 text-center">
                        <FileText className="h-12 w-12 text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium text-gray-600 mb-2">No OCR Text Available</h3>
                        <p className="text-sm text-gray-500">
                          The document needs to be processed to extract text content.
                        </p>
                      </div>
                    )}
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
    );
}
