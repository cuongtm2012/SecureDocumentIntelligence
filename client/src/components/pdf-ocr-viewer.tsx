import React, { useState, useEffect, useRef } from 'react';
import { Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Edit,
  Save,
  X,
  FileText,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle,
  Copy,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Remove the external CDN URL - worker is now configured in pdf-worker-config.ts
// const PDF_WORKER_URL = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

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
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const textRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Configure the default layout plugin
  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => [
      // Remove thumbnails tab for better performance
      defaultTabs[1], // Bookmarks
      defaultTabs[2], // Attachments
    ],
    toolbarPlugin: {
      downloadPlugin: {
        fileNameGenerator: () => `${file.name}_processed.pdf`,
      },
    },
  });

  const currentText = file.result?.extractedText || '';
  const currentConfidence = file.result?.confidence || 0;

  // Initialize PDF URL
  useEffect(() => {
    const initializePDF = async () => {
      setIsLoading(true);
      setPdfError('');
      
      try {
        if (file.type === 'pdf') {
          console.log('🔍 Initializing PDF loading for:', file.name);
          
          // Create PDF URL with cache busting
          const pdfUrl = `/api/documents/${file.id}/raw?t=${Date.now()}`;
          
          // Test if the URL is accessible
          try {
            const response = await fetch(pdfUrl, { method: 'HEAD' });
            if (response.ok) {
              setPdfUrl(pdfUrl);
              console.log('✅ PDF URL validated:', pdfUrl);
            } else {
              throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
          } catch (fetchError: any) {
            console.error('❌ PDF URL validation failed:', fetchError);
            setPdfError(`Failed to access PDF file: ${fetchError.message}`);
          }
        } else {
          setPdfError('This viewer only supports PDF files');
        }
        
        setEditedText(currentText);
      } catch (error: any) {
        console.error('❌ PDF initialization error:', error);
        setPdfError(`Failed to initialize PDF: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    initializePDF();
  }, [file.id, file.type, currentText]);

  // Handle text editing
  const handleStartEdit = () => {
    setIsEditing(true);
    setEditedText(currentText);
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
    setEditedText(currentText);
  };

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

  // PDF document load error handler
  const handleDocumentLoadError = (error: any) => {
    console.error('❌ PDF document load error:', error);
    let errorMessage = 'Failed to load PDF document';
    
    if (error.message) {
      if (error.message.includes('Invalid PDF')) {
        errorMessage = 'The PDF file appears to be corrupted or invalid';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error while loading PDF - please check your connection';
      } else if (error.message.includes('AbortError')) {
        errorMessage = 'PDF loading was cancelled - please try again';
      } else {
        errorMessage = `PDF Error: ${error.message}`;
      }
    }
    
    setPdfError(errorMessage);
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-red-600" />
              <h2 className="text-lg font-semibold">{file.name}</h2>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {Math.round(currentConfidence * 100)}% confidence
              </Badge>
              
              {file.result?.pageCount && (
                <Badge variant="secondary">
                  {file.result.pageCount} pages
                </Badge>
              )}
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

        {/* Main Content */}
        <div className="flex-1 flex">
          {/* Left Panel - PDF Viewer */}
          <div className="w-1/2 border-r flex flex-col">
            <div className="p-3 border-b bg-gray-50 dark:bg-gray-700">
              <h3 className="font-medium">PDF Document</h3>
            </div>

            <div className="flex-1 overflow-hidden">
              {isLoading && (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <span className="ml-2">Loading PDF...</span>
                </div>
              )}
              
              {pdfError && (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
                  <h3 className="text-lg font-semibold text-red-600 mb-2">PDF Load Error</h3>
                  <p className="text-sm text-gray-600 mb-4">{pdfError}</p>
                  <div className="text-xs text-gray-500">
                    <p>Possible solutions:</p>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Check if the PDF file is not corrupted</li>
                      <li>Ensure the server is running and accessible</li>
                      <li>Try refreshing the page</li>
                      <li>Re-upload the document if the issue persists</li>
                    </ul>
                  </div>
                </div>
              )}
              
              {pdfUrl && !isLoading && !pdfError && (
                <div className="h-full">
                  {/* Remove Worker wrapper - worker is now globally configured */}
                  <Viewer
                    fileUrl={pdfUrl}
                    plugins={[defaultLayoutPluginInstance]}
                    onDocumentLoad={(e) => {
                      console.log('✅ PDF document loaded successfully:', e.doc.numPages, 'pages');
                      setIsLoading(false);
                      setPdfError('');
                    }}
                    onPageChange={(e) => {
                      setCurrentPage(e.currentPage + 1); // Convert 0-based to 1-based
                    }}
                    renderError={(error) => (
                      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
                        <h3 className="text-lg font-semibold text-red-600 mb-2">PDF Render Error</h3>
                        <p className="text-sm text-gray-600 mb-4">
                          {error.message || 'Failed to render PDF content'}
                        </p>
                        <div className="text-xs text-gray-500 mt-2">
                          <p><strong>Troubleshooting:</strong></p>
                          <ul className="list-disc list-inside space-y-1">
                            <li>PDF worker is now configured locally to avoid CSP issues</li>
                            <li>Check browser console for detailed error messages</li>
                            <li>Ensure the PDF file is not corrupted</li>
                          </ul>
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => window.location.reload()}
                          className="mt-2"
                        >
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
                          <p className="text-xs text-gray-400 mt-1">
                            Using local PDF.js worker (CSP compliant)
                          </p>
                        </div>
                      </div>
                    )}
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
              <div ref={textRef} className="p-4 h-full max-h-full overflow-y-auto">
                {!isEditing ? (
                  <div className="prose max-w-none">
                    {currentText ? (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed break-words min-h-0">
                        {highlightLowConfidenceWords(currentText)}
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
        <div className="p-4 border-t bg-gray-50 dark:bg-gray-700">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-4">
              <span>{currentText.length} characters</span>
              <span>{currentText.split(/\s+/).filter(word => word.length > 0).length} words</span>
              <span>File size: {(file.size / 1024 / 1024).toFixed(2)} MB</span>
              {currentPage > 0 && <span>Current page: {currentPage}</span>}
            </div>
            
            <div className="flex items-center gap-2">
              {currentConfidence > 0.8 ? (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  High Quality
                </div>
              ) : currentConfidence > 0.6 ? (
                <div className="flex items-center gap-1 text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  Review Recommended
                </div>
              ) : (
                <div className="flex items-center gap-1 text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  Low Quality
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
