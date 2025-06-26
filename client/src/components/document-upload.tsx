import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, FolderOpen, FileImage, FileText, CheckCircle, Loader2, Upload, AlertCircle, Clock, X, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/hooks/use-language";
import { ApiStatusIndicator } from "@/components/api-status-indicator";
import type { Document } from "@shared/schema";

interface DocumentUploadProps {
  documents: Document[];
  isLoading: boolean;
}

export function DocumentUpload({ documents, isLoading }: DocumentUploadProps) {
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, number>>(new Map());
  const [processingFiles, setProcessingFiles] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      // Simulate upload progress
      setUploadingFiles(prev => new Map(prev.set(file.name, 0)));
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadingFiles(prev => {
          const current = prev.get(file.name) || 0;
          if (current < 90) {
            return new Map(prev.set(file.name, current + 10));
          }
          return prev;
        });
      }, 200);
      
      try {
        const response = await apiRequest('POST', '/api/documents/upload', formData);
        clearInterval(progressInterval);
        setUploadingFiles(prev => new Map(prev.set(file.name, 100)));
        
        setTimeout(() => {
          setUploadingFiles(prev => {
            const newMap = new Map(prev);
            newMap.delete(file.name);
            return newMap;
          });
        }, 1000);
        
        return response.json();
      } catch (error) {
        clearInterval(progressInterval);
        setUploadingFiles(prev => {
          const newMap = new Map(prev);
          newMap.delete(file.name);
          return newMap;
        });
        throw error;
      }
    },
    onSuccess: (document: Document) => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      toast({
        title: t('uploadComplete'),
        description: `${document.originalName} ${t('uploadComplete').toLowerCase()}`,
      });
      // DO NOT start processing automatically to prevent multiple reopening
      // User must manually click "Process" button
    },
    onError: (error: Error) => {
      toast({
        title: t('uploadFailed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const processMutation = useMutation({
    mutationFn: async (documentId: number) => {
      setProcessingFiles(prev => new Set(prev.add(documentId)));
      
      const response = await apiRequest('POST', `/api/documents/${documentId}/process`, {
        useAdvanced: true // Always use DeepSeek for advanced processing
      });
      return response.json();
    },
    onSuccess: (_, documentId) => {
      setProcessingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(documentId);
        return newSet;
      });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      toast({
        title: t('completed'),
        description: t('processingDocument') + ' ' + t('completed').toLowerCase(),
      });
    },
    onError: (error: Error, documentId) => {
      setProcessingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(documentId);
        return newSet;
      });
      
      // Enhanced error handling for different scenarios
      const isApiQuotaError = error.message.includes('402') || error.message.includes('Insufficient Balance') || error.message.includes('quota exceeded');
      const isPdfError = error.message.includes('PDF');
      
      toast({
        title: isApiQuotaError ? 'API Quota Exceeded' : t('failed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: `${file.name} exceeds 10MB limit`,
          variant: "destructive",
        });
        return;
      }

      if (!['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'].includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: `${file.name} is not a supported format. Please use JPG, PNG, or PDF files.`,
          variant: "destructive",
        });
        return;
      }

      uploadMutation.mutate(file);
    });
  }, [uploadMutation, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/pdf': ['.pdf'],
    },
    multiple: true,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50';
      case 'processing':
        return 'bg-blue-50';
      case 'failed':
        return 'bg-red-50';
      default:
        return 'bg-gray-50';
    }
  };

  const getStatusIcon = (status: string, mimeType?: string) => {
    const fileIcon = mimeType === 'application/pdf' ? 
      <FileText className="text-red-600" size={16} /> : 
      <FileImage className="text-blue-600" size={16} />;

    switch (status) {
      case 'completed':
        return <CheckCircle className="text-green-600" size={16} />;
      case 'processing':
        return <Loader2 className="text-blue-500 animate-spin" size={16} />;
      case 'failed':
        return <AlertCircle className="text-red-500" size={16} />;
      default:
        return fileIcon;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getProcessingProgress = (doc: Document) => {
    if (doc.processingStatus === 'completed') return 100;
    if (doc.processingStatus === 'processing') return 65;
    if (doc.processingStatus === 'failed') return 0;
    return 0;
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold gov-dark">{t('uploadDocuments')}</h2>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="status-online"></div>
              <span className="text-sm text-gray-600">DeepSeek AI Ready</span>
            </div>
            <div className="bg-blue-100 px-3 py-1 rounded-full">
              <span className="text-xs font-medium text-blue-800">Advanced OCR</span>
            </div>
          </div>
        </div>

        {/* Upload Zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center upload-zone cursor-pointer transition-colors ${
            isDragActive ? 'border-gov-blue bg-blue-50' : 'border-gray-300'
          }`}
        >
          <input {...getInputProps()} />
          {uploadingFiles.size > 0 ? (
            <Loader2 className="mx-auto text-blue-500 mb-4 animate-spin" size={48} />
          ) : (
            <CloudUpload className="mx-auto text-gray-400 mb-4" size={48} />
          )}
          <h3 className="text-lg font-medium text-gray-700 mb-2">{t('uploadDocument')}</h3>
          <p className="text-sm text-gray-500 mb-4">
            {isDragActive ? t('dragDropFiles') : t('dragDropFiles')}
          </p>
          <p className="text-xs text-gray-400 mb-4">{t('supportedFormats')}: JPG, PNG, PDF • Max size: 10MB</p>
          
          {/* Enhanced file type support notification */}
          <div className="flex items-center justify-center space-x-6 mb-4">
            <div className="flex items-center space-x-2">
              <FileImage className="text-blue-500" size={20} />
              <span className="text-xs text-gray-600">Images</span>
            </div>
            <div className="flex items-center space-x-2">
              <FileText className="text-red-500" size={20} />
              <span className="text-xs text-gray-600">PDFs</span>
            </div>
          </div>
          
          {/* Upload Progress */}
          {uploadingFiles.size > 0 && (
            <div className="mb-4 space-y-2">
              {Array.from(uploadingFiles.entries()).map(([fileName, progress]) => (
                <div key={fileName} className="text-left">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="truncate">{fileName}</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              ))}
            </div>
          )}
          
          <Button 
            className="bg-gov-blue hover:bg-blue-700" 
            disabled={uploadingFiles.size > 0}
          >
            {uploadingFiles.size > 0 ? (
              <>
                <Loader2 className="mr-2 animate-spin" size={16} />
                {t('uploadProgress')}
              </>
            ) : (
              <>
                <FolderOpen className="mr-2" size={16} />
                {t('selectFiles')}
              </>
            )}
          </Button>
        </div>

        {/* Enhanced Error Handling for Failed Documents */}
        {documents.some(doc => doc.processingStatus === 'failed') && (
          <Alert className="mt-6 border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-700">
              <div className="space-y-2">
                <p className="font-medium">Processing Issues Detected</p>
                <p className="text-sm">
                  Some documents failed to process. This may be due to:
                </p>
                <ul className="text-sm list-disc list-inside space-y-1">
                  <li>API quota limitations for PDF processing</li>
                  <li>Poor image quality or unreadable text</li>
                  <li>Unsupported document formats</li>
                </ul>
                <p className="text-sm font-medium">
                  Recommendation: Convert PDFs to high-quality JPG or PNG images for optimal results.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* File Processing Queue */}
        {documents.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-medium gov-dark mb-4">Processing Queue</h3>
            
            <div className="space-y-3">
              {documents.map((doc) => (
                <div key={doc.id} className={`rounded-lg p-4 ${getStatusColor(doc.processingStatus)}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(doc.processingStatus, doc.mimeType)}
                      <div>
                        <div className="flex items-center space-x-2">
                          <p className="font-medium text-gray-800">{doc.originalName}</p>
                          <Badge variant="outline" className="text-xs">
                            {doc.mimeType === 'application/pdf' ? 'PDF' : 'Image'}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500">
                          {formatFileSize(doc.fileSize)} • {
                            doc.processingStatus === 'processing' ? (
                              doc.mimeType === 'application/pdf' ? 
                                'Extracting text from PDF...' : 
                                'Processing image...'
                            ) :
                            doc.processingStatus === 'completed' ? (
                              `Completed • ${typeof doc.structuredData === 'object' && doc.structuredData && (doc.structuredData as any)?.pageCount ? `${(doc.structuredData as any).pageCount} pages` : 'Single page'} processed`
                            ) :
                            doc.processingStatus === 'failed' ? 'Processing failed - try converting to image format' :
                            'Pending'
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {doc.processingStatus === 'processing' && (
                        <>
                          <div className="w-24">
                            <Progress value={getProcessingProgress(doc)} className="h-2" />
                          </div>
                          <span className="text-sm text-gray-600">{getProcessingProgress(doc)}%</span>
                        </>
                      )}
                      {doc.processingStatus === 'failed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => processMutation.mutate(doc.id)}
                          disabled={processingFiles.has(doc.id)}
                        >
                          <AlertCircle className="mr-1" size={12} />
                          Retry
                        </Button>
                      )}
                      {doc.processingStatus === 'completed' && (
                        <Button
                          variant="link"
                          size="sm"
                          className="gov-blue p-0 h-auto"
                          onClick={() => {
                            // Scroll to results section
                            document.querySelector('[data-results-section]')?.scrollIntoView({ behavior: 'smooth' });
                          }}
                        >
                          View Results
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
