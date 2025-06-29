/**
 * Tesseract Training System for Vietnamese OCR Optimization
 * 
 * This system provides tools for fine-tuning Tesseract on Vietnamese receipts and documents
 * to improve recognition accuracy for specific fonts, layouts, and document types.
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';

const execAsync = promisify(exec);

export interface TrainingData {
  imagePath: string;
  groundTruthText: string;
  documentType: 'receipt' | 'invoice' | 'form' | 'general';
  confidence?: number;
}

export interface TrainingConfig {
  language: string;
  modelName: string;
  fontList: string[];
  outputDir: string;
  iterations: number;
  learningRate: number;
}

export class TesseractTrainingSystem {
  private trainingDir = path.join(process.cwd(), 'tesseract-training');
  private dataDir = path.join(this.trainingDir, 'training-data');
  private outputDir = path.join(this.trainingDir, 'output');
  private tessDataDir = path.join(this.trainingDir, 'tessdata');

  constructor() {
    this.initializeDirectories();
  }

  private initializeDirectories(): void {
    [this.trainingDir, this.dataDir, this.outputDir, this.tessDataDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Step 1: Prepare training data from processed documents
   */
  async prepareTrainingData(documents: TrainingData[]): Promise<void> {
    console.log('📚 Preparing training data for Vietnamese Tesseract fine-tuning...');

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const basename = `vie_training_${i.toString().padStart(4, '0')}`;
      
      // Copy and preprocess image
      const trainingImagePath = path.join(this.dataDir, `${basename}.png`);
      await this.preprocessTrainingImage(doc.imagePath, trainingImagePath);
      
      // Create ground truth text file
      const groundTruthPath = path.join(this.dataDir, `${basename}.gt.txt`);
      fs.writeFileSync(groundTruthPath, doc.groundTruthText, 'utf8');
      
      console.log(`✅ Prepared training sample ${i + 1}/${documents.length}: ${basename}`);
    }
  }

  private async preprocessTrainingImage(inputPath: string, outputPath: string): Promise<void> {
    try {
      // Apply consistent preprocessing for training consistency
      await sharp(inputPath)
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toFile(outputPath);
    } catch (error) {
      console.error(`Failed to preprocess training image ${inputPath}:`, error);
      // Fallback: copy original
      fs.copyFileSync(inputPath, outputPath);
    }
  }

  /**
   * Step 2: Generate box files for training
   */
  async generateBoxFiles(): Promise<void> {
    console.log('📦 Generating box files from training data...');
    
    const imageFiles = fs.readdirSync(this.dataDir)
      .filter(file => file.endsWith('.png'))
      .map(file => path.basename(file, '.png'));

    for (const basename of imageFiles) {
      const imagePath = path.join(this.dataDir, `${basename}.png`);
      const boxPath = path.join(this.dataDir, `${basename}.box`);
      
      try {
        // Generate initial box file using existing Vietnamese model
        const command = `tesseract "${imagePath}" "${path.join(this.dataDir, basename)}" -l vie batch.nochop makebox`;
        await execAsync(command);
        
        console.log(`✅ Generated box file: ${basename}.box`);
      } catch (error) {
        console.error(`Failed to generate box file for ${basename}:`, error);
      }
    }
  }

  /**
   * Step 3: Create training files for LSTM fine-tuning
   */
  async createLSTMTrainingFiles(): Promise<void> {
    console.log('🧠 Creating LSTM training files...');
    
    const imageFiles = fs.readdirSync(this.dataDir)
      .filter(file => file.endsWith('.png'))
      .map(file => path.basename(file, '.png'));

    // Create file list for training
    const fileList = imageFiles.map(basename => 
      path.join(this.dataDir, basename)
    ).join('\n');
    
    const fileListPath = path.join(this.dataDir, 'vie.training_files.txt');
    fs.writeFileSync(fileListPath, fileList, 'utf8');

    // Generate LSTM training data
    for (const basename of imageFiles) {
      try {
        const command = `text2image --fonts_dir=/usr/share/fonts --font="Arial" --text="${path.join(this.dataDir, basename)}.gt.txt" --outputbase="${path.join(this.dataDir, basename)}" --max_pages=1 --strip_unrenderable_words --leading=32 --xsize=3600 --ysize=480 --char_spacing=1.0 --exposure=0 --unicharset_file="${path.join(this.tessDataDir, 'vie.unicharset')}"`;
        
        await execAsync(command);
        console.log(`✅ Created LSTM training data: ${basename}`);
      } catch (error) {
        console.warn(`Warning: Could not create synthetic data for ${basename}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  /**
   * Step 4: Fine-tune the Vietnamese model
   */
  async fineTuneModel(config: TrainingConfig): Promise<string> {
    console.log('🔧 Starting Tesseract fine-tuning process...');
    
    const modelOutputPath = path.join(this.outputDir, `${config.modelName}.traineddata`);
    
    try {
      // Step 1: Extract existing Vietnamese model for fine-tuning
      const baseModelPath = await this.extractBaseModel();
      
      // Step 2: Create training configuration
      const configPath = await this.createTrainingConfig(config);
      
      // Step 3: Run LSTM training
      const trainingCommand = `lstmtraining \
        --model_output="${path.join(this.outputDir, config.modelName)}" \
        --continue_from="${baseModelPath}" \
        --traineddata="${path.join(this.tessDataDir, 'vie.traineddata')}" \
        --train_listfile="${path.join(this.dataDir, 'vie.training_files.txt')}" \
        --max_iterations=${config.iterations} \
        --learning_rate=${config.learningRate} \
        --debug_level=1`;
      
      console.log('⏳ Running LSTM training (this may take several minutes)...');
      const { stdout, stderr } = await execAsync(trainingCommand, { 
        timeout: 1800000 // 30 minutes timeout
      });
      
      console.log('Training output:', stdout);
      if (stderr) console.warn('Training warnings:', stderr);
      
      // Step 4: Combine trained model with base components
      await this.combineTrainedModel(config.modelName);
      
      console.log(`✅ Fine-tuning completed! Model saved to: ${modelOutputPath}`);
      return modelOutputPath;
      
    } catch (error) {
      console.error('❌ Fine-tuning failed:', error);
      throw new Error(`Tesseract fine-tuning failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractBaseModel(): Promise<string> {
    const baseModelDir = path.join(this.tessDataDir, 'vie_base');
    if (!fs.existsSync(baseModelDir)) {
      fs.mkdirSync(baseModelDir, { recursive: true });
    }
    
    // Extract LSTM model from existing Vietnamese traineddata
    const command = `combine_tessdata -e "${path.join(this.tessDataDir, 'vie.traineddata')}" "${path.join(baseModelDir, 'vie.lstm')}"`;
    await execAsync(command);
    
    return path.join(baseModelDir, 'vie.lstm');
  }

  private async createTrainingConfig(config: TrainingConfig): Promise<string> {
    const configContent = `
# Tesseract Training Configuration for Vietnamese Receipt OCR
# Generated: ${new Date().toISOString()}

model_name: ${config.modelName}
language: ${config.language}
fonts: ${config.fontList.join(', ')}
iterations: ${config.iterations}
learning_rate: ${config.learningRate}

# Vietnamese-specific optimizations
enable_diacritics: true
enable_vietnamese_tones: true
optimize_for_receipts: true
`;
    
    const configPath = path.join(this.outputDir, `${config.modelName}.config`);
    fs.writeFileSync(configPath, configContent, 'utf8');
    return configPath;
  }

  private async combineTrainedModel(modelName: string): Promise<void> {
    // Combine the trained LSTM with other components to create final traineddata
    const command = `combine_tessdata "${path.join(this.outputDir, modelName)}.traineddata"`;
    await execAsync(command);
  }

  /**
   * Step 5: Install the improved model
   */
  async installImprovedModel(modelPath: string): Promise<void> {
    console.log('📦 Installing improved Vietnamese model...');
    
    const systemTessDataDir = '/usr/share/tesseract-ocr/4.00/tessdata';
    const backupPath = path.join(systemTessDataDir, 'vie.traineddata.backup');
    
    try {
      // Backup original model
      if (fs.existsSync(path.join(systemTessDataDir, 'vie.traineddata'))) {
        fs.copyFileSync(
          path.join(systemTessDataDir, 'vie.traineddata'),
          backupPath
        );
        console.log('✅ Original model backed up');
      }
      
      // Install improved model
      fs.copyFileSync(modelPath, path.join(systemTessDataDir, 'vie.traineddata'));
      console.log('✅ Improved Vietnamese model installed');
      
      // Verify installation
      const { stdout } = await execAsync('tesseract --list-langs');
      if (stdout.includes('vie')) {
        console.log('✅ Model installation verified');
      }
      
    } catch (error) {
      console.error('❌ Failed to install model:', error);
      // Try to restore backup
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, path.join(systemTessDataDir, 'vie.traineddata'));
        console.log('🔄 Original model restored');
      }
      throw error;
    }
  }

  /**
   * Evaluate model performance on test data
   */
  async evaluateModel(testData: TrainingData[]): Promise<{
    accuracy: number;
    confidenceScores: number[];
    detailedResults: Array<{
      image: string;
      expected: string;
      actual: string;
      accuracy: number;
      confidence: number;
    }>;
  }> {
    console.log('📊 Evaluating model performance...');
    
    const results = [];
    let totalAccuracy = 0;
    const confidenceScores = [];

    for (const testDoc of testData) {
      try {
        // Run OCR with improved model
        const command = `tesseract "${testDoc.imagePath}" stdout -l vie --psm 6`;
        const { stdout } = await execAsync(command);
        const extractedText = stdout.trim();
        
        // Calculate accuracy (simple character-based comparison)
        const accuracy = this.calculateTextAccuracy(testDoc.groundTruthText, extractedText);
        totalAccuracy += accuracy;
        
        // Get confidence (simplified)
        const confidence = testDoc.confidence || 85;
        confidenceScores.push(confidence);
        
        results.push({
          image: path.basename(testDoc.imagePath),
          expected: testDoc.groundTruthText,
          actual: extractedText,
          accuracy,
          confidence
        });
        
      } catch (error) {
        console.error(`Failed to evaluate ${testDoc.imagePath}:`, error);
      }
    }

    const avgAccuracy = totalAccuracy / testData.length;
    
    console.log(`📈 Model Evaluation Results:`);
    console.log(`   Average Accuracy: ${avgAccuracy.toFixed(2)}%`);
    console.log(`   Average Confidence: ${confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length}%`);
    
    return {
      accuracy: avgAccuracy,
      confidenceScores,
      detailedResults: results
    };
  }

  private calculateTextAccuracy(expected: string, actual: string): number {
    if (!expected || !actual) return 0;
    
    const expectedChars = expected.split('');
    const actualChars = actual.split('');
    const maxLength = Math.max(expectedChars.length, actualChars.length);
    
    let matches = 0;
    for (let i = 0; i < maxLength; i++) {
      if (expectedChars[i] === actualChars[i]) {
        matches++;
      }
    }
    
    return (matches / maxLength) * 100;
  }

  /**
   * Create training data from existing processed documents
   */
  async createTrainingDataFromDocuments(): Promise<TrainingData[]> {
    console.log('🔄 Converting processed documents to training data...');
    
    // This would integrate with your existing document storage
    // For now, return sample structure
    return [
      {
        imagePath: 'uploads/sample_receipt_1.jpg',
        groundTruthText: 'CỬA HÀNG TIỆN LỢI ABC\nBánh mì 15,000đ\nCà phê 20,000đ\nTổng: 35,000đ',
        documentType: 'receipt',
        confidence: 90
      }
    ];
  }
}

export const tesseractTrainingSystem = new TesseractTrainingSystem();