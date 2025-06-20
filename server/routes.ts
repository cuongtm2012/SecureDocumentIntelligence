import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import { createWorker } from "tesseract.js";
import sharp from "sharp";
import helmet from "helmet";
import { insertDocumentSchema, insertAuditLogSchema } from "@shared/schema";
import { z } from "zod";

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
  // Apply security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
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

  // Process document with OCR
  app.post("/api/documents/:id/process", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      
      const document = await storage.getDocument(documentId);
      if (!document || document.userId !== userId) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Update status to processing
      await storage.updateDocument(documentId, {
        processingStatus: "processing",
        processingStartedAt: new Date(),
      });

      // Process the image
      const filePath = path.join(uploadsDir, document.filename);
      
      try {
        // Preprocess image with Sharp
        const processedImageBuffer = await sharp(filePath)
          .rotate() // Auto-rotate based on EXIF
          .normalize() // Enhance contrast
          .sharpen() // Sharpen the image
          .png() // Convert to PNG for better OCR
          .toBuffer();

        // Perform OCR with Tesseract
        const worker = await createWorker();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        
        const { data: { text, confidence } } = await worker.recognize(processedImageBuffer);
        await worker.terminate();

        // Extract structured data (basic example)
        const structuredData = extractStructuredData(text);

        // Update document with results
        await storage.updateDocument(documentId, {
          processingStatus: "completed",
          processingCompletedAt: new Date(),
          confidence: confidence / 100, // Convert to decimal
          extractedText: text,
          structuredData: JSON.stringify(structuredData),
        });

        // Log the processing
        await storage.createAuditLog({
          userId,
          action: `Document processed: ${document.originalName}`,
          documentId: document.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        const updatedDocument = await storage.getDocument(documentId);
        res.json(updatedDocument);

      } catch (processingError) {
        console.error('Processing error:', processingError);
        
        await storage.updateDocument(documentId, {
          processingStatus: "failed",
          processingCompletedAt: new Date(),
          errorMessage: "OCR processing failed",
        });

        res.status(500).json({ message: "OCR processing failed" });
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

      res.json({
        services: {
          ocr: "online",
          database: "connected",
          security: "active",
        },
        usage: {
          today: todayProcessed,
          limit: 1000,
        },
        session: {
          remaining: 45, // Mock session time
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
  const structuredData: any = {};
  
  // Extract document type
  if (text.toLowerCase().includes('incident report')) {
    structuredData.documentType = 'Incident Report';
  } else if (text.toLowerCase().includes('case file')) {
    structuredData.documentType = 'Case File';
  } else if (text.toLowerCase().includes('memo')) {
    structuredData.documentType = 'Memorandum';
  } else {
    structuredData.documentType = 'Unknown';
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

  return structuredData;
}
