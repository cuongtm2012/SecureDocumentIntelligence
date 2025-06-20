import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import { createWorker } from "tesseract.js";
import sharp from "sharp";
import { deepSeekService } from "./deepseek-service";
import helmet from "helmet";
import { insertDocumentSchema, insertAuditLogSchema } from "@shared/schema";
import { z } from "zod";
import { initializeDatabase } from "./init-db";

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG files are allowed'));
    }
  },
});

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize database with default user
  await initializeDatabase();

  // Apply security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "data:"],
      },
    },
  }));

  // Mock authentication middleware - in production this would be proper authentication
  app.use('/api', (req, res, next) => {
    // For demo purposes, always authenticate as user ID 1
    (req as any).user = { id: 1, username: "agent.smith" };
    next();
  });

  // Get current user
  app.get("/api/user", async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // Upload document
  app.post("/api/documents/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userId = (req as any).user.id;
      const filename = `${Date.now()}-${req.file.originalname}`;
      const filePath = path.join(uploadsDir, filename);

      // Save file to disk
      await writeFile(filePath, req.file.buffer);

      // Create document record
      const documentData = insertDocumentSchema.parse({
        filename,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        userId,
      });

      const document = await storage.createDocument(documentData);

      // Log the upload
      await storage.createAuditLog({
        userId,
        action: `Document uploaded: ${req.file.originalname}`,
        documentId: document.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json(document);
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // Process document with DeepSeek OCR
  app.post("/api/documents/:id/process", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      let useAdvanced = req.body.useAdvanced !== false; // Default to advanced processing
      
      const document = await storage.getDocument(documentId);
      if (!document || document.userId !== userId) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Update status to processing
      await storage.updateDocument(documentId, {
        processingStatus: "processing",
        processingStartedAt: new Date(),
      });

      const filePath = path.join(uploadsDir, document.filename);
      
      try {
        let extractedText = "";
        let confidence = 0;
        let structuredData: any = {};

        if (useAdvanced && process.env.OPENAI_API_KEY) {
          // Use DeepSeek-enhanced OCR processing
          console.log(`Processing document ${document.originalName} with DeepSeek-enhanced OCR...`);
          
          try {
            const deepSeekResult = await deepSeekService.processDocumentImage(filePath);
            
            extractedText = deepSeekResult.extractedText;
            confidence = deepSeekResult.confidence;
            structuredData = deepSeekResult.structuredData;
            
            // Perform additional analysis if needed
            if (extractedText.length > 50) {
              try {
                const analysis = await deepSeekService.analyzeDocument(extractedText, "Government document analysis");
                structuredData.analysis = analysis;
              } catch (analysisError) {
                console.warn('DeepSeek analysis failed, continuing with OCR results:', analysisError);
              }
            }

            // Log successful DeepSeek processing
            await storage.createAuditLog({
              userId,
              action: `Document processed with DeepSeek-enhanced OCR: ${document.originalName}`,
              documentId: document.id,
              ipAddress: req.ip,
              userAgent: req.get('User-Agent'),
            });

          } catch (deepSeekError) {
            console.warn('DeepSeek processing failed, falling back to Tesseract:', deepSeekError);
            useAdvanced = false; // Fall back to Tesseract
          }
        }
        
        if (!useAdvanced) {
          // Enhanced Tesseract OCR with Vietnamese language support
          console.log(`Processing document ${document.originalName} with enhanced Vietnamese OCR...`);
          
          // Enhanced image preprocessing for Vietnamese text
          const processedImageBuffer = await sharp(filePath)
            .resize({ width: 2000, withoutEnlargement: true }) // Upscale for better OCR
            .rotate() // Auto-rotate based on EXIF
            .greyscale() // Convert to grayscale for better text recognition
            .normalize() // Normalize contrast
            .sharpen({ sigma: 1, m1: 0.5, m2: 2 }) // Enhanced sharpening
            .threshold(128) // Binary threshold for clean text
            .png({ quality: 100 })
            .toBuffer();

          // Configure Tesseract for Vietnamese language with optimized settings
          const worker = await createWorker(['vie', 'eng'], 1, {
            logger: m => console.log(`Tesseract: ${m.status} - ${m.progress}`)
          });
          
          // Configure for better Vietnamese text recognition
          await worker.setParameters({
            'preserve_interword_spaces': '1'
          });

          const { data: { text, confidence: tessConfidence } } = await worker.recognize(processedImageBuffer);
          await worker.terminate();

          extractedText = text;
          confidence = tessConfidence / 100;
          structuredData = extractStructuredData(text);

          await storage.createAuditLog({
            userId,
            action: `Document processed with Tesseract OCR: ${document.originalName}`,
            documentId: document.id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
          });
        }

        // Update document with results
        await storage.updateDocument(documentId, {
          processingStatus: "completed",
          processingCompletedAt: new Date(),
          confidence,
          extractedText,
          structuredData: JSON.stringify(structuredData),
        });

        const updatedDocument = await storage.getDocument(documentId);
        res.json(updatedDocument);

      } catch (processingError) {
        console.error('Processing error:', processingError);
        
        await storage.updateDocument(documentId, {
          processingStatus: "failed",
          processingCompletedAt: new Date(),
          errorMessage: `Processing failed: ${processingError instanceof Error ? processingError.message : 'Unknown error'}`,
        });

        // Log the error
        await storage.createAuditLog({
          userId,
          action: `Document processing failed: ${document.originalName} - ${processingError instanceof Error ? processingError.message : 'Unknown error'}`,
          documentId: document.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        res.status(500).json({ message: "Document processing failed" });
      }

    } catch (error) {
      console.error('Process document error:', error);
      res.status(500).json({ message: "Failed to process document" });
    }
  });

  // Get user's documents
  app.get("/api/documents", async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const documents = await storage.getDocumentsByUserId(userId);
      res.json(documents);
    } catch (error) {
      res.status(500).json({ message: "Failed to get documents" });
    }
  });

  // Get specific document
  app.get("/api/documents/:id", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      
      const document = await storage.getDocument(documentId);
      if (!document || document.userId !== userId) {
        return res.status(404).json({ message: "Document not found" });
      }

      res.json(document);
    } catch (error) {
      res.status(500).json({ message: "Failed to get document" });
    }
  });

  // Export extracted text
  app.get("/api/documents/:id/export", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      const format = req.query.format as string || 'txt';
      
      const document = await storage.getDocument(documentId);
      if (!document || document.userId !== userId) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (!document.extractedText) {
        return res.status(400).json({ message: "No extracted text available" });
      }

      let content: string;
      let contentType: string;
      let filename: string;

      if (format === 'json') {
        const exportData = {
          document: {
            originalName: document.originalName,
            processedAt: document.processingCompletedAt,
            confidence: document.confidence,
          },
          extractedText: document.extractedText,
          structuredData: document.structuredData ? JSON.parse(document.structuredData) : null,
        };
        content = JSON.stringify(exportData, null, 2);
        contentType = 'application/json';
        filename = `${document.originalName}_extracted.json`;
      } else {
        content = document.extractedText;
        contentType = 'text/plain';
        filename = `${document.originalName}_extracted.txt`;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);

      // Log the export
      await storage.createAuditLog({
        userId,
        action: `Document exported: ${document.originalName} (${format})`,
        documentId: document.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ message: "Failed to export document" });
    }
  });

  // Get recent activity
  app.get("/api/audit-logs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const auditLogs = await storage.getRecentAuditLogs(limit);
      res.json(auditLogs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get audit logs" });
    }
  });

  // Advanced document analysis endpoint
  app.post("/api/documents/:id/analyze", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      
      const document = await storage.getDocument(documentId);
      if (!document || document.userId !== userId) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (!document.extractedText) {
        return res.status(400).json({ message: "Document must be processed first" });
      }

      // Perform advanced analysis with DeepSeek
      const analysis = await deepSeekService.analyzeDocument(
        document.extractedText, 
        "Government security document analysis"
      );

      // Log the analysis
      await storage.createAuditLog({
        userId,
        action: `Advanced analysis performed: ${document.originalName}`,
        documentId: document.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        documentId,
        analysis,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Document analysis error:', error);
      res.status(500).json({ message: "Analysis failed" });
    }
  });

  // System status endpoint
  app.get("/api/system/status", async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const userDocuments = await storage.getDocumentsByUserId(userId);
      const todayProcessed = userDocuments.filter(doc => {
        const today = new Date();
        const docDate = new Date(doc.uploadedAt);
        return docDate.toDateString() === today.toDateString();
      }).length;

      const hasDeepSeekKey = !!process.env.OPENAI_API_KEY;

      res.json({
        services: {
          ocr: hasDeepSeekKey ? "deepseek-ai" : "tesseract",
          database: "connected",
          security: "active",
          ai: hasDeepSeekKey ? "online" : "offline"
        },
        capabilities: {
          advancedOCR: hasDeepSeekKey,
          documentAnalysis: hasDeepSeekKey,
          structuredExtraction: true
        },
        usage: {
          today: todayProcessed,
          limit: 1000,
        },
        session: {
          remaining: 45,
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get system status" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to extract structured data from text
function extractStructuredData(text: string) {
  const lines = text.split('\n').filter(line => line.trim());
  const cleanText = text.replace(/[^\p{L}\p{N}\s\/\-\.,:]/gu, ' ').replace(/\s+/g, ' ').trim();
  
  // Vietnamese ID Card detection and extraction
  const isVietnameseId = /(?:CAN CUOC|CCCD|Citizen Identity|Identity Card)/i.test(text);
  
  if (isVietnameseId) {
    const result: any = {
      documentType: "Vietnamese Citizen Identity Card",
      country: "Vietnam"
    };

    // Extract ID number (12 digits)
    const idMatch = cleanText.match(/(?:số|sev|cccd|id)[\s:]*([0-9]{12})/i);
    if (idMatch) result.idNumber = idMatch[1];

    // Extract full name
    const nameMatch = cleanText.match(/(?:họ và tên|ho va ten|full name)[\s:]*([^\n]+?)(?:\n|date|ngay|gioi|sex)/i);
    if (nameMatch) {
      result.fullName = nameMatch[1].trim().replace(/[^a-zA-ZÀ-ỹ\s]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Extract date of birth
    const dobMatch = cleanText.match(/(?:ngày sinh|date of birth|ngay sinh)[\s:]*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{4})/i);
    if (dobMatch) result.dateOfBirth = dobMatch[1];

    // Extract gender
    const genderMatch = cleanText.match(/(?:giới tính|gioi tinh|sex)[\s:]*([^\n]+?)(?:\n|quoc|nationality)/i);
    if (genderMatch) {
      const gender = genderMatch[1].trim().toLowerCase();
      result.gender = gender.includes('nam') ? 'Male' : gender.includes('nữ') || gender.includes('nu') ? 'Female' : gender;
    }

    // Extract nationality
    const nationalityMatch = cleanText.match(/(?:quốc tịch|quoc tich|nationality)[\s:]*([^\n]+?)(?:\n|que|place)/i);
    if (nationalityMatch) {
      result.nationality = nationalityMatch[1].trim().replace(/[^a-zA-ZÀ-ỹ\s]/g, ' ').trim();
    }

    // Extract place of origin
    const originMatch = cleanText.match(/(?:quê quán|que quan|place of origin)[\s:]*([^\n]+?)(?:\n|noi thuong|place of residence)/i);
    if (originMatch) {
      result.placeOfOrigin = originMatch[1].trim().replace(/[^a-zA-ZÀ-ỹ\s,]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Extract place of residence
    const residenceMatch = cleanText.match(/(?:nơi thường trú|noi thuong tru|place of residence)[\s:]*([^\n]+?)(?:\n|$)/i);
    if (residenceMatch) {
      result.placeOfResidence = residenceMatch[1].trim().replace(/[^a-zA-ZÀ-ỹ\s,0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Extract expiry date if present
    const expiryMatch = cleanText.match(/([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{4})/g);
    if (expiryMatch && expiryMatch.length > 1) {
      result.expiryDate = expiryMatch[expiryMatch.length - 1]; // Last date is usually expiry
    }

    return result;
  }

  // Government document detection
  const structuredData: any = {};
  
  if (text.toLowerCase().includes('incident report')) {
    structuredData.documentType = 'Incident Report';
  } else if (text.toLowerCase().includes('case file')) {
    structuredData.documentType = 'Case File';
  } else if (text.toLowerCase().includes('memo')) {
    structuredData.documentType = 'Memorandum';
  } else {
    structuredData.documentType = 'Unknown Document';
  }

  // Extract case/incident numbers
  const caseNumberMatch = text.match(/(?:case|incident|report)\s*#?\s*([A-Z0-9-]+)/i);
  if (caseNumberMatch) {
    structuredData.caseNumber = caseNumberMatch[1];
  }

  // Extract dates
  const dateMatch = text.match(/(?:date|dated):\s*([A-Za-z]+ \d{1,2},? \d{4})/i);
  if (dateMatch) {
    structuredData.date = dateMatch[1];
  }

  // Extract classification level
  const classificationMatch = text.match(/(?:classification|classified):\s*([A-Z\s]+)/i);
  if (classificationMatch) {
    structuredData.classification = classificationMatch[1].trim();
  } else if (text.toLowerCase().includes('confidential')) {
    structuredData.classification = 'CONFIDENTIAL';
  } else if (text.toLowerCase().includes('secret')) {
    structuredData.classification = 'SECRET';
  } else if (text.toLowerCase().includes('top secret')) {
    structuredData.classification = 'TOP SECRET';
  }

  // Add language detection
  structuredData.language = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/.test(text) ? "Vietnamese" : "English";

  return structuredData;
}
