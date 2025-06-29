/**
 * Complete Training Pipeline for Vietnamese Tesseract Fine-tuning
 * 
 * This provides a simplified interface for users to improve Tesseract accuracy
 * using their own Vietnamese receipt and document data.
 */

import { tesseractTrainingSystem, TrainingData, TrainingConfig } from './tesseract-training-system';
import { storage } from './storage';
import * as fs from 'fs';
import * as path from 'path';

export interface TrainingSession {
  id: string;
  name: string;
  status: 'preparing' | 'training' | 'completed' | 'failed';
  documentsCount: number;
  accuracy?: number;
  createdAt: Date;
  completedAt?: Date;
  modelPath?: string;
}

export class TrainingPipeline {
  private sessions: Map<string, TrainingSession> = new Map();

  /**
   * Start a new training session using processed documents
   */
  async startTrainingSession(sessionName: string, documentIds: number[]): Promise<string> {
    const sessionId = `training_${Date.now()}`;
    
    const session: TrainingSession = {
      id: sessionId,
      name: sessionName,
      status: 'preparing',
      documentsCount: documentIds.length,
      createdAt: new Date()
    };
    
    this.sessions.set(sessionId, session);
    
    console.log(`🚀 Starting training session: ${sessionName}`);
    console.log(`📚 Using ${documentIds.length} documents for training`);
    
    // Run training in background
    this.runTrainingProcess(sessionId, documentIds).catch(error => {
      console.error(`Training session ${sessionId} failed:`, error);
      session.status = 'failed';
    });
    
    return sessionId;
  }

  private async runTrainingProcess(sessionId: string, documentIds: number[]): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      // Step 1: Prepare training data from documents
      console.log('📋 Preparing training data from processed documents...');
      const trainingData = await this.prepareTrainingDataFromDocuments(documentIds);
      
      await tesseractTrainingSystem.prepareTrainingData(trainingData);
      
      // Step 2: Generate box files
      console.log('📦 Generating box files for training...');
      await tesseractTrainingSystem.generateBoxFiles();
      
      // Step 3: Create LSTM training files
      console.log('🧠 Creating LSTM training data...');
      await tesseractTrainingSystem.createLSTMTrainingFiles();
      
      // Step 4: Start training
      session.status = 'training';
      console.log('🔧 Starting fine-tuning process...');
      
      const config: TrainingConfig = {
        language: 'vie',
        modelName: `vie_receipt_${sessionId}`,
        fontList: ['Arial', 'Times-Roman', 'DejaVu-Sans'],
        outputDir: path.join(process.cwd(), 'tesseract-training', 'output'),
        iterations: 100, // Reduced for faster training
        learningRate: 0.0001
      };
      
      const modelPath = await tesseractTrainingSystem.fineTuneModel(config);
      
      // Step 5: Evaluate model performance
      console.log('📊 Evaluating trained model...');
      const evaluation = await tesseractTrainingSystem.evaluateModel(trainingData.slice(0, 5)); // Use subset for evaluation
      
      // Complete session
      session.status = 'completed';
      session.completedAt = new Date();
      session.accuracy = evaluation.accuracy;
      session.modelPath = modelPath;
      
      console.log(`✅ Training session ${sessionId} completed successfully!`);
      console.log(`📈 Final accuracy: ${evaluation.accuracy.toFixed(2)}%`);
      
    } catch (error) {
      console.error(`❌ Training session ${sessionId} failed:`, error);
      session.status = 'failed';
    }
  }

  private async prepareTrainingDataFromDocuments(documentIds: number[]): Promise<TrainingData[]> {
    const trainingData: TrainingData[] = [];
    
    for (const docId of documentIds) {
      try {
        const document = await storage.getDocument(docId);
        if (!document || !document.extractedText) {
          console.warn(`Skipping document ${docId}: No extracted text available`);
          continue;
        }
        
        const imagePath = path.join(process.cwd(), 'uploads', document.filename);
        if (!fs.existsSync(imagePath)) {
          console.warn(`Skipping document ${docId}: Image file not found`);
          continue;
        }
        
        // Determine document type from structured data
        const structuredData = document.structuredData ? JSON.parse(document.structuredData) : {};
        const documentType = structuredData.isReceiptDocument ? 'receipt' : 'general';
        
        trainingData.push({
          imagePath,
          groundTruthText: document.extractedText,
          documentType: documentType as 'receipt' | 'invoice' | 'form' | 'general',
          confidence: document.confidence ? document.confidence * 100 : undefined
        });
        
      } catch (error) {
        console.error(`Failed to prepare training data for document ${docId}:`, error);
      }
    }
    
    console.log(`✅ Prepared ${trainingData.length} training samples`);
    return trainingData;
  }

  /**
   * Get training session status
   */
  getSessionStatus(sessionId: string): TrainingSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * List all training sessions
   */
  getAllSessions(): TrainingSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Install a trained model
   */
  async installModel(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'completed' || !session.modelPath) {
      throw new Error('Training session not completed or model not available');
    }
    
    console.log(`📦 Installing improved Vietnamese model from session ${sessionId}...`);
    await tesseractTrainingSystem.installImprovedModel(session.modelPath);
    console.log('✅ Model installed successfully!');
  }

  /**
   * Create a simple training workflow for users
   */
  async createSimpleTrainingWorkflow(): Promise<{
    steps: string[];
    requirements: string[];
    estimatedTime: string;
  }> {
    return {
      steps: [
        '1. Select documents with accurate OCR results (high confidence)',
        '2. Review and correct any OCR errors in the extracted text',
        '3. Start training session with selected documents',
        '4. Wait for training to complete (automatic process)',
        '5. Evaluate model performance on test data',
        '6. Install improved model if results are satisfactory'
      ],
      requirements: [
        'At least 10-20 documents with accurate ground truth text',
        'Documents should represent your typical receipt/document types',
        'Sufficient disk space for training data (500MB minimum)',
        'Tesseract training tools installed on system'
      ],
      estimatedTime: '15-30 minutes for 20 documents'
    };
  }

  /**
   * Validate documents for training suitability
   */
  async validateDocumentsForTraining(documentIds: number[]): Promise<{
    suitable: number[];
    unsuitable: Array<{
      id: number;
      reason: string;
    }>;
    recommendations: string[];
  }> {
    const suitable: number[] = [];
    const unsuitable: Array<{ id: number; reason: string }> = [];
    const recommendations: string[] = [];

    for (const docId of documentIds) {
      try {
        const document = await storage.getDocument(docId);
        
        if (!document) {
          unsuitable.push({ id: docId, reason: 'Document not found' });
          continue;
        }
        
        if (!document.extractedText || document.extractedText.length < 10) {
          unsuitable.push({ id: docId, reason: 'Insufficient extracted text' });
          continue;
        }
        
        if (document.confidence && document.confidence < 0.7) {
          unsuitable.push({ id: docId, reason: 'Low OCR confidence (< 70%)' });
          continue;
        }
        
        const imagePath = path.join(process.cwd(), 'uploads', document.filename);
        if (!fs.existsSync(imagePath)) {
          unsuitable.push({ id: docId, reason: 'Image file not accessible' });
          continue;
        }
        
        suitable.push(docId);
        
      } catch (error) {
        unsuitable.push({ id: docId, reason: `Validation error: ${error.message}` });
      }
    }

    // Generate recommendations
    if (suitable.length < 10) {
      recommendations.push('Consider adding more documents (minimum 10-20 recommended)');
    }
    
    if (unsuitable.length > suitable.length) {
      recommendations.push('Review and improve OCR quality of documents before training');
    }
    
    recommendations.push('Ensure selected documents represent your typical document types');
    recommendations.push('Review extracted text for accuracy before starting training');

    return { suitable, unsuitable, recommendations };
  }
}

export const trainingPipeline = new TrainingPipeline();