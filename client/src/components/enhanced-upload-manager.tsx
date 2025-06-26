import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, File, Image, FileText, X, Play, Pause, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface UploadedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: 'image' | 'pdf';
  status: 'queued' | 'uploading' | 'processing' | 'completed' | 'error';
  uploadProgress: number;
  processingProgress: number;
  error?: string;  result?: {
    extractedText: string;
    confidence: number;
    pageCount?: number;
    pages?: Array<{
      pageNumber: number;
      text: string;
      confidence: number;
      imageUrl?: string;
    }>;
    wordCount?: number;
    characterCount?: number;
  };
}

interface EnhancedUploadManagerProps {
  onFileUpload: (files: File[]) => void;
  onFileRemove: (fileId: string) => void;
  onFileProcess: (fileId: string) => void;
  onFileCancel: (fileId: string) => void;
  onBatchUpload?: (files: File[]) => void;
  onViewResult?: (file: UploadedFile) => void;
  uploadedFiles: UploadedFile[];
  maxFileSize?: number;
  acceptedFileTypes?: string[];
}

export function EnhancedUploadManager({
  onFileUpload,
  onFileRemove,
  onFileProcess,
  onFileCancel,
  onBatchUpload,
  onViewResult,
  uploadedFiles,
  maxFileSize = 10 * 1024 * 1024, // 10MB
  acceptedFileTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
}: EnhancedUploadManagerProps) {
  const [activeTab, setActiveTab] = useState<'images' | 'pdfs'>('images');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false); // Prevent multiple processing

  const getAcceptedTypes = () => {
    if (activeTab === 'images') {
      return acceptedFileTypes.filter(type => type.startsWith('image/'));
    }
    return acceptedFileTypes.filter(type => type === 'application/pdf');
  };
  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Prevent duplicate processing by checking if files are already uploaded
    const validFiles = acceptedFiles.filter(file => {
      const isValidType = getAcceptedTypes().includes(file.type);
      const isValidSize = file.size <= maxFileSize;
      
      // Check if file is already in the upload list
      const isDuplicate = uploadedFiles.some(uf => 
        uf.name === file.name && uf.size === file.size
      );
      
      if (isDuplicate) {
        console.warn(`File ${file.name} is already uploaded, skipping...`);
        return false;
      }
      
      return isValidType && isValidSize;
    });
    
    if (validFiles.length > 0) {
      console.log(`Processing ${validFiles.length} new files for upload`);
      onFileUpload(validFiles);
    }
  }, [activeTab, maxFileSize, onFileUpload, uploadedFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: getAcceptedTypes().reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxSize: maxFileSize,
    multiple: true
  });
  const handleFileSelect = () => {
    if (isProcessing) {
      console.log('Already processing files, ignoring file select');
      return;
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isProcessing) {
      console.log('Already processing files, ignoring input change');
      return;
    }
    
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      setIsProcessing(true);
      onDrop(files);
      
      // Reset the input value to allow selecting the same file again if needed
      event.target.value = '';
      
      // Reset processing flag after a short delay
      setTimeout(() => setIsProcessing(false), 1000);
    }
  };

  const getStatusColor = (status: UploadedFile['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'processing': return 'bg-blue-500';
      case 'uploading': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: UploadedFile['status']) => {
    switch (status) {
      case 'queued': return 'Queued';
      case 'uploading': return 'Uploading';
      case 'processing': return 'Processing';
      case 'completed': return 'Completed';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  const filteredFiles = uploadedFiles.filter(file => 
    activeTab === 'images' ? file.type === 'image' : file.type === 'pdf'
  );

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'images' | 'pdfs')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="images" className="flex items-center gap-2">
                <Image className="h-4 w-4" />
                Images
              </TabsTrigger>
              <TabsTrigger value="pdfs" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                PDFs
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  isDragActive 
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950" 
                    : "border-gray-300 hover:border-gray-400"
                )}
              >
                <input {...getInputProps()} />
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={getAcceptedTypes().join(',')}
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                
                <div className="space-y-4">
                  <div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                    {activeTab === 'images' ? (
                      <Image className="h-6 w-6 text-blue-600" />
                    ) : (
                      <FileText className="h-6 w-6 text-blue-600" />
                    )}
                  </div>
                  
                  <div>
                    <p className="text-lg font-medium">
                      {isDragActive 
                        ? `Drop ${activeTab} here...` 
                        : `Drag & drop ${activeTab} here`
                      }
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      or click to select files
                    </p>
                  </div>
                    <div className="flex gap-2">
                    <Button onClick={handleFileSelect} variant="outline">
                      <Upload className="h-4 w-4 mr-2" />
                      Select {activeTab === 'images' ? 'Images' : 'PDFs'}
                    </Button>
                    
                    {onBatchUpload && (
                      <Button 
                        onClick={() => onBatchUpload(uploadedFiles.map(f => f.file))}
                        variant="outline"
                        disabled={uploadedFiles.length === 0}
                      >
                        Batch Process
                      </Button>
                    )}
                  </div>
                  
                  <p className="text-xs text-gray-400">
                    Max file size: {Math.round(maxFileSize / 1024 / 1024)}MB
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* File List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <File className="h-5 w-5" />
              Uploaded Files ({filteredFiles.length})
            </span>
            <Badge variant="secondary">
              {activeTab === 'images' ? 'Images' : 'PDFs'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredFiles.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No {activeTab} uploaded yet
              </div>
            ) : (
              filteredFiles.map((file) => (
                <div key={file.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-3 h-3 rounded-full",
                        getStatusColor(file.status)
                      )} />
                      <div>
                        <p className="font-medium truncate max-w-xs">{file.name}</p>
                        <p className="text-sm text-gray-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {getStatusText(file.status)}
                      </Badge>
                      
                      {file.status === 'queued' && (
                        <Button
                          size="sm"
                          onClick={() => onFileProcess(file.id)}
                          variant="outline"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      
                      {(file.status === 'uploading' || file.status === 'processing') && (
                        <Button
                          size="sm"
                          onClick={() => onFileCancel(file.id)}
                          variant="outline"
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                      )}
                      
                      {file.status === 'error' && (
                        <Button
                          size="sm"
                          onClick={() => onFileProcess(file.id)}
                          variant="outline"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      
                      <Button
                        size="sm"
                        onClick={() => onFileRemove(file.id)}
                        variant="destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Progress Bars */}
                  {file.status === 'uploading' && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Uploading...</span>
                        <span>{file.uploadProgress}%</span>
                      </div>
                      <Progress value={file.uploadProgress} />
                    </div>
                  )}
                  
                  {file.status === 'processing' && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Processing OCR...</span>
                        <span>{file.processingProgress}%</span>
                      </div>
                      <Progress value={file.processingProgress} />
                    </div>
                  )}
                    {/* OCR Result Summary - Clickable */}
                  {file.status === 'completed' && file.result && (
                    <div 
                      className="bg-green-50 dark:bg-green-950 p-4 rounded-lg border border-green-200 dark:border-green-800 cursor-pointer hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
                      onClick={() => onViewResult && onViewResult(file)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-green-800 dark:text-green-200">
                          ✅ OCR Processing Complete
                        </h4>
                        <Button size="sm" variant="outline" className="text-xs">
                          View Details
                        </Button>
                      </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div className="text-center p-2 bg-white dark:bg-gray-800 rounded">
                          <p className="font-bold text-blue-600">
                            {file.result.characterCount || file.result.extractedText.length}
                          </p>
                          <p className="text-gray-500">Characters</p>
                        </div>
                        <div className="text-center p-2 bg-white dark:bg-gray-800 rounded">
                          <p className="font-bold text-purple-600">
                            {file.result.wordCount || file.result.extractedText.split(/\s+/).filter(word => word.length > 0).length}
                          </p>
                          <p className="text-gray-500">Words</p>
                        </div>
                        <div className="text-center p-2 bg-white dark:bg-gray-800 rounded">
                          <p className="font-bold text-green-600">{Math.round(file.result.confidence * 100)}%</p>
                          <p className="text-gray-500">Confidence</p>
                        </div>
                        <div className="text-center p-2 bg-white dark:bg-gray-800 rounded">
                          <p className="font-bold text-orange-600">{file.result.pageCount || 1}</p>
                          <p className="text-gray-500">Pages</p>
                        </div>
                      </div>
                      
                      <div className="mt-3 pt-2 border-t border-green-200 dark:border-green-700">
                        <p className="text-xs text-green-700 dark:text-green-300 line-clamp-2">
                          <strong>Preview:</strong> {file.result.extractedText.substring(0, 120)}
                          {file.result.extractedText.length > 120 ? '...' : ''}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Error Message */}
                  {file.status === 'error' && file.error && (
                    <div className="bg-red-50 dark:bg-red-950 p-3 rounded-md">
                      <p className="text-sm text-red-800 dark:text-red-200">
                        ❌ {file.error}
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
