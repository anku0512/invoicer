import { db } from '../firebase/admin';

export interface ProcessedFile {
  fileId: string;
  fileName: string;
  fileUrl: string;
  processedAt: string;
  status: 'processing' | 'completed' | 'failed';
  error?: string;
  sheetId: string;
  // Optional: capture workflow-level association when provided by callers
  workflowId?: string;
}

export interface UserFileTracking {
  userId: string;
  processedFiles: ProcessedFile[];
  lastUpdated: string;
}

export class FileTrackingService {
  private collectionName = 'userFileTracking';

  /**
   * Check if a file has already been processed
   */
  async isFileProcessed(userId: string, fileId: string, sheetId?: string): Promise<boolean> {
    try {
      const userDoc = await db.collection(this.collectionName).doc(userId).get();
      if (!userDoc.exists) {
        return false;
      }

      const data = userDoc.data() as UserFileTracking;
      // If sheetId is provided, require both fileId and sheetId to match (sheet-level tracking)
      const processedFile = data.processedFiles.find(file => {
        if (sheetId) return file.fileId === fileId && file.sheetId === sheetId;
        return file.fileId === fileId;
      });
      
      return processedFile?.status === 'completed';
    } catch (error) {
      console.error('Error checking if file is processed:', error);
      return false;
    }
  }

  /**
   * Mark a file as being processed
   */
  async markFileProcessing(userId: string, fileId: string, fileName: string, fileUrl: string, sheetId: string, workflowId?: string): Promise<void> {
    try {
      const processedFile: ProcessedFile = {
        fileId,
        fileName,
        fileUrl,
        processedAt: new Date().toISOString(),
        status: 'processing',
        sheetId
      };

      // Only set workflowId if provided to avoid writing undefined
      if (typeof workflowId !== 'undefined') {
        processedFile.workflowId = workflowId;
      }

      const userDocRef = db.collection(this.collectionName).doc(userId);
      const userDoc = await userDocRef.get();
      
      if (userDoc.exists) {
        const data = userDoc.data() as UserFileTracking;
        // Match on both fileId and sheetId for updates
        const existingFileIndex = data.processedFiles.findIndex(file => file.fileId === fileId && file.sheetId === sheetId);
        
        if (existingFileIndex >= 0) {
          // Update existing file, avoiding undefined fields
          const updated = { ...data.processedFiles[existingFileIndex], ...processedFile } as any;
          if (typeof processedFile.workflowId === 'undefined') delete updated.workflowId;
          data.processedFiles[existingFileIndex] = updated;
        } else {
          // Add new file
          data.processedFiles.push(processedFile);
        }
        
        data.lastUpdated = new Date().toISOString();
        await userDocRef.update({
          processedFiles: data.processedFiles,
          lastUpdated: data.lastUpdated
        });
      } else {
        // Create new document
        const newData: UserFileTracking = {
          userId,
          processedFiles: [processedFile],
          lastUpdated: new Date().toISOString()
        };
        await userDocRef.set(newData);
      }

      console.log(`Marked file ${fileId} as processing for user ${userId}`);
    } catch (error) {
      console.error('Error marking file as processing:', error);
      throw error;
    }
  }

  /**
   * Mark a file as completed processing
   */
  async markFileCompleted(userId: string, fileId: string, sheetId?: string): Promise<void> {
    try {
      const userDocRef = db.collection(this.collectionName).doc(userId);
      const userDoc = await userDocRef.get();
      
      if (userDoc.exists) {
        const data = userDoc.data() as UserFileTracking;
        const fileIndex = data.processedFiles.findIndex(file => sheetId ? (file.fileId === fileId && file.sheetId === sheetId) : (file.fileId === fileId));
        
        if (fileIndex >= 0) {
          data.processedFiles[fileIndex].status = 'completed';
          data.lastUpdated = new Date().toISOString();
          await userDocRef.update({
            processedFiles: data.processedFiles,
            lastUpdated: data.lastUpdated
          });
          console.log(`Marked file ${fileId} as completed for user ${userId}${sheetId ? ` (sheet ${sheetId})` : ''}`);
        }
      }
    } catch (error) {
      console.error('Error marking file as completed:', error);
      throw error;
    }
  }

  /**
   * Mark a file as failed processing
   */
  async markFileFailed(userId: string, fileId: string, error: string, sheetId?: string): Promise<void> {
    try {
      const userDocRef = db.collection(this.collectionName).doc(userId);
      const userDoc = await userDocRef.get();
      
      if (userDoc.exists) {
        const data = userDoc.data() as UserFileTracking;
        const fileIndex = data.processedFiles.findIndex(file => sheetId ? (file.fileId === fileId && file.sheetId === sheetId) : (file.fileId === fileId));
        
        if (fileIndex >= 0) {
          data.processedFiles[fileIndex].status = 'failed';
          data.processedFiles[fileIndex].error = error;
          data.lastUpdated = new Date().toISOString();
          await userDocRef.update({
            processedFiles: data.processedFiles,
            lastUpdated: data.lastUpdated
          });
          console.log(`Marked file ${fileId} as failed for user ${userId}${sheetId ? ` (sheet ${sheetId})` : ''}: ${error}`);
        }
      }
    } catch (error) {
      console.error('Error marking file as failed:', error);
      throw error;
    }
  }

  /**
   * Get all processed files for a user
   */
  async getUserProcessedFiles(userId: string): Promise<ProcessedFile[]> {
    try {
      const userDoc = await db.collection(this.collectionName).doc(userId).get();
      if (!userDoc.exists) {
        return [];
      }

      const data = userDoc.data() as UserFileTracking;
      return data.processedFiles || [];
    } catch (error) {
      console.error('Error getting user processed files:', error);
      return [];
    }
  }

  /**
   * Get files that are currently being processed
   */
  async getProcessingFiles(userId: string): Promise<ProcessedFile[]> {
    try {
      const allFiles = await this.getUserProcessedFiles(userId);
      return allFiles.filter(file => file.status === 'processing');
    } catch (error) {
      console.error('Error getting processing files:', error);
      return [];
    }
  }

  /**
   * Clean up old failed files (optional maintenance function)
   */
  async cleanupOldFailedFiles(userId: string, olderThanDays: number = 7): Promise<void> {
    try {
      const userDocRef = db.collection(this.collectionName).doc(userId);
      const userDoc = await userDocRef.get();
      
      if (userDoc.exists) {
        const data = userDoc.data() as UserFileTracking;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
        
        const filteredFiles = data.processedFiles.filter(file => {
          if (file.status === 'failed') {
            const fileDate = new Date(file.processedAt);
            return fileDate > cutoffDate;
          }
          return true;
        });
        
        if (filteredFiles.length !== data.processedFiles.length) {
          data.processedFiles = filteredFiles;
          data.lastUpdated = new Date().toISOString();
          await userDocRef.update({
            processedFiles: data.processedFiles,
            lastUpdated: data.lastUpdated
          });
          console.log(`Cleaned up old failed files for user ${userId}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old failed files:', error);
    }
  }
}
