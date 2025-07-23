
import React, { useState, useEffect } from 'react';
import { X, Loader2, FileText, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProcessingFile {
  id: string;
  name: string;
  status: 'processing' | 'uploading' | 'queued';
  progress?: number;
  type?: 'image' | 'pdf';
}

interface ProcessingToastProps {
  processingFiles: ProcessingFile[];
  isAwayFromUploadPage: boolean;
  onDismiss?: () => void;
  autoHideDuration?: number;
}

export function ProcessingToast({
  processingFiles,
  isAwayFromUploadPage,
  onDismiss,
  autoHideDuration = 0, // 0 means no auto-hide
}: ProcessingToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Determine if toast should be shown
  const shouldShow = 
    isAwayFromUploadPage && 
    processingFiles.length > 0 && 
    !isDismissed;

  // Handle visibility with animation
  useEffect(() => {
    if (shouldShow) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
      // Reset dismissed state when conditions change
      if (!isAwayFromUploadPage || processingFiles.length === 0) {
        setIsDismissed(false);
      }
    }
  }, [shouldShow, isAwayFromUploadPage, processingFiles.length]);

  // Auto-hide functionality
  useEffect(() => {
    if (isVisible && autoHideDuration > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, autoHideDuration);

      return () => clearTimeout(timer);
    }
  }, [isVisible, autoHideDuration]);

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsVisible(false);
    onDismiss?.();
  };

  const getStatusIcon = (file: ProcessingFile) => {
    switch (file.status) {
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'uploading':
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />;
      case 'queued':
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'processing':
        return 'Processing...';
      case 'uploading':
        return 'Uploading...';
      case 'queued':
        return 'Queued';
      default:
        return 'Unknown';
    }
  };

  const truncateFileName = (name: string, maxLength: number = 30) => {
    if (name.length <= maxLength) return name;
    const extension = name.split('.').pop();
    const nameWithoutExt = name.substring(0, name.lastIndexOf('.'));
    const truncated = nameWithoutExt.substring(0, maxLength - extension!.length - 4) + '...';
    return `${truncated}.${extension}`;
  };

  if (!shouldShow && !isVisible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 transition-all duration-300 ease-in-out transform",
        isVisible 
          ? "translate-y-0 opacity-100 scale-100" 
          : "translate-y-2 opacity-0 scale-95 pointer-events-none"
      )}
      role="alert"
      aria-live="polite"
      aria-label="Files processing notification"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 max-w-sm w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Processing in Progress
            </h3>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Files List */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {processingFiles.map((file) => (
            <div 
              key={file.id} 
              className="flex items-center space-x-3 p-2 bg-gray-50 dark:bg-gray-700 rounded-md"
            >
              <div className="flex-shrink-0">
                {getStatusIcon(file)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {truncateFileName(file.name)}
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {getStatusText(file.status)}
                  </p>
                  {file.progress !== undefined && (
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                      {Math.round(file.progress)}%
                    </span>
                  )}
                </div>
                {/* Progress Bar */}
                {file.progress !== undefined && (
                  <div className="mt-1 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1">
                    <div
                      className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, file.progress))}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            {processingFiles.length} file{processingFiles.length !== 1 ? 's' : ''} still processing
          </p>
        </div>
      </div>
    </div>
  );
}
