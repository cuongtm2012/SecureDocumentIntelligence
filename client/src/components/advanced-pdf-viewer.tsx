import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Maximize2, 
  FileText, 
  Search 
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist/types/src/display/api';
import { AlertCircle, Loader2, Grid3X3, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';

interface AdvancedPDFViewerProps {
  fileUrl: string;
  onTextExtracted?: (text: string) => void;
}

interface PageInfo {
  pageNumber: number;
  width: number;
  height: number;
  text?: string;
  rendered?: boolean;
}

interface ExtendedRenderTask extends RenderTask {
  pageNum: number;
  cancel(): void;
}

export function AdvancedPDFViewer({ 
  fileUrl, 
  onTextExtracted 
}: AdvancedPDFViewerProps) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const loadingTaskRef = useRef<any>(null);
  
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'single' | 'continuous'>('single');
  const [extractedText, setExtractedText] = useState<PageInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [renderTasks, setRenderTasks] = useState<ExtendedRenderTask[]>([]);
  const [pageTexts, setPageTexts] = useState<{ [key: number]: string }>({});

  // Load PDF from URL or File - Fixed to properly handle document ID
  const loadPDF = useCallback(async () => {
    if (!fileUrl) return;

    setLoading(true);
    setError(null);

    try {
      // Cancel any ongoing loading task
      if (loadingTaskRef.current) {
        loadingTaskRef.current.destroy();
        loadingTaskRef.current = null;
      }

      const loadingTask = pdfjsLib.getDocument({
        url: fileUrl,
        httpHeaders: { 'Cache-Control': 'no-cache' },
        cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
        cMapPacked: true
      });
      loadingTaskRef.current = loadingTask;
      
      const pdfDocument = await loadingTask.promise;
      setPdf(pdfDocument);
      setTotalPages(pdfDocument.numPages);
      setCurrentPage(1);
      
      // Initialize canvas refs array
      canvasRefs.current = Array(pdfDocument.numPages).fill(null);
      
      // Initialize extracted text array
      const textInfo: PageInfo[] = Array(pdfDocument.numPages).fill(null).map((_, index) => ({
        pageNumber: index + 1,
        width: 0,
        height: 0,
        text: '',
        rendered: false
      }));
      setExtractedText(textInfo);
      
      // Extract all text and call onTextExtracted with combined text
      const allPagesText: string[] = [];
      for (let i = 1; i <= pdfDocument.numPages; i++) {
        try {
          const page = await pdfDocument.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
          allPagesText.push(pageText);
        } catch (err) {
          console.error(`Error extracting text from page ${i}:`, err);
          allPagesText.push('');
        }
      }
      
      onTextExtracted?.(allPagesText.join('\n\n'));
      console.log('✅ PDF loaded successfully:', {
        pages: pdfDocument.numPages,
        fingerprints: pdfDocument.fingerprints
      });

    } catch (err) {
      const error = err as Error;
      console.error('❌ PDF loading error:', error);
      setError(error.message || 'Failed to load PDF');
    } finally {
      setLoading(false);
    }
  }, [fileUrl, onTextExtracted]);

  // Extract text from a specific page
  const extractTextFromPage = useCallback(async (pageNumber: number) => {
    if (!pdf) return '';

    try {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      // Update extracted text state
      setExtractedText(prev => prev.map(pageInfo => 
        pageInfo.pageNumber === pageNumber 
          ? { 
              ...pageInfo, 
              text,
              width: viewport.width,
              height: viewport.height,
              rendered: true
            }
          : pageInfo
      ));

      return text;
    } catch (err) {
      console.error(`❌ Text extraction error for page ${pageNumber}:`, err);
      return '';
    }
  }, [pdf]);

  // Render a specific page - Fixed to match working example
  const renderPage = useCallback(async (pageNum: number): Promise<void> => {
    if (!pdf) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Cancel any ongoing render task
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      const page = await pdf.getPage(pageNum);
      const canvas = document.getElementById(`pdf-canvas-${pageNum}`) as HTMLCanvasElement;
      
      if (!canvas) {
        throw new Error('Canvas element not found');
      }

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas context not available');
      }

      const viewport = page.getViewport({ scale: scale * window.devicePixelRatio, rotation });
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / window.devicePixelRatio}px`;
      canvas.style.height = `${viewport.height / window.devicePixelRatio}px`;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;
      renderTaskRef.current = null;

      // Extract text from the page
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ');
      
      setPageTexts(prev => ({ ...prev, [pageNum]: pageText }));
      
    } catch (error: any) {
      if (error.name !== 'RenderingCancelledException') {
        console.error('Error rendering page:', error);
        setError(`Failed to render page ${pageNum}: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [pdf, scale, rotation]);

  // Render all visible pages
  const renderVisiblePages = useCallback(async () => {
    if (!pdf) return;

    if (viewMode === 'single') {
      await renderPage(currentPage);
    } else {
      // In continuous mode, render all pages
      for (let i = 1; i <= totalPages; i++) {
        await renderPage(i);
      }
    }
  }, [pdf, viewMode, currentPage, totalPages, renderPage]);

  // Load PDF when URL or file changes
  useEffect(() => {
    loadPDF();
  }, [loadPDF]);

  // Render pages when PDF or settings change
  useEffect(() => {
    if (pdf) {
      renderVisiblePages();
    }
  }, [pdf, renderVisiblePages]);

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

  const goToPage = (pageNumber: number) => {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
    }
  };

  // Zoom handlers
  const zoomIn = () => setScale(prev => Math.min(prev * 1.2, 3.0));
  const zoomOut = () => setScale(prev => Math.max(prev / 1.2, 0.3));
  const resetZoom = () => setScale(1.0);
  const rotate = () => setRotation(prev => (prev + 90) % 360);

  // Search functionality
  const searchInText = (term: string) => {
    if (!term) return [];
    
    const results: { pageNumber: number; matches: number }[] = [];
    extractedText.forEach(pageInfo => {
      if (pageInfo.text) {
        const matches = (pageInfo.text.toLowerCase().match(new RegExp(term.toLowerCase(), 'g')) || []).length;
        if (matches > 0) {
          results.push({ pageNumber: pageInfo.pageNumber, matches });
        }
      }
    });
    return results;
  };

  // Copy all text
  const copyAllText = () => {
    const allText = extractedText
      .map(page => page.text || '')
      .filter(text => text.length > 0)
      .join('\n\n');
    navigator.clipboard.writeText(allText);
  };

  // Clean up render tasks on unmount
  useEffect(() => {
    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // Task may already be complete
        }
      }
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      if (loadingTaskRef.current) {
        loadingTaskRef.current.destroy();
      }
      if (pdf) {
        pdf.destroy();
      }
    };
  }, [pdf]);

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <AlertCircle className="h-4 w-4" />
          <div>
            <strong>PDF Loading Error:</strong> {error}
          </div>
          <Button onClick={loadPDF} className="mt-4" variant="outline">
            Retry Loading
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading PDF...</p>
        </CardContent>
      </Card>
    );
  }

  if (!pdf) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm text-gray-600">No PDF loaded</p>
        </CardContent>
      </Card>
    );
  }

  const searchResults = searchTerm ? searchInText(searchTerm) : [];

  return (
    <Card>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Advanced PDF Viewer</h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              Page {currentPage} of {totalPages}
            </Badge>
            <Badge variant="outline">
              {Math.round(scale * 100)}%
            </Badge>
          </div>
        </div>
      </div>

      <CardContent className="p-0">
        <Tabs defaultValue="viewer" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="viewer">PDF Viewer</TabsTrigger>
            <TabsTrigger value="text">Extracted Text</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
          </TabsList>

          <TabsContent value="viewer" className="mt-0">
            {/* Controls */}
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPrevPage}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <Input
                  type="number"
                  value={currentPage}
                  onChange={(e) => goToPage(parseInt(e.target.value))}
                  className="w-16 h-8 text-center"
                  min={1}
                  max={totalPages}
                />
                
                <span className="text-sm">/ {totalPages}</span>
                
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
                <Button 
                  variant={viewMode === 'single' ? 'default' : 'outline'} 
                  size="sm" 
                  onClick={() => setViewMode('single')}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
                
                <Button 
                  variant={viewMode === 'continuous' ? 'default' : 'outline'} 
                  size="sm" 
                  onClick={() => setViewMode('continuous')}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                
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
              </div>
            </div>

            {/* PDF Canvas Container */}
            <div 
              ref={containerRef}
              className="p-4 overflow-auto max-h-[70vh] flex justify-center bg-gray-100"
            >
              <div className={`${viewMode === 'continuous' ? 'space-y-4' : ''}`}>
                {viewMode === 'single' ? (
                  <canvas
                    id={`pdf-canvas-${currentPage}`}
                    ref={(el) => canvasRefs.current[currentPage - 1] = el}
                    className="border border-gray-300 shadow-lg bg-white"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                ) : (
                  Array.from({ length: totalPages }, (_, index) => (
                    <div key={index + 1} className="mb-4">
                      <div className="text-center mb-2">
                        <Badge variant="secondary">Page {index + 1}</Badge>
                      </div>
                      <canvas
                        id={`pdf-canvas-${index + 1}`}
                        ref={(el) => canvasRefs.current[index] = el}
                        className="border border-gray-300 shadow-lg bg-white"
                        style={{ maxWidth: '100%', height: 'auto' }}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="text" className="mt-0">
            <div className="p-4 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Extracted Text</h3>
                <Button variant="outline" size="sm" onClick={copyAllText}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy All
                </Button>
              </div>
              
              <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                {extractedText.map((pageInfo) => (
                  <Card key={pageInfo.pageNumber}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Page {pageInfo.pageNumber}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">
                        {pageInfo.text || 'No text extracted from this page.'}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="search" className="mt-0">
            <div className="p-4 space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search in PDF..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1"
                />
                <Button variant="outline" size="sm">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              
              {searchTerm && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    Found {searchResults.reduce((acc, result) => acc + result.matches, 0)} matches 
                    across {searchResults.length} pages
                  </p>
                  
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                    {searchResults.map((result) => (
                      <Card key={result.pageNumber} className="cursor-pointer hover:bg-gray-50"
                            onClick={() => {
                              setCurrentPage(result.pageNumber);
                              // Switch to viewer tab
                              (document.querySelector('[value="viewer"]') as HTMLElement)?.click();
                            }}>
                        <CardContent className="p-3">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">Page {result.pageNumber}</span>
                            <Badge variant="secondary">{result.matches} matches</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}