import React, { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  Zap, 
  CheckCircle, 
  AlertCircle, 
  Activity,
  Timer
} from 'lucide-react';

interface ProgressEvent {
  documentId: string;
  stage: 'initializing' | 'converting' | 'extracting' | 'reconstructing' | 'completing';
  progress: number;
  currentStep: string;
  totalSteps: number;
  currentStepIndex: number;
  estimatedTimeRemaining?: number;
  processingSpeed?: string;
  details?: any;
}

interface OCRProgressTrackerProps {
  documentId: string;
  isProcessing: boolean;
  onComplete?: (success: boolean, details?: any) => void;
  className?: string;
}

const stageNames = {
  initializing: 'Initializing',
  converting: 'Converting PDF',
  extracting: 'Extracting Text',
  reconstructing: 'Enhancing Text',
  completing: 'Completing'
};

const stageIcons = {
  initializing: Activity,
  converting: Zap,
  extracting: Clock,
  reconstructing: Timer,
  completing: CheckCircle
};

export function OCRProgressTracker({ 
  documentId, 
  isProcessing, 
  onComplete, 
  className = '' 
}: OCRProgressTrackerProps) {
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isProcessing || !documentId) {
      return;
    }

    let eventSource: EventSource | null = null;
    let timeoutId: NodeJS.Timeout;

    const connectToProgressStream = () => {
      try {
        eventSource = new EventSource(`/api/documents/${documentId}/progress-stream`);
        
        eventSource.onopen = () => {
          console.log(`📡 Connected to progress stream for document ${documentId}`);
          setIsConnected(true);
          setError(null);
        };

        eventSource.onmessage = (event) => {
          try {
            const progressData: ProgressEvent = JSON.parse(event.data);
            console.log(`📊 Progress update:`, progressData);
            
            setProgress(progressData);
            
            // Call completion callback when processing is done
            if (progressData.stage === 'completing' && progressData.progress >= 100) {
              const success = progressData.details?.success !== false;
              
              // Force invalidate documents cache to ensure UI updates
              import('@/lib/queryClient').then(({ queryClient }) => {
                queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
                console.log('🔄 Force invalidated documents cache on completion');
              });
              
              onComplete?.(success, progressData.details);
              
              // Close connection after completion
              timeoutId = setTimeout(() => {
                eventSource?.close();
              }, 3000);
            }
          } catch (parseError) {
            console.error('Failed to parse progress data:', parseError);
          }
        };

        eventSource.onerror = (error) => {
          console.error('Progress stream error:', error);
          setIsConnected(false);
          setError('Connection lost. Retrying...');
          
          // Reconnect after a delay
          setTimeout(() => {
            if (isProcessing) {
              connectToProgressStream();
            }
          }, 5000);
        };

      } catch (connectionError) {
        console.error('Failed to connect to progress stream:', connectionError);
        setError('Failed to connect to progress updates');
      }
    };

    connectToProgressStream();

    // Cleanup function
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (eventSource) {
        eventSource.close();
        console.log(`📡 Closed progress stream for document ${documentId}`);
      }
    };
  }, [documentId, isProcessing, onComplete]);

  // Don't render if not processing
  if (!isProcessing || !progress) {
    return null;
  }

  const StageIcon = stageIcons[progress.stage];
  const stageName = stageNames[progress.stage];

  return (
    <Card className={`border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800 ${className}`}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <StageIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="font-medium text-blue-900 dark:text-blue-100">
              Processing Document
            </span>
          </div>
          <Badge 
            variant={isConnected ? "default" : "destructive"} 
            className="text-xs"
          >
            {isConnected ? 'Live' : 'Connecting...'}
          </Badge>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-700 dark:text-gray-300">
              {stageName} ({progress.currentStepIndex}/{progress.totalSteps})
            </span>
            <span className="font-medium text-blue-600 dark:text-blue-400">
              {Math.round(progress.progress)}%
            </span>
          </div>
          
          <Progress 
            value={progress.progress} 
            className="h-2 bg-blue-100 dark:bg-blue-900"
          />
        </div>

        {/* Current Step */}
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center space-x-2">
            <Activity className="h-4 w-4" />
            <span>{progress.currentStep}</span>
          </div>
        </div>

        {/* Performance Metrics */}
        {(progress.estimatedTimeRemaining !== undefined || progress.processingSpeed) && (
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-blue-200 dark:border-blue-800">
            {progress.estimatedTimeRemaining !== undefined && (
              <div className="flex items-center space-x-1">
                <Timer className="h-3 w-3" />
                <span>ETA: {progress.estimatedTimeRemaining}s</span>
              </div>
            )}
            {progress.processingSpeed && (
              <div className="flex items-center space-x-1">
                <Zap className="h-3 w-3" />
                <span>{progress.processingSpeed}</span>
              </div>
            )}
          </div>
        )}

        {/* Additional Details */}
        {progress.details && (
          <div className="text-xs text-gray-500 dark:text-gray-400 pt-1">
            {progress.details.pageCount && (
              <span>Pages: {progress.details.pageCount}</span>
            )}
            {progress.details.currentBatch && progress.details.totalBatches && (
              <span className="ml-2">
                Batch: {progress.details.currentBatch}/{progress.details.totalBatches}
              </span>
            )}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="flex items-center space-x-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}