import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Play, 
  Pause, 
  Square, 
  SkipForward,
  RefreshCw,
  FileText,
  Image,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Zap,
  TrendingUp,
  Activity
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BatchJob {
  id: string;
  filename: string;
  fileSize: number;
  fileType: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'paused';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  ocrResult?: {
    text: string;
    confidence: number;
    language: string;
  };
  error?: string;
  priority: 'low' | 'normal' | 'high';
}

interface BatchProcessingStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  totalProcessingTime: number;
  throughputPerHour: number;
}

interface BatchOCRProcessorProps {
  files: File[];
  onJobComplete: (job: BatchJob) => void;
  onAllJobsComplete: (stats: BatchProcessingStats) => void;
}

export function BatchOCRProcessor({ files, onJobComplete, onAllJobsComplete }: BatchOCRProcessorProps) {
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [concurrentProcessing, setConcurrentProcessing] = useState(2);
  const [processingQueue, setProcessingQueue] = useState<string[]>([]);
  const [stats, setStats] = useState<BatchProcessingStats>({
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    averageProcessingTime: 0,
    totalProcessingTime: 0,
    throughputPerHour: 0,
  });
  const { toast } = useToast();

  // Initialize jobs from files
  useEffect(() => {
    const initialJobs: BatchJob[] = files.map((file, index) => ({
      id: `job-${Date.now()}-${index}`,
      filename: file.name,
      fileSize: file.size,
      fileType: file.type,
      status: 'queued',
      progress: 0,
      priority: 'normal',
    }));
    
    setJobs(initialJobs);
    setStats(prev => ({ ...prev, totalJobs: initialJobs.length }));
  }, [files]);

  // Process next job in queue
  const processNextJob = useCallback(async () => {
    const queuedJob = jobs.find(job => job.status === 'queued');
    if (!queuedJob || isPaused) return;

    // Check if we can process more jobs concurrently
    const processingJobs = jobs.filter(job => job.status === 'processing');
    if (processingJobs.length >= concurrentProcessing) return;

    // Start processing the job
    setJobs(prev => prev.map(job => 
      job.id === queuedJob.id 
        ? { ...job, status: 'processing', startTime: new Date() }
        : job
    ));

    try {
      // Find the original file
      const fileIndex = files.findIndex(f => f.name === queuedJob.filename);
      const file = files[fileIndex];
      
      if (!file) {
        throw new Error('File not found');
      }

      // Create FormData for upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('language', 'auto');
      formData.append('enableDeepSeek', 'true');

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setJobs(prev => prev.map(job => 
          job.id === queuedJob.id && job.status === 'processing'
            ? { ...job, progress: Math.min(job.progress + Math.random() * 15, 95) }
            : job
        ));
      }, 1000);

      // Upload and process file
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      clearInterval(progressInterval);

      // Update job as completed
      const completedJob: BatchJob = {
        ...queuedJob,
        status: 'completed',
        progress: 100,
        endTime: new Date(),
        ocrResult: {
          text: result.extractedText || '',
          confidence: result.confidence || 0,
          language: result.language || 'en',
        },
      };

      setJobs(prev => prev.map(job => 
        job.id === queuedJob.id ? completedJob : job
      ));

      onJobComplete(completedJob);

      // Update stats
      setStats(prev => ({
        ...prev,
        completedJobs: prev.completedJobs + 1,
      }));

    } catch (error) {
      console.error('Job processing error:', error);
      
      const failedJob: BatchJob = {
        ...queuedJob,
        status: 'failed',
        endTime: new Date(),
        error: error instanceof Error ? error.message : 'Processing failed',
      };

      setJobs(prev => prev.map(job => 
        job.id === queuedJob.id ? failedJob : job
      ));

      setStats(prev => ({
        ...prev,
        failedJobs: prev.failedJobs + 1,
      }));

      toast({
        title: "Job failed",
        description: `Failed to process ${queuedJob.filename}`,
        variant: "destructive",
      });
    }
  }, [jobs, files, concurrentProcessing, isPaused, onJobComplete, toast]);

  // Main processing loop
  useEffect(() => {
    if (!isProcessing || isPaused) return;

    const interval = setInterval(() => {
      processNextJob();
      
      // Check if all jobs are complete
      const allJobsComplete = jobs.length > 0 && jobs.every(job => 
        job.status === 'completed' || job.status === 'failed'
      );
      
      if (allJobsComplete) {
        setIsProcessing(false);
        calculateFinalStats();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isProcessing, isPaused, processNextJob, jobs]);

  const calculateFinalStats = () => {
    const completedJobs = jobs.filter(job => job.status === 'completed');
    const processingTimes = completedJobs
      .filter(job => job.startTime && job.endTime)
      .map(job => (job.endTime!.getTime() - job.startTime!.getTime()) / 1000);

    const averageProcessingTime = processingTimes.length > 0 
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      : 0;

    const totalProcessingTime = processingTimes.reduce((a, b) => a + b, 0);
    const throughputPerHour = totalProcessingTime > 0 
      ? (completedJobs.length / totalProcessingTime) * 3600
      : 0;

    const finalStats: BatchProcessingStats = {
      ...stats,
      averageProcessingTime,
      totalProcessingTime,
      throughputPerHour,
    };

    setStats(finalStats);
    onAllJobsComplete(finalStats);
  };

  const startProcessing = () => {
    setIsProcessing(true);
    setIsPaused(false);
    toast({
      title: "Batch processing started",
      description: `Processing ${jobs.length} documents...`,
    });
  };

  const pauseProcessing = () => {
    setIsPaused(true);
    toast({
      title: "Processing paused",
      description: "You can resume processing at any time.",
    });
  };

  const resumeProcessing = () => {
    setIsPaused(false);
    toast({
      title: "Processing resumed",
      description: "Continuing with remaining documents.",
    });
  };

  const stopProcessing = () => {
    setIsProcessing(false);
    setIsPaused(false);
    // Reset processing jobs to queued
    setJobs(prev => prev.map(job => 
      job.status === 'processing' ? { ...job, status: 'queued', progress: 0 } : job
    ));
    toast({
      title: "Processing stopped",
      description: "All processing has been halted.",
    });
  };

  const retryFailedJobs = () => {
    setJobs(prev => prev.map(job => 
      job.status === 'failed' 
        ? { ...job, status: 'queued', progress: 0, error: undefined }
        : job
    ));
    setStats(prev => ({ ...prev, failedJobs: 0 }));
    toast({
      title: "Retrying failed jobs",
      description: "Failed jobs have been added back to the queue.",
    });
  };

  const setPriority = (jobId: string, priority: 'low' | 'normal' | 'high') => {
    setJobs(prev => prev.map(job => 
      job.id === jobId ? { ...job, priority } : job
    ));
    
    // Re-sort jobs by priority
    setJobs(prev => [...prev].sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    }));
  };

  const getStatusIcon = (status: BatchJob['status']) => {
    switch (status) {
      case 'queued': return <Clock className="h-4 w-4 text-gray-500" />;
      case 'processing': return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'paused': return <Pause className="h-4 w-4 text-yellow-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const overallProgress = jobs.length > 0 
    ? (stats.completedJobs + stats.failedJobs) / jobs.length * 100
    : 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-600" />
            Batch OCR Processor
          </div>
          <Badge variant="outline">
            {stats.completedJobs}/{jobs.length} Complete
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Processing Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!isProcessing ? (
              <Button onClick={startProcessing} disabled={jobs.length === 0}>
                <Play className="h-4 w-4 mr-2" />
                Start Processing
              </Button>
            ) : isPaused ? (
              <Button onClick={resumeProcessing}>
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            ) : (
              <Button onClick={pauseProcessing} variant="outline">
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
            )}
            
            <Button onClick={stopProcessing} variant="outline" disabled={!isProcessing}>
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
            
            {stats.failedJobs > 0 && (
              <Button onClick={retryFailedJobs} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Failed
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm">Concurrent Jobs:</label>
            <Select 
              value={concurrentProcessing.toString()} 
              onValueChange={(value) => setConcurrentProcessing(parseInt(value))}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="4">4</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm text-gray-500">{Math.round(overallProgress)}%</span>
          </div>
          <Progress value={overallProgress} className="w-full" />
        </div>

        {/* Processing Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{stats.totalJobs}</p>
            <p className="text-xs text-gray-600">Total Jobs</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{stats.completedJobs}</p>
            <p className="text-xs text-gray-600">Completed</p>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">{stats.failedJobs}</p>
            <p className="text-xs text-gray-600">Failed</p>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <p className="text-2xl font-bold text-purple-600">
              {stats.averageProcessingTime > 0 ? formatTime(stats.averageProcessingTime) : '--'}
            </p>
            <p className="text-xs text-gray-600">Avg Time</p>
          </div>
        </div>

        <Separator />

        {/* Job Queue */}
        <div className="space-y-3">
          <h3 className="font-medium">Processing Queue</h3>
          <ScrollArea className="h-80 w-full border rounded-md p-2">
            <div className="space-y-2">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className={`p-3 border rounded-lg ${
                    job.status === 'processing' ? 'border-blue-500 bg-blue-50' :
                    job.status === 'completed' ? 'border-green-500 bg-green-50' :
                    job.status === 'failed' ? 'border-red-500 bg-red-50' :
                    'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(job.status)}
                      <div className="flex-1">
                        <p className="font-medium text-sm">{job.filename}</p>
                        <p className="text-xs text-gray-500">
                          {formatBytes(job.fileSize)} • {job.fileType}
                        </p>
                        {job.error && (
                          <p className="text-xs text-red-600 mt-1">{job.error}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Select
                        value={job.priority}
                        onValueChange={(value: 'low' | 'normal' | 'high') => 
                          setPriority(job.id, value)
                        }
                        disabled={job.status === 'processing' || job.status === 'completed'}
                      >
                        <SelectTrigger className="w-20 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Badge variant={
                        job.status === 'completed' ? 'default' :
                        job.status === 'failed' ? 'destructive' :
                        job.status === 'processing' ? 'secondary' :
                        'outline'
                      }>
                        {job.status}
                      </Badge>
                    </div>
                  </div>
                  
                  {(job.status === 'processing' || job.status === 'completed') && (
                    <div className="mt-2">
                      <Progress value={job.progress} className="w-full h-2" />
                    </div>
                  )}
                  
                  {job.ocrResult && (
                    <div className="mt-2 text-xs text-gray-600">
                      Confidence: {job.ocrResult.confidence}% • Language: {job.ocrResult.language}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
