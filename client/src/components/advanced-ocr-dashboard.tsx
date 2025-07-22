import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

// Import our enhanced components
import { EnhancedUploadManager, UploadedFile } from './enhanced-upload-manager';
import { DocumentExportManager } from './document-export-manager';
import { MultiLanguageOCR } from './multi-language-ocr';
import { BatchOCRProcessor } from './batch-ocr-processor';
import { TesseractTrainingInterface } from './tesseract-training-interface';
import { UnifiedDocumentViewer, DocumentData } from './main-document-viewer';
import { OCRProgressTracker } from './ocr-progress-tracker';

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
  ChevronsRight,
  Copy,
  Search,
  Calendar,
  Filter,
  X,
  RefreshCw,
  Layers
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { useToast } from "@/hooks/use-toast";

// OCR Result interface
interface OCRResult {
  id: string;
  fileName: string;
  fileType: 'image' | 'pdf';
  extractedText: string;
  confidence: number;
  pageCount?: number;
  imageUrl?: string;
  lowConfidenceWords?: Array<{
    word: string;
    confidence: number;
    position: { x: number; y: number; width: number; height: number };
  }>;
}

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
  
  // Progress tracking state
  const [processingDocuments, setProcessingDocuments] = useState<Set<string>>(new Set());
  const [completedDocuments, setCompletedDocuments] = useState<Set<string>>(new Set());


  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filter and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('vi');
  const [isUploading, setIsUploading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch real documents from backend
  const fetchDocuments = async () => {
    console.log('🔄 Fetching documents from API...');
    const response = await fetch('/api/documents');
    if (!response.ok) throw new Error('Failed to fetch documents');
    const data = await response.json();
    console.log('📊 Documents fetched:', data.length, 'documents');
    return data;
  };

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: fetchDocuments,
    refetchInterval: autoRefresh ? 30000 : false, // Reduced from 10s to 30s when auto-refresh is on
    staleTime: 5000, // Consider data stale after 5 seconds instead of 1
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ files, forceReprocess = false }: { files: File[]; forceReprocess?: boolean }) => {
      const promises = files.map(async (file) => {
        try {
          const formData = new FormData();
          formData.append('file', file);
          if (forceReprocess) {
            formData.append('forceReprocess', 'true');
          }

          const response = await fetch('/api/documents/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Upload failed for ${file.name}: ${errorText}`);
          }
          
          const result = await response.json();
          
          // Return both the result and the original file for mapping
          return {
            ...result,
            originalFile: file
          };
        } catch (error: any) {
          console.error(`Upload error for ${file.name}:`, error);
          throw new Error(`Failed to upload ${file.name}: ${error.message}`);
        }
      });

      try {
        return await Promise.all(promises);
      } catch (error: any) {
        console.error('Batch upload error:', error);
        throw error;
      }
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });

      const duplicateFiles = results.filter((r: any) => r.isDuplicate);
      const newFiles = results.filter((r: any) => !r.isDuplicate);

      if (duplicateFiles.length > 0 && newFiles.length > 0) {
        toast({
          title: "Upload completed",
          description: `${newFiles.length} new file(s) uploaded. ${duplicateFiles.length} duplicate(s) detected and existing files were used.`,
        });
      } else if (duplicateFiles.length > 0) {
        toast({
          title: "Duplicates detected",
          description: `${duplicateFiles.length} file(s) already exist on server. Using existing documents for analysis.`,
          variant: "default",
        });
      } else {
        toast({
          title: "Upload successful",
          description: "Files uploaded and ready for processing.",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Enhanced process document mutation with detailed progress tracking
  const processMutation = useMutation({
    mutationFn: async (documentId: string) => {
      // Mark as processing
      setProcessingDocuments(prev => new Set(prev.add(documentId)));
      setCompletedDocuments(prev => {
        const updated = new Set(prev);
        updated.delete(documentId);
        return updated;
      });
      
      const response = await fetch(`/api/documents/${documentId}/process`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Processing failed');
      return response.json();
    },
    onSuccess: (data, documentId) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      
      // Mark as completed
      setProcessingDocuments(prev => {
        const updated = new Set(prev);
        updated.delete(documentId);
        return updated;
      });
      setCompletedDocuments(prev => new Set(prev.add(documentId)));
      
      toast({
        title: "Processing completed",
        description: "OCR processing completed successfully with enhanced progress tracking.",
      });
    },
    onError: (error, documentId) => {
      // Remove from processing
      setProcessingDocuments(prev => {
        const updated = new Set(prev);
        updated.delete(documentId);
        return updated;
      });
      
      toast({
        title: "Processing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Parallel OCR processing mutation (ABBYY + Tesseract)
  const parallelProcessMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await fetch(`/api/documents/${documentId}/process-parallel`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Parallel processing failed');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({
        title: "Parallel OCR completed",
        description: `Best platform: ${data.parallelResults?.bestPlatform}. Processing time: ${Math.round(data.parallelResults?.processingTime || 0)}ms`,
      });
    },
    onError: (error) => {
      toast({
        title: "Parallel processing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // File upload handler
  const handleFileUpload = async (files: File[], forceReprocess = false) => {
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

    console.log(`📤 Uploading ${files.length} files${forceReprocess ? ' (force reprocess)' : ''}`);

    try {
      const uploadResults = await uploadMutation.mutateAsync({ files, forceReprocess });

      // Update files with actual document IDs from server response
      setUploadedFiles(prev => prev.map(f => {
        const matchingResult = uploadResults.find((result: any) => 
          result.originalFile.name === f.name && result.originalFile.size === f.size
        );
        
        if (matchingResult) {
          console.log(`📄 Mapping file "${f.name}" to document ID ${matchingResult.id}${matchingResult.isDuplicate ? ' (duplicate)' : ''}`);
          return {
            ...f,
            documentId: matchingResult.id, // Store the actual document ID from server
            status: 'queued',
            uploadProgress: 100,
            isDuplicate: matchingResult.isDuplicate
          };
        }
        return f;
      }));
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

  // Enhanced OCR progress tracker with log monitoring
  const trackOCRProgress = (documentId: string, fileId: string) => {
    let eventSource: EventSource | null = null;
    let progressInterval: NodeJS.Timeout;
    
    // Start SSE connection to monitor server logs
    const connectToProgressStream = () => {
      eventSource = new EventSource(`/api/documents/${documentId}/progress-stream`);
      
      eventSource.onmessage = (event) => {
        try {
          const logData = JSON.parse(event.data);
          
          setUploadedFiles(prev => prev.map(f => {
            if (f.id !== fileId) return f;
            
            // Calculate progress based on log patterns
            let progress = f.processingProgress;
            let ocrProgress = f.ocrProgress || {
              stage: 'initializing',
              stageDescription: 'Starting OCR...',
              totalPages: 1,
              pagesCompleted: 0,
              currentPage: 1
            };
            
            // Parse different log types
            if (logData.message?.includes('Starting PDF OCR processing')) {
              ocrProgress = {
                stage: 'initializing',
                stageDescription: 'Starting PDF processing...',
                totalPages: logData.pageCount || 1,
                pagesCompleted: 0,
                currentPage: 1,
                processingSpeed: '~60s estimated'
              };
              progress = 5;
            } else if (logData.message?.includes('Converting page')) {
              const pageMatch = logData.message.match(/page (\d+) of (\d+)/);
              if (pageMatch) {
                const currentPage = parseInt(pageMatch[1]);
                const totalPages = parseInt(pageMatch[2]);
                ocrProgress = {
                  ...ocrProgress,
                  stage: 'converting',
                  stageDescription: 'Converting PDF pages...',
                  currentPage,
                  totalPages,
                  processingSpeed: '200 DPI conversion'
                };
                progress = 10 + ((currentPage - 1) / totalPages) * 30; // 10-40%
              }
            } else if (logData.message?.includes('OCR processing page')) {
              const pageMatch = logData.message.match(/page (\d+) of (\d+)/);
              if (pageMatch) {
                const currentPage = parseInt(pageMatch[1]);
                const totalPages = parseInt(pageMatch[2]);
                ocrProgress = {
                  ...ocrProgress,
                  stage: 'extracting',
                  stageDescription: 'Extracting text from pages...',
                  currentPage,
                  totalPages,
                  pagesCompleted: currentPage - 1,
                  processingSpeed: 'Tesseract OCR'
                };
                progress = 40 + ((currentPage - 1) / totalPages) * 40; // 40-80%
              }
            } else if (logData.message?.includes('Page') && logData.message?.includes('processed with')) {
              const pageMatch = logData.message.match(/Page (\d+)/);
              const confidenceMatch = logData.message.match(/(\d+)% confidence/);
              if (pageMatch) {
                const pageNumber = parseInt(pageMatch[1]);
                const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 0;
                ocrProgress = {
                  ...ocrProgress,
                  stage: 'extracting',
                  stageDescription: `Page ${pageNumber} extracted (${confidence}% confidence)`,
                  pagesCompleted: pageNumber,
                  processingSpeed: `${confidence}% accuracy`
                };
                progress = 40 + (pageNumber / (ocrProgress.totalPages || 1)) * 40; // Up to 80%
              }
            } else if (logData.message?.includes('DeepSeek API processing')) {
              ocrProgress = {
                ...ocrProgress,
                stage: 'enhancing',
                stageDescription: 'Enhancing text with AI...',
                processingSpeed: 'DeepSeek AI'
              };
              progress = 85;
            } else if (logData.message?.includes('DeepSeek API processing completed successfully')) {
              ocrProgress = {
                ...ocrProgress,
                stage: 'completing',
                stageDescription: 'Processing completed successfully!',
                processingSpeed: 'Complete'
              };
              progress = 100;
            }
            
            return {
              ...f,
              processingProgress: Math.min(progress, 100),
              ocrProgress
            };
          }));
        } catch (error) {
          console.error('Error parsing progress data:', error);
        }
      };
      
      eventSource.onerror = () => {
        eventSource?.close();
        // Fallback to polling if SSE fails
        startProgressPolling();
      };
    };
    
    // Fallback progress polling
    const startProgressPolling = () => {
      progressInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/documents/${documentId}`);
          const doc = await response.json();
          
          setUploadedFiles(prev => prev.map(f => {
            if (f.id !== fileId) return f;
            
            if (doc.status === 'processing') {
              return {
                ...f,
                processingProgress: Math.min((f.processingProgress || 0) + 2, 95),
                ocrProgress: {
                  ...f.ocrProgress,
                  stageDescription: 'Processing in progress...'
                }
              };
            } else if (doc.status === 'completed') {
              clearInterval(progressInterval);
              return {
                ...f,
                status: 'completed',
                processingProgress: 100,
                ocrProgress: {
                  stage: 'completing',
                  stageDescription: 'Processing completed!',
                  processingSpeed: 'Complete'
                }
              };
            }
            return f;
          }));
        } catch (error) {
          console.error('Progress polling error:', error);
          clearInterval(progressInterval);
        }
      }, 2000);
    };
    
    // Try SSE first, fallback to polling
    connectToProgressStream();
    
    // Cleanup function
    return () => {
      eventSource?.close();
      if (progressInterval) clearInterval(progressInterval);
    };
  };

  // Process uploaded file with enhanced progress tracking
  const handleFileProcess = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file || !file.documentId) {
      console.error('❌ Cannot process file: missing document ID', file);
      return;
    }

    console.log(`🔄 Processing document ID ${file.documentId} for file "${file.name}"`);

    setUploadedFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { 
            ...f, 
            status: 'processing', 
            processingProgress: 0,
            ocrProgress: {
              stage: 'initializing',
              stageDescription: 'Initializing OCR processing...',
              totalPages: 1,
              pagesCompleted: 0,
              currentPage: 1
            }
          }
        : f
    ));

    // Start progress tracking
    const cleanupProgress = trackOCRProgress(file.documentId.toString(), fileId);

    try {
      // Use the stored document ID directly (this is the correct ID from server)
      const result = await processMutation.mutateAsync(file.documentId.toString());

      // Cleanup progress tracking
      cleanupProgress();

      setUploadedFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { 
              ...f, 
              status: 'completed', 
              processingProgress: 100,
              ocrProgress: {
                stage: 'completing',
                stageDescription: 'Processing completed successfully!',
                processingSpeed: 'Complete'
              },
              result: {
                extractedText: result.extractedText || '',
                confidence: result.confidence || 0,
                pageCount: result.pageCount || 1,
                characterCount: result.extractedText?.length || 0,
                wordCount: result.extractedText?.split(/\s+/).length || 0
              },
              structuredData: result.structuredData
            }
          : f
      ));
    } catch (error: any) {
      // Cleanup progress tracking
      cleanupProgress();
      
      console.error('Processing error:', error);
      setUploadedFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { 
              ...f, 
              status: 'error', 
              error: error.message,
              ocrProgress: {
                stage: 'completing',
                stageDescription: 'Processing failed',
                processingSpeed: 'Error'
              }
            }
          : f
      ));
    }
  };

  // Process uploaded file with parallel OCR (ABBYY + Tesseract)
  const handleFileParallelProcess = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file || !file.documentId) {
      console.error('❌ Cannot process file: missing document ID', file);
      return;
    }

    console.log(`🔄 Parallel processing document ID ${file.documentId} for file "${file.name}"`);

    setUploadedFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, status: 'processing', processingProgress: 0 }
        : f
    ));

    try {
      // Use the stored document ID for parallel processing
      const result = await parallelProcessMutation.mutateAsync(file.documentId.toString());

      setUploadedFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { 
              ...f, 
              status: 'completed', 
              processingProgress: 100,
              result: {
                extractedText: result.document?.extractedText || '',
                confidence: result.document?.confidence || 0,
                pageCount: result.document?.structuredData?.pageCount || 1,
                wordCount: result.document?.extractedText ? result.document.extractedText.split(/\s+/).filter((word: string) => word.length > 0).length : 0,
                characterCount: result.document?.extractedText ? result.document.extractedText.length : 0,
                parallelResults: result.parallelResults
              }
            }
          : f
      ));
    } catch (error) {
      console.error('❌ Parallel processing failed for document ID', file.documentId, error);
      setUploadedFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { ...f, status: 'error', error: 'Parallel processing failed' }
          : f
      ));
    }
  };

  // Process uploaded file with specific OCR engine
  const handleFileProcessWithEngine = async (fileId: string, engine: 'tesseract' | 'parallel' | 'receipt') => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file || !file.documentId) {
      console.error('❌ Cannot process file: missing document ID', file);
      return;
    }

    console.log(`🔄 Processing document ID ${file.documentId} with ${engine} engine for file "${file.name}"`);

    setUploadedFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, status: 'processing', processingProgress: 0 }
        : f
    ));

    try {
      let result;
      let endpoint;
      
      // Choose the appropriate endpoint based on engine selection
      switch (engine) {
        case 'tesseract':
          // Use regular processing (which uses Enhanced Tesseract + DeepSeek)
          endpoint = `/api/documents/${file.documentId}/process`;
          break;
        case 'parallel':
          // Use parallel processing (ABBYY + Tesseract comparison)
          endpoint = `/api/documents/${file.documentId}/process-parallel`;
          break;
        case 'receipt':
          // Use Vietnamese receipt-specific processing
          endpoint = `/api/documents/${file.documentId}/process-receipt`;
          break;
        default:
          endpoint = `/api/documents/${file.documentId}/process`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`${engine} processing failed`);
      }

      result = await response.json();

      setUploadedFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { 
              ...f, 
              status: 'completed', 
              processingProgress: 100,
              result: {
                extractedText: result.document?.extractedText || result.extractedText || '',
                confidence: result.document?.confidence || result.confidence || 0,
                pageCount: result.document?.structuredData?.pageCount || result.pageCount || 1,
                wordCount: (result.document?.extractedText || result.extractedText || '').split(/\s+/).filter((word: string) => word.length > 0).length,
                characterCount: (result.document?.extractedText || result.extractedText || '').length,
                processingEngine: engine,
                parallelResults: result.parallelResults
              }
            }
          : f
      ));

      // Show success notification with engine-specific message
      const messages = {
        tesseract: `Enhanced Tesseract + DeepSeek processing completed successfully`, 
        parallel: `Parallel processing completed. Best engine: ${result.parallelResults?.bestPlatform || 'unknown'}`,
        receipt: `Vietnamese receipt processing completed successfully`
      };

      toast({
        title: "OCR Processing Complete",
        description: messages[engine as keyof typeof messages] || `${engine} processing completed successfully`,
      });

    } catch (error) {
      console.error(`❌ ${engine} processing failed for document ID`, file.documentId, error);
      setUploadedFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { ...f, status: 'error', error: `${engine} processing failed` }
          : f
      ));

      toast({
        title: `${engine.toUpperCase()} Processing Failed`,
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
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

    console.log('📄 Opening viewer for document:', {
      fileId: file.id,
      documentId: correspondingDocument.id,
      fileName: file.name,
      fileType: file.type
    });

    // For both images and PDFs, use the unified document viewer
    if (file.result) {
      const result: OCRResult = {
        id: correspondingDocument.id.toString(),
        fileName: file.name,
        fileType: file.type,
        extractedText: file.result.extractedText,
        confidence: file.result.confidence,
        pageCount: file.result.pageCount || 1,

        imageUrl: `/api/documents/${correspondingDocument.id}/thumbnail`,
        lowConfidenceWords: []
      };
      setSelectedResult(result);
      setShowViewer(true);
    } else {
      // Fallback to PDF viewer for documents without results
      setSelectedFileForViewer(file);
      setCurrentDocument(correspondingDocument);
      setShowPDFViewer(true);
    }
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

  // Filter documents by search query and date
  const filteredDocuments = documents.filter((doc: any) => {
    // Search filter
    const searchMatch = searchQuery === '' || 
      (doc.originalName || doc.filename || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.extractedText || '').toLowerCase().includes(searchQuery.toLowerCase());

    // Date filter - use processing completion date (when OCR was actually completed)
    // Priority: processingCompletedAt > processedAt > uploadedAt > createdAt
    const docDate = new Date(doc.processingCompletedAt || doc.processedAt || doc.uploadedAt || doc.createdAt);
    const now = new Date();
    let dateMatch = true;

    // Debug logging for date filtering
    console.log('🗓️ Date filtering debug:', {
      docId: doc.id,
      docName: doc.originalName || doc.filename,
      dateFilter,
      processingCompletedAt: doc.processingCompletedAt,
      processedAt: doc.processedAt,
      uploadedAt: doc.uploadedAt,
      createdAt: doc.createdAt,
      selectedDate: docDate.toISOString(),
      selectedDateLocal: docDate.toLocaleDateString(),
      todayLocal: now.toLocaleDateString()
    });

    if (dateFilter !== 'all') {
      // Convert document date to local date string for comparison to avoid timezone issues
      const docDateLocal = new Date(docDate.getFullYear(), docDate.getMonth(), docDate.getDate());
      const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      switch (dateFilter) {
        case 'today':
          // Compare only the date parts (year, month, day) ignoring time
          dateMatch = docDateLocal.getTime() === nowLocal.getTime();
          console.log('🗓️ Today filter check:', {
            docDate: docDate.toISOString(),
            docDateLocal: docDateLocal.toDateString(),
            nowLocal: nowLocal.toDateString(),
            docDateLocalTime: docDateLocal.getTime(),
            nowLocalTime: nowLocal.getTime(),
            matches: dateMatch
          });
          break;
        case 'week':
          const weekAgoLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
          dateMatch = docDateLocal >= weekAgoLocal;
          break;
        case 'month':
          const monthAgoLocal = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          dateMatch = docDateLocal >= monthAgoLocal;
          break;
      }
    }

    return searchMatch && dateMatch;
  });

  // Reset current page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFilter]);

  // Paginated documents
  const paginatedDocuments = filteredDocuments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Document selector state for PDF viewer
  const [selectedDocument, setSelectedDocument] = useState<DocumentData | null>(null);

  // Quick actions
  const handleQuickView = (file: UploadedFile) => {
    const correspondingDocument = documents.find((doc: any) => doc.originalName === file.name);

    if (!correspondingDocument) {
      toast({
        title: "Document not found",
        description: "Could not find the corresponding document on the server.",
        variant: "destructive",
      });
      return;
    }
    const result: OCRResult = {
      id: correspondingDocument.id.toString(),
      fileName: file.name,
      fileType: file.type,
      extractedText: file.result?.extractedText || '',
      confidence: file.result?.confidence || 0,
      pageCount: file.result?.pageCount || 1,
      imageUrl: `/api/documents/${correspondingDocument.id}/thumbnail`,
      lowConfidenceWords: []
    };
    setSelectedResult(result);
    setShowViewer(true);
  };

  const handleQuickCopy = (file: UploadedFile) => {
    if (file.result?.extractedText) {
      navigator.clipboard.writeText(file.result.extractedText);
      toast({
        title: "Text copied",
        description: "Extracted text copied to clipboard.",
      });
    } else {
      toast({
        title: "No text available",
        description: "No text extracted from this file yet.",
        variant: "destructive",
      });
    }
  };

  const handleQuickExport = (file: UploadedFile) => {
    const correspondingDocument = documents.find((doc: any) => doc.originalName === file.name);

    if (!correspondingDocument) {
      toast({
        title: "Document not found",
        description: "Could not find the corresponding document on the server.",
        variant: "destructive",
      });
      return;
    }
    window.open(`/api/documents/${correspondingDocument.id}/export?format=txt`, '_blank');
  };

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
          <TabsList className="grid w-full grid-cols-6">
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
            <TabsTrigger value="training" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Training
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
                  onFileProcessWithEngine={handleFileProcessWithEngine}
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
                        <p className="text-2xl font-bold text-blue-600">{documents.filter((d: any) => {
                          const docDate = new Date(d.processingCompletedAt || d.processedAt || d.uploadedAt || d.createdAt);
                          const today = new Date();
                          const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                          const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
                          return docDate >= todayStart && docDate < todayEnd;
                        }).length}</p>
                        <p className="text-xs text-gray-500">Processed Today</p>
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
          <div className="flex flex-col space-y-4">
            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Processing Results</h2>
                <p className="text-sm sm:text-base text-gray-600">
                  View and manage processed documents ({filteredDocuments?.length || 0} of {documents?.length || 0} total)
                </p>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
                <Button onClick={() => fetchDocuments()} variant="outline" size="sm">
                      <RefreshCw className="w-4 h-4" />
                      Refresh
                    </Button>
                    <Button 
                      onClick={() => setAutoRefresh(!autoRefresh)} 
                      variant={autoRefresh ? "default" : "outline"} 
                      size="sm"
                    >
                      {autoRefresh ? "Stop Auto-Refresh" : "Start Auto-Refresh"}
                    </Button>
                <Select value={pageSize.toString()} onValueChange={(value) => {
                  setPageSize(Number(value));
                  setCurrentPage(1);
                }}>
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 per page</SelectItem>
                    <SelectItem value="10">10 per page</SelectItem>
                    <SelectItem value="20">20 per page</SelectItem>
                    <SelectItem value="50">50 per page</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="text-xs sm:text-sm text-center">
                  Page {currentPage} of {Math.ceil((filteredDocuments?.length || 0) / pageSize)}
                </Badge>
              </div>
            </div>

            {/* Search and Filter Controls */}
            <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-4 p-4 bg-gray-50 rounded-lg border">
              <div className="flex items-center space-x-2 flex-1">
                <Search className="h-4 w-4 text-gray-500" />
                <Input
                  placeholder="Search by filename or extracted text..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-white"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchQuery('')}
                    className="px-2"
                  >
                    ```python
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <Select value={dateFilter} onValueChange={(value: any) => setDateFilter(value)}>
                  <SelectTrigger className="w-full sm:w-40 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All dates</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This week</SelectItem>
                    <SelectItem value="month">This month</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(searchQuery || dateFilter !== 'all') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setDateFilter('all');
                  }}
                  className="whitespace-nowrap"
                >
                  Clear filters
                </Button>
              )}
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
          ) : filteredDocuments && filteredDocuments.length > 0 ? (
            <>
              <div className="space-y-4">
                {paginatedDocuments
                  .sort((a: any, b: any) => {
                    const dateA = new Date(a.processingCompletedAt || a.processedAt || a.uploadedAt).getTime();
                    const dateB = new Date(b.processingCompletedAt || b.processedAt || b.uploadedAt).getTime();
                    return dateB - dateA;
                  })
                  .map((doc: any) => (
                  <Card key={doc.id} className="border border-gray-200 hover:border-blue-300 transition-colors">
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex flex-col space-y-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
                        <div className="flex-1">
                          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 mb-2">
                            <div className="flex items-center space-x-2">
                              <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                              <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{doc.originalName || doc.filename}</h3>
                            </div>
                            <Badge 
                              variant={doc.processingStatus === 'completed' ? 'default' : 
                                     doc.processingStatus === 'processing' ? 'secondary' : 'destructive'}
                              className="text-xs w-fit"
                            >
                              {doc.processingStatus || 'pending'}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 text-sm text-gray-600 mb-4">
                            <div>
                              <span className="font-medium">Processed:</span>
                              <div>
                                {doc.processingCompletedAt 
                                  ? new Date(doc.processingCompletedAt).toLocaleDateString()
                                  : doc.processedAt 
                                    ? new Date(doc.processedAt).toLocaleDateString()
                                    : new Date(doc.uploadedAt).toLocaleDateString()
                                }
                              </div>
                            </div>
                            {(doc.processingCompletedAt || doc.processedAt) && (
                              <div>
                                <span className="font-medium">Process Time:</span>
                                <div>
                                  {new Date(doc.processingCompletedAt || doc.processedAt).toLocaleTimeString()}
                                </div>
                              </div>
                            )}
                            <div>
                              <span className="font-medium">Type:</span>
                              <div className="capitalize">{doc.mimeType?.includes('pdf') ? 'PDF' : 'Image'}</div>
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

                          {/* Progress Tracker */}
                          {processingDocuments.has(doc.id.toString()) && (
                            <OCRProgressTracker
                              documentId={doc.id.toString()}
                              isProcessing={true}
                              onComplete={(success, details) => {
                                console.log(`📊 Progress completed for document ${doc.id}:`, { success, details });
                                setProcessingDocuments(prev => {
                                  const updated = new Set(prev);
                                  updated.delete(doc.id.toString());
                                  return updated;
                                });
                                if (success) {
                                  setCompletedDocuments(prev => new Set(prev.add(doc.id.toString())));
                                  queryClient.invalidateQueries({ queryKey: ['documents'] });
                                }
                              }}
                              className="mb-4"
                            />
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:space-x-2 sm:space-y-0 space-y-2 sm:ml-4 mt-4 sm:mt-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs sm:text-sm w-full sm:w-auto"
                            onClick={() => {
                              console.log('🔍 Opening viewer for document:', {
                                id: doc.id,
                                originalName: doc.originalName,
                                filename: doc.filename,
                                mimeType: doc.mimeType,
                                processingStatus: doc.processingStatus,
                                hasExtractedText: !!doc.extractedText
                              });
                              setSelectedResult({
                                id: doc.id.toString(),
                                fileName: doc.originalName || doc.filename,
                                fileType: doc.mimeType?.includes('pdf') ? 'pdf' : 'image',
                                extractedText: doc.extractedText || '',
                                confidence: (doc.confidence || 0), // Keep as decimal for EnhancedOCRViewer
                                pageCount: (() => {
                                  try {
                                    const structured = doc.structuredData ? JSON.parse(doc.structuredData) : {};
                                    return structured.pageCount || 1;
                                  } catch {
                                    return 1;
                                  }
                                })(),
                                imageUrl: `/api/documents/${doc.id}/thumbnail`,
                                lowConfidenceWords: []
                              });
                              setShowViewer(true);
                            }}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            View Details
                          </Button>
                            {doc.mimeType?.includes('pdf') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                console.log('📄 Opening PDF viewer for document:', {
                                  id: doc.id,
                                  originalName: doc.originalName,
                                  mimeType: doc.mimeType
                                });
                                setSelectedDocument({
                                  id: doc.id.toString(),
                                  fileName: doc.originalName || doc.filename,
                                  fileType: 'pdf',
                                  extractedText: doc.extractedText || '',
                                  confidence: (doc.confidence || 0),
                                  pageCount: (() => {
                                    try {
                                      const structured = doc.structuredData ? JSON.parse(doc.structuredData) : {};
                                      return structured.pageCount || 1;
                                    } catch {
                                      return 1;
                                    }
                                  })(),
                                  documentId: doc.id,
                                  imageUrl: `/api/documents/${doc.id}/thumbnail`
                                });
                                setShowPDFViewer(true);
                              }}
                              className="whitespace-nowrap"
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              PDF Viewer
                            </Button>
                          )}

                          {/* Optimized OCR Processing Button */}
                          {!processingDocuments.has(doc.id.toString()) && doc.processingStatus !== 'processing' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-700"
                              onClick={async () => {
                                console.log(`🚀 Starting optimized OCR processing for document ${doc.id}`);
                                try {
                                  await processMutation.mutateAsync(doc.id.toString());
                                } catch (error) {
                                  console.error('Optimized processing failed:', error);
                                }
                              }}
                              disabled={processMutation.isPending}
                            >
                              <Zap className="h-4 w-4 mr-2" />
                              {processMutation.isPending ? 'Processing...' : 'Process OCR'}
                            </Button>
                          )}

                          {/* Parallel OCR Processing Button (ABBYY + Tesseract) */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const response = await fetch(`/api/documents/${doc.id}/process-parallel`, {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                });
                                
                                if (!response.ok) {
                                  throw new Error('Parallel processing failed');
                                }
                                
                                const result = await response.json();
                                queryClient.invalidateQueries({ queryKey: ['documents'] });
                                
                                toast({
                                  title: "Parallel OCR completed",
                                  description: `Best platform: ${result.parallelResults?.bestPlatform}. Processing time: ${Math.round(result.parallelResults?.processingTime || 0)}ms`,
                                });
                              } catch (error) {
                                toast({
                                  title: "Parallel processing failed",
                                  description: error instanceof Error ? error.message : 'Unknown error',
                                  variant: "destructive",
                                });
                              }
                            }}
                            className="whitespace-nowrap bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600"
                          >
                            <Layers className="h-4 w-4 mr-2" />
                            Parallel OCR
                          </Button>

                          {/* Vietnamese Receipt OCR Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const response = await fetch(`/api/documents/${doc.id}/process-receipt`, {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                });

                                if (response.ok) {
                                  // Refresh documents list to show updated processing results
                                  queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
                                } else {
                                  console.error('Receipt processing failed');
                                }
                              } catch (error) {
                                console.error('Receipt processing error:', error);
                              }
                            }}
                            className="whitespace-nowrap"
                            disabled={doc.status === 'processing'}
                          >
                            <span className="text-lg mr-1">🧾</span>
                            Receipt OCR
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Pagination Controls */}
              {filteredDocuments.length > pageSize && (
                <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 border-t pt-6">
                  <div className="text-xs sm:text-sm text-gray-600 text-center sm:text-left">
                    Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredDocuments.length)} of {filteredDocuments.length} results
                    {searchQuery || dateFilter !== 'all' ? ` (filtered from ${documents.length} total)` : ''}
                  </div>

                  <div className="flex items-center justify-center space-x-1 sm:space-x-2">
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

                    <span className="text-xs sm:text-sm font-medium px-2 sm:px-3 py-1 bg-gray-100 rounded">
                      {currentPage}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredDocuments.length / pageSize), prev + 1))}
                      disabled={currentPage >= Math.ceil(filteredDocuments.length / pageSize)}
                      className="p-2"
                    >
                                            <ChevronRight className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.ceil(filteredDocuments.length / pageSize))}
                      disabled={currentPage >= Math.ceil(filteredDocuments.length / pageSize)}
                      className="p-2"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : documents && documents.length > 0 ? (
            <Card className="border-dashed border-2 border-gray-300">
              <CardContent className="p-12 text-center">
                <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Results Found</h3>
                <p className="text-gray-600 mb-4">
                  No documents match your current search criteria.
                </p>
                <Button 
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setDateFilter('all');
                  }}
                >
                  Clear Filters
                </Button>
              </CardContent>
            </Card>
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

        {/* Training Tab */}
        <TabsContent value="training" className="space-y-6">
          <TesseractTrainingInterface />
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
          <UnifiedDocumentViewer
            document={{
              id: selectedResult.id,
              fileName: selectedResult.fileName,
              fileType: selectedResult.fileType,
              extractedText: selectedResult.extractedText,
              confidence: selectedResult.confidence,
              pageCount: selectedResult.pageCount,
              imageUrl: selectedResult.imageUrl
            }}
            onTextEdit={handleTextEdit}
            onExport={handleExport}
            onClose={() => setShowViewer(false)}
            mode="modal"
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
     {/* Document Details Modal */}
        {selectedDocument && (
          <Dialog open={showViewer} onOpenChange={setShowViewer}>
            <DialogContent className="max-w-7xl h-[90vh] p-0 overflow-hidden">
              <div className="h-full w-full">
                <UnifiedDocumentViewer
                  document={selectedDocument}
                  onTextEdit={handleTextEdit}
                  onExport={handleExport}
                  onClose={() => setShowViewer(false)}
                  mode="modal"
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
  </div>
);
}