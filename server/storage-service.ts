import { CloudflareR2Storage, R2UploadResult } from './cloudflare-r2-storage';
import * as fs from 'fs';
import * as path from 'path';

export interface StorageService {
  uploadFile(
    fileBuffer: Buffer,
    filename: string,
    originalName: string,
    contentType: string,
    onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void
  ): Promise<R2UploadResult>;
  
  downloadFile(key: string): Promise<{ stream: NodeJS.ReadableStream; metadata: any }>;
  deleteFile(key: string): Promise<void>;
  testConnection(): Promise<boolean>;
}

export class HybridStorageService implements StorageService {
  private r2Storage: CloudflareR2Storage | null = null;
  private useR2: boolean = false;

  constructor() {
    this.initializeR2();
  }

  private async initializeR2() {
    try {
      // Check if R2 environment variables are configured
      const hasR2Config = !!(
        process.env.CLOUDFLARE_ACCOUNT_ID &&
        process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
        process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
      );

      if (hasR2Config) {
        console.log('🔧 Initializing Cloudflare R2 storage...');
        this.r2Storage = new CloudflareR2Storage();
        
        // Test R2 connection
        const connectionOk = await this.r2Storage.testConnection();
        if (connectionOk) {
          this.useR2 = true;
          console.log('✅ Using Cloudflare R2 for file storage');
        } else {
          console.warn('⚠️ R2 connection test failed, falling back to local storage');
          this.useR2 = false;
        }
      } else {
        console.log('📂 Using local file storage (R2 not configured)');
        this.useR2 = false;
      }
    } catch (error) {
      console.error('❌ R2 initialization failed:', error);
      console.log('📂 Falling back to local file storage');
      this.useR2 = false;
    }
  }

  async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    originalName: string,
    contentType: string,
    onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void
  ): Promise<R2UploadResult> {
    if (this.useR2 && this.r2Storage) {
      // Use R2 storage
      return await this.r2Storage.uploadFile(fileBuffer, filename, originalName, contentType, onProgress);
    } else {
      // Fallback to local storage
      return await this.uploadToLocal(fileBuffer, filename, originalName, contentType, onProgress);
    }
  }

  private async uploadToLocal(
    fileBuffer: Buffer,
    filename: string,
    originalName: string,
    contentType: string,
    onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void
  ): Promise<R2UploadResult> {
    const uploadsDir = '/home/runner/uploads';
    
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const timestamp = Date.now();
    const key = `${timestamp}-${filename}`;
    const filePath = path.join(uploadsDir, key);

    // Simulate progress for consistency with R2
    if (onProgress) {
      onProgress({ loaded: 0, total: fileBuffer.length, percentage: 0 });
    }

    // Write file to local storage
    await fs.promises.writeFile(filePath, fileBuffer);

    if (onProgress) {
      onProgress({ loaded: fileBuffer.length, total: fileBuffer.length, percentage: 100 });
    }

    console.log(`✅ File uploaded to local storage: ${key}`);

    return {
      key,
      url: `/api/documents/raw/${key}`, // Local URL format
      metadata: {
        filename: key,
        originalName,
        size: fileBuffer.length,
        contentType,
        uploadedAt: new Date(),
      },
    };
  }

  async downloadFile(key: string): Promise<{ stream: NodeJS.ReadableStream; metadata: any }> {
    if (this.useR2 && this.r2Storage) {
      // Use R2 storage
      return await this.r2Storage.downloadFile(key);
    } else {
      // Fallback to local storage
      return await this.downloadFromLocal(key);
    }
  }

  private async downloadFromLocal(key: string): Promise<{ stream: NodeJS.ReadableStream; metadata: any }> {
    const uploadsDir = '/home/runner/uploads';
    const filePath = path.join(uploadsDir, key);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${key}`);
    }

    const stats = await fs.promises.stat(filePath);
    const stream = fs.createReadStream(filePath);

    return {
      stream,
      metadata: {
        filename: key,
        originalName: key.replace(/^\d+-/, ''), // Remove timestamp prefix
        size: stats.size,
        contentType: 'application/octet-stream',
        uploadedAt: stats.mtime,
      },
    };
  }

  async deleteFile(key: string): Promise<void> {
    if (this.useR2 && this.r2Storage) {
      // Use R2 storage
      await this.r2Storage.deleteFile(key);
    } else {
      // Fallback to local storage
      await this.deleteFromLocal(key);
    }
  }

  private async deleteFromLocal(key: string): Promise<void> {
    const uploadsDir = '/home/runner/uploads';
    const filePath = path.join(uploadsDir, key);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log(`✅ File deleted from local storage: ${key}`);
    }
  }

  async testConnection(): Promise<boolean> {
    if (this.useR2 && this.r2Storage) {
      return await this.r2Storage.testConnection();
    } else {
      // Test local storage
      const uploadsDir = '/home/runner/uploads';
      try {
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        fs.accessSync(uploadsDir, fs.constants.W_OK);
        return true;
      } catch {
        return false;
      }
    }
  }

  getStorageType(): 'r2' | 'local' {
    return this.useR2 ? 'r2' : 'local';
  }
}

// Export singleton instance
export const storageService = new HybridStorageService();