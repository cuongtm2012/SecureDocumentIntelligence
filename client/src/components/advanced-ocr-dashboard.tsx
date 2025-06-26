import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Import our enhanced components
import { EnhancedUploadManager, UploadedFile } from './enhanced-upload-manager';
import { EnhancedOCRViewer, OCRResult } from './enhanced-ocr-viewer';
import { DocumentExportManager } from './document-export-manager';
import { MultiLanguageOCR } from './multi-language-ocr';
import { BatchOCRProcessor } from './batch-ocr-processor';
import { OptimizedPDFOCRViewer } from './optimized-pdf-ocr-viewer';

import { 
  Upload, 
  FileText, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  BarChart3,
  Settings,
  Shield,
  Zap,
  TrendingUp,
  Globe,
  Download,
  Languages,
  Activity,
  Database,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { useToast } from "@/hooks/use-toast";

export function AdvancedOCRDashboard() {
  const [activeTab, setActiveTab] = useState('upload');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedResult, setSelectedResult] = useState<OCRResult | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [showLanguageOCR, setShowLanguageOCR] = useState(false);
  const [currentDocument, setCurrentDocument] = useState<any>(null);
  const [showPDFViewer, setShowPDFViewer] = useState(false);
  const [selectedFileForViewer, setSelectedFileForViewer] = useState<UploadedFile | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch real documents from backend
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const response = await fetch('/api/documents');
      if (!response.ok) throw new Error('Failed to fetch documents');
      return response.json();
    },
    refetchInterval: (data) => {
      // Only poll if there are documents being processed
      // Ensure data is an array before calling .some()
      if (!Array.isArray(data)) return false;
      const hasProcessing = data.some((d: any) => d.processingStatus === 'processing');
      return hasProcessing ? 5000 : false; // Poll every 5 seconds if processing, otherwise don't poll
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const promises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/documents/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) throw new Error(`Upload failed for ${file.name}`);
        return response.json();
      });
      
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({
        title: "Upload successful",
        description: "Files uploaded and ready for processing.",
      });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Process document mutation
  const processMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await fetch(`/api/documents/${documentId}/process`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Processing failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({
        title: "Processing completed",
        description: "OCR processing completed successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Processing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // File upload handler
  const handleFileUpload = async (files: File[]) => {
    const newFiles: UploadedFile[] = files.map(file => ({
      id: nanoid(),
      file,
      name: file.name,
      size: file.size,
      type: file.type.startsWith('image/') ? 'image' : 'pdf',
      status: 'uploading',
      uploadProgress: 0,
      processingProgress: 0,
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);

    try {
      await uploadMutation.mutateAsync(files);
      
      // Update files to queued status
      setUploadedFiles(prev => prev.map(f => 
        newFiles.some(nf => nf.id === f.id) 
          ? { ...f, status: 'queued', uploadProgress: 100 }
          : f
      ));
    } catch (error) {
      console.error('Upload error:', error);
      // Update files to error status
      setUploadedFiles(prev => prev.map(f => 
        newFiles.some(nf => nf.id === f.id) 
          ? { ...f, status: 'error', error: 'Upload failed' }
          : f
      ));
    }
  };

  // Process uploaded file
  const handleFileProcess = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file) return;

    setUploadedFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, status: 'processing', processingProgress: 0 }
        : f
    ));

    try {
      // Find corresponding document and process it
      const document = documents.find((d: any) => d.originalName === file.name);
      if (document) {
        const result = await processMutation.mutateAsync(document.id.toString());
        
        setUploadedFiles(prev => prev.map(f => 
          f.id === fileId 
            ? { 
                ...f, 
                status: 'completed', 
                processingProgress: 100,
                result: {
                  extractedText: result.extractedText || '',
                  confidence: result.confidence || 0,
                  pageCount: result.pageCount,
                  wordCount: result.extractedText ? result.extractedText.split(/\s+/).filter((word: string) => word.length > 0).length : 0,
                  characterCount: result.extractedText ? result.extractedText.length : 0,
                }
              }
            : f
        ));
      }
    } catch (error) {
      setUploadedFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { ...f, status: 'error', error: 'Processing failed' }
          : f
      ));
    }
  };

  // File handlers
  const handleFileRemove = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleFileCancel = (fileId: string) => {
    setUploadedFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, status: 'queued' }
        : f
    ));
  };

  const handleBatchUpload = (files: File[]) => {
    setBatchFiles(files);
    setActiveTab('batch');
  };

  // View OCR result from uploaded files
  const handleViewUploadedFileResult = (file: UploadedFile) => {
    // Find the corresponding document from the backend
    const correspondingDocument = documents.find((doc: any) => doc.originalName === file.name);
    
    if (!correspondingDocument) {
      toast({
        title: "Document not found",
        description: "Could not find the corresponding document on the server.",
        variant: "destructive",
      });
      return;
    }
    
    console.log('📄 Opening PDF viewer for document:', {
      fileId: file.id,
      documentId: correspondingDocument.id,
      fileName: file.name
    });
    
    setSelectedFileForViewer(file);
    setCurrentDocument(correspondingDocument); // Store the real document
    setShowPDFViewer(true);
  };

  // View OCR result from documents
  const handleViewResult = (document: any) => {
    if (document.extractedText) {
      const result: OCRResult = {
        id: document.id.toString(),
        fileName: document.originalName,
        fileType: document.mimeType.startsWith('image/') ? 'image' : 'pdf',
        extractedText: document.extractedText,
        confidence: document.confidence || 0.8,
        pageCount: document.structuredData?.pageCount,
        imageUrl: `/api/documents/${document.id}/thumbnail`,
        lowConfidenceWords: []
      };
      setSelectedResult(result);
      setShowViewer(true);
    }
  };

  // Text editing handler
  const handleTextEdit = (resultId: string, newText: string, pageNumber?: number) => {
    console.log('Updating text for document:', resultId, newText, pageNumber);
  };

  // Export handler
  const handleExport = (resultId: string, format: 'txt' | 'pdf' | 'docx') => {
    window.open(`/api/documents/${resultId}/export?format=${format}`, '_blank');
  };

  // Advanced language OCR handler
  const handleAdvancedOCR = (document: any) => {
    setCurrentDocument(document);
    setShowLanguageOCR(true);
  };

  // OCR completion handler for multi-language
  const handleOCRComplete = (result: {
    text: string;
    confidence: number;
    language: string;
    detectedLanguages: any[];
  }) => {
    console.log('OCR completed:', result);
    setShowLanguageOCR(false);
    queryClient.invalidateQueries({ queryKey: ['documents'] });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'processing': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  // Convert documents to OCR results for export
  const ocrResults = documents
    .filter((doc: any) => doc.extractedText)
    .map((doc: any) => ({
      id: doc.id.toString(),
      text: doc.extractedText,
      confidence: Math.round((doc.confidence || 0) * 100),
      filename: doc.originalName,
      pageCount: doc.structuredData?.pageCount || 1,
      language: doc.detectedLanguage || 'en',
      processedAt: new Date(doc.processedAt || doc.uploadedAt),
    }));

  // Paginated documents
  const paginatedDocuments = documents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Advanced OCR Intelligence Platform
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Multi-language document processing with AI-powered analysis
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Shield className="h-3 w-3 mr-1" />
              Secure
            </Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <Zap className="h-3 w-3 mr-1" />
              DeepSeek AI
            </Badge>
            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
              <Languages className="h-3 w-3 mr-1" />
              Multi-Lang
            </Badge>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm">Total Documents</p>
                  <p className="text-2xl font-bold">{documents.length}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm">Completed</p>
                  <p className="text-2xl font-bold">
                    {documents.filter((d: any) => d.processingStatus === 'completed').length}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-yellow-100 text-sm">Processing</p>
                  <p className="text-2xl font-bold">
                    {documents.filter((d: any) => d.processingStatus === 'processing').length}
                  </p>
                </div>
                <Activity className="h-8 w-8 text-yellow-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm">Avg. Confidence</p>
                  <p className="text-2xl font-bold">
                    {documents.length > 0 
                      ? Math.round(documents.reduce((acc: number, doc: any) => acc + (doc.confidence || 0), 0) / documents.length * 100) + '%'
                      : '0%'}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-indigo-100 text-sm">Languages</p>
                  <p className="text-2xl font-bold">12+</p>
                </div>
                <Globe className="h-8 w-8 text-indigo-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabbed Interface */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="batch" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Batch Process
            </TabsTrigger>
            <TabsTrigger value="results" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Results
            </TabsTrigger>
            <TabsTrigger value="export" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <EnhancedUploadManager
                  onFileUpload={handleFileUpload}
                  onFileRemove={handleFileRemove}
                  onFileProcess={handleFileProcess}
                  onFileCancel={handleFileCancel}
                  onBatchUpload={handleBatchUpload}
                  onViewResult={handleViewUploadedFileResult}
                  uploadedFiles={uploadedFiles}
                />
              </div>

              {/* System Status */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Processing Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Success Rate</span>
                        <span className="font-medium">
                          {documents.length > 0 
                            ? Math.round(documents.filter((d: any) => d.processingStatus === 'completed').length / documents.length * 100) + '%'
                            : '0%'}
                        </span>
                      </div>
                      <Progress value={documents.length > 0 ? documents.filter((d: any) => d.processingStatus === 'completed').length / documents.length * 100 : 0} className="h-2" />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Average Processing Time</span>
                        <span className="font-medium">2.3s</span>
                      </div>
                      <Progress value={75} className="h-2" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600">{documents.filter((d: any) => new Date(d.uploadedAt).toDateString() === new Date().toDateString()).length}</p>
                        <p className="text-xs text-gray-500">Today</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{documents.length}</p>
                        <p className="text-xs text-gray-500">Total</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Quick Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button 
                      className="w-full" 
                      variant="outline"
                      onClick={() => setActiveTab('batch')}
                    >
                      <Database className="h-4 w-4 mr-2" />
                      Batch Processing
                    </Button>
                    <Button 
                      className="w-full" 
                      variant="outline"
                      onClick={() => setActiveTab('export')}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export Results
                    </Button>
                    <Button 
                      className="w-full" 
                      variant="outline"
                      onClick={() => setActiveTab('analytics')}
                    >
                      <BarChart3 className="h-4 w-4 mr-2" />
                      View Analytics
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Batch Processing Tab */}
          <TabsContent value="batch" className="space-y-6">
            <BatchOCRProcessor
              files={batchFiles}
              onJobComplete={(job) => console.log('Batch job completed:', job)}
              onAllJobsComplete={(stats) => {
                console.log('Batch processing completed:', stats);
                setActiveTab('results');
              }}
            />
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Processing Results</h2>
              <p className="text-gray-600">
                View and manage processed documents ({documents?.length || 0} total)
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Select value={pageSize.toString()} onValueChange={(value) => {
                setPageSize(Number(value));
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 per page</SelectItem>
                  <SelectItem value="10">10 per page</SelectItem>
                  <SelectItem value="20">20 per page</SelectItem>
                  <SelectItem value="50">50 per page</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline" className="text-sm">
                Page {currentPage} of {Math.ceil((documents?.length || 0) / pageSize)}
              </Badge>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : documents && documents.length > 0 ? (
            <>
              <div className="space-y-4">
                {documents
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map((doc: any) => (
                  <Card key={doc.id} className="border border-gray-200 hover:border-blue-300 transition-colors">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <FileText className="h-5 w-5 text-blue-600" />
                            <h3 className="font-semibold text-gray-900">{doc.filename}</h3>
                            <Badge 
                              variant={doc.status === 'completed' ? 'default' : 
                                     doc.status === 'processing' ? 'secondary' : 'destructive'}
                              className="text-xs"
                            >
                              {doc.status}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 mb-4">
                            <div>
                              <span className="font-medium">Uploaded:</span>
                              <div>{new Date(doc.uploadedAt).toLocaleDateString()}</div>
                            </div>
                            {doc.processedAt && (
                              <div>
                                <span className="font-medium">Processed:</span>
                                <div>{new Date(doc.processedAt).toLocaleDateString()}</div>
                              </div>
                            )}
                            <div>
                              <span className="font-medium">Type:</span>
                              <div className="capitalize">{doc.type}</div>
                            </div>
                            {doc.confidence && (
                              <div>
                                <span className="font-medium">Confidence:</span>
                                <div>{Math.round(doc.confidence * 100)}%</div>
                              </div>
                            )}
                          </div>

                          {doc.extractedText && (
                            <div className="mb-4">
                              <span className="font-medium text-sm text-gray-700">Extracted Text Preview:</span>
                              <p className="text-sm text-gray-600 mt-1 line-clamp-3">
                                {doc.extractedText.substring(0, 200)}
                                {doc.extractedText.length > 200 && '...'}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col space-y-2 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedResult({
                                id: doc.id,
                                fileName: doc.filename,
                                fileType: doc.type === 'pdf' ? 'pdf' : 'image',
                                extractedText: doc.extractedText || '',
                                confidence: doc.confidence || 0,
                                pageCount: doc.structuredData?.pageCount || 1,
                                imageUrl: `/api/documents/${doc.id}/thumbnail`,
                                lowConfidenceWords: []
                              });
                              setShowViewer(true);
                            }}
                            className="whitespace-nowrap"
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            View Details
                          </Button>
                          
                          {doc.type === 'pdf' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedFileForViewer({
                                  id: doc.id,
                                  name: doc.filename,
                                  size: 0,
                                  type: 'pdf' as const,
                                  status: 'completed',
                                  uploadProgress: 100,
                                  processingProgress: 100,
                                  file: new File([], doc.filename, { type: 'application/pdf' })
                                });
                                setCurrentDocument(doc);
                                setShowPDFViewer(true);
                              }}
                              className="whitespace-nowrap"
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              PDF Viewer
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Pagination Controls */}
              {documents.length > pageSize && (
                <div className="flex items-center justify-between border-t pt-6">
                  <div className="text-sm text-gray-600">
                    Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, documents.length)} of {documents.length} results
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="p-2"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="p-2"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    
                    <span className="text-sm font-medium px-3 py-1 bg-gray-100 rounded">
                      {currentPage}
                    </span>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(Math.ceil(documents.length / pageSize), prev + 1))}
                      disabled={currentPage >= Math.ceil(documents.length / pageSize)}
                      className="p-2"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.ceil(documents.length / pageSize))}
                      disabled={currentPage >= Math.ceil(documents.length / pageSize)}
                      className="p-2"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <Card className="border-dashed border-2 border-gray-300">
              <CardContent className="p-12 text-center">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Results Yet</h3>
                <p className="text-gray-600 mb-4">
                  Upload and process documents to see results here
                </p>
                <Button onClick={() => setActiveTab('upload')}>
                  Start Uploading
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-6">
          <DocumentExportManager
            ocrResults={ocrResults}
            selectedResults={selectedDocuments}
            onSelectionChange={setSelectedDocuments}
          />
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Processing Volume</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-blue-600">{documents.length}</p>
                    <p className="text-sm text-gray-500">Total Documents</p>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p className="text-xl font-bold text-green-600">
                        {documents.filter((d: any) => d.processingStatus === 'completed').length}
                      </p>
                      <p className="text-xs text-gray-500">Completed</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-red-600">
                        {documents.filter((d: any) => d.processingStatus === 'failed').length}  
                      </p>
                      <p className="text-xs text-gray-500">Failed</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quality Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Avg. Confidence</span>
                      <span>
                        {documents.length > 0 
                          ? Math.round(documents.reduce((acc: number, doc: any) => acc + (doc.confidence || 0), 0) / documents.length * 100) + '%'
                          : '0%'}
                      </span>
                    </div>
                    <Progress value={documents.length > 0 ? documents.reduce((acc: number, doc: any) => acc + (doc.confidence || 0), 0) / documents.length * 100 : 0} className="h-2" />
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Success Rate</span>
                      <span>
                        {documents.length > 0 
                          ? Math.round(documents.filter((d: any) => d.processingStatus === 'completed').length / documents.length * 100) + '%'
                          : '0%'}
                      </span>
                    </div>
                    <Progress value={documents.length > 0 ? documents.filter((d: any) => d.processingStatus === 'completed').length / documents.length * 100 : 0} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>

    {/* OCR Viewer Modal */}
    {selectedResult && (
      <Dialog open={showViewer} onOpenChange={setShowViewer}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>OCR Results - {selectedResult.fileName}</DialogTitle>
          </DialogHeader>
          <EnhancedOCRViewer
            result={selectedResult}
            onTextEdit={handleTextEdit}
            onExport={handleExport}
            onClose={() => setShowViewer(false)}
          />
        </DialogContent>
      </Dialog>
    )}

    {/* Multi-Language OCR Dialog */}
    {currentDocument && (
      <Dialog open={showLanguageOCR} onOpenChange={setShowLanguageOCR}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Advanced Multi-Language OCR</DialogTitle>
          </DialogHeader>
          <MultiLanguageOCR
            documentId={currentDocument.id}
            imageUrl={currentDocument.filePath}
            onOCRComplete={handleOCRComplete}
          />
        </DialogContent>
      </Dialog>
    )}

    {/* PDF Viewer Dialog */}
    {selectedFileForViewer && currentDocument && (
      <Dialog open={showPDFViewer} onOpenChange={setShowPDFViewer}>
        <DialogContent className="max-w-7xl max-h-[95vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>PDF OCR Viewer - {selectedFileForViewer.name}</DialogTitle>
          </DialogHeader>
          <OptimizedPDFOCRViewer
            file={selectedFileForViewer}
            documentId={currentDocument.id}
            onTextEdit={handleTextEdit}
            onExport={handleExport}
            onClose={() => setShowPDFViewer(false)}
          />
        </DialogContent>
      </Dialog>
    )}
  </div>
);
}
