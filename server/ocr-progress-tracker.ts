/**
 * OCR Progress Tracker
 * Provides real-time progress updates for OCR processing
 */

import { EventEmitter } from 'events';

export interface OCRProgressEvent {
  documentId: string;
  stage: 'initializing' | 'converting' | 'extracting' | 'reconstructing' | 'completing';
  progress: number; // 0-100
  currentStep: string;
  totalSteps: number;
  currentStepIndex: number;
  estimatedTimeRemaining?: number;
  processingSpeed?: string;
  details?: any;
}

export class OCRProgressTracker extends EventEmitter {
  private progressMap: Map<string, OCRProgressEvent> = new Map();
  private startTimes: Map<string, number> = new Map();
  
  constructor() {
    super();
    this.setMaxListeners(100); // Support many concurrent processes
  }

  startTracking(documentId: string, totalSteps: number = 5): void {
    const startTime = Date.now();
    this.startTimes.set(documentId, startTime);
    
    const initialProgress: OCRProgressEvent = {
      documentId,
      stage: 'initializing',
      progress: 0,
      currentStep: 'Initializing OCR process',
      totalSteps,
      currentStepIndex: 0,
      estimatedTimeRemaining: undefined,
      processingSpeed: 'Starting...'
    };
    
    this.progressMap.set(documentId, initialProgress);
    this.emit('progress', initialProgress);
    
    console.log(`📊 Started tracking OCR progress for document ${documentId}`);
  }

  updateProgress(
    documentId: string, 
    stage: OCRProgressEvent['stage'],
    currentStepIndex: number,
    currentStep: string,
    details?: any
  ): void {
    const existing = this.progressMap.get(documentId);
    if (!existing) {
      console.warn(`⚠️ No tracking found for document ${documentId}`);
      return;
    }

    const startTime = this.startTimes.get(documentId) || Date.now();
    const elapsed = Date.now() - startTime;
    const progress = Math.round((currentStepIndex / existing.totalSteps) * 100);
    
    // Calculate estimated time remaining
    const averageTimePerStep = elapsed / Math.max(currentStepIndex, 1);
    const remainingSteps = existing.totalSteps - currentStepIndex;
    const estimatedTimeRemaining = Math.round((remainingSteps * averageTimePerStep) / 1000);
    
    // Processing speed calculation
    const processingSpeed = currentStepIndex > 0 
      ? `${Math.round(currentStepIndex / (elapsed / 1000 * 60))} steps/min`
      : 'Calculating...';

    const updatedProgress: OCRProgressEvent = {
      ...existing,
      stage,
      progress: Math.min(progress, 100),
      currentStep,
      currentStepIndex,
      estimatedTimeRemaining,
      processingSpeed,
      details
    };

    this.progressMap.set(documentId, updatedProgress);
    this.emit('progress', updatedProgress);
    
    console.log(`📈 Progress ${documentId}: ${progress}% - ${currentStep} (ETA: ${estimatedTimeRemaining}s)`);
  }

  completeTracking(documentId: string, success: boolean = true, finalDetails?: any): void {
    const existing = this.progressMap.get(documentId);
    if (!existing) return;

    const startTime = this.startTimes.get(documentId) || Date.now();
    const totalTime = Math.round((Date.now() - startTime) / 1000);

    const finalProgress: OCRProgressEvent = {
      ...existing,
      stage: 'completing',
      progress: 100,
      currentStep: success ? 'OCR processing completed successfully' : 'OCR processing failed',
      currentStepIndex: existing.totalSteps,
      estimatedTimeRemaining: 0,
      processingSpeed: `Completed in ${totalTime}s`,
      details: { ...finalDetails, totalProcessingTime: totalTime, success }
    };

    this.progressMap.set(documentId, finalProgress);
    this.emit('progress', finalProgress);
    
    console.log(`✅ Completed tracking for ${documentId}: ${totalTime}s total`);
    
    // Clean up after 5 minutes
    setTimeout(() => {
      this.progressMap.delete(documentId);
      this.startTimes.delete(documentId);
    }, 5 * 60 * 1000);
  }

  getProgress(documentId: string): OCRProgressEvent | null {
    return this.progressMap.get(documentId) || null;
  }

  getAllProgress(): Map<string, OCRProgressEvent> {
    return new Map(this.progressMap);
  }

  // Server-Sent Events support
  createSSEResponse(documentId: string): string {
    const progress = this.getProgress(documentId);
    if (!progress) return '';
    
    return `data: ${JSON.stringify(progress)}\n\n`;
  }
}

export const ocrProgressTracker = new OCRProgressTracker();