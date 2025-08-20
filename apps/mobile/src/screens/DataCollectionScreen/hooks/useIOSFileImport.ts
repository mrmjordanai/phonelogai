import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { FileImportService, ImportedFile, UploadProgress } from '../../../services/ios/FileImportService';
import { CloudStorageService } from '../../../services/ios/CloudStorageService';

interface IOSFileImportProgress {
  stage: 'selecting' | 'validating' | 'uploading' | 'processing' | 'completed' | 'failed';
  currentFile?: string;
  filesCompleted: number;
  totalFiles: number;
  uploadProgress?: UploadProgress;
  message?: string;
}

interface IOSFileImportResult {
  success: boolean;
  filesProcessed: number;
  totalFiles: number;
  uploadIds: string[];
  errors: string[];
  warnings: string[];
  processingTimeMs: number;
}

interface UseIOSFileImportReturn {
  isImporting: boolean;
  progress: IOSFileImportProgress | null;
  result: IOSFileImportResult | null;
  cloudStorageSupport: {
    iCloudAvailable: boolean;
    documentPickerAvailable: boolean;
    shareExtensionAvailable: boolean;
  } | null;
  
  // Methods
  pickAndImportFiles: () => Promise<void>;
  importFiles: (_files: ImportedFile[]) => Promise<void>;
  importFromCloudStorage: (_providerId: string, _fileId: string, _fileName: string) => Promise<void>;
  cancelImport: () => void;
  clearResults: () => void;
  checkCloudStorageSupport: () => Promise<void>;
}

export function useIOSFileImport(): UseIOSFileImportReturn {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<IOSFileImportProgress | null>(null);
  const [result, setResult] = useState<IOSFileImportResult | null>(null);
  const [cloudStorageSupport, setCloudStorageSupport] = useState<UseIOSFileImportReturn['cloudStorageSupport']>(null);
  
  const activeUploadsRef = useRef<Set<string>>(new Set());
  const startTimeRef = useRef<number>(0);

  const checkCloudStorageSupport = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      return;
    }

    try {
      const support = await FileImportService.checkCloudStorageSupport();
      setCloudStorageSupport(support);
    } catch (error) {
      console.warn('Failed to check cloud storage support:', error);
    }
  }, []);

  const pickAndImportFiles = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      throw new Error('iOS file import is only available on iOS platform');
    }

    try {
      setIsImporting(true);
      setResult(null);
      startTimeRef.current = Date.now();
      
      setProgress({
        stage: 'selecting',
        filesCompleted: 0,
        totalFiles: 0,
        message: 'Opening file picker...',
      });

      // Pick files using iOS-optimized file picker
      const files = await FileImportService.pickFiles({
        allowMultipleSelection: true,
        maxFileSize: 100 * 1024 * 1024, // 100MB
        allowCloudStorage: true,
        presentationStyle: 'pageSheet',
      });

      if (files.length === 0) {
        setProgress(null);
        setIsImporting(false);
        return;
      }

      // Import the selected files
      await importFiles(files);
      
    } catch (error) {
      console.error('Error picking and importing files:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to pick and import files';
      setResult({
        success: false,
        filesProcessed: 0,
        totalFiles: 0,
        uploadIds: [],
        errors: [errorMessage],
        warnings: [],
        processingTimeMs: Date.now() - startTimeRef.current,
      });
      
      setProgress({
        stage: 'failed',
        filesCompleted: 0,
        totalFiles: 0,
        message: errorMessage,
      });
    } finally {
      setIsImporting(false);
    }
  }, []);

  const importFiles = useCallback(async (files: ImportedFile[]) => {
    if (Platform.OS !== 'ios') {
      throw new Error('iOS file import is only available on iOS platform');
    }

    try {
      setIsImporting(true);
      setResult(null);
      startTimeRef.current = Date.now();
      
      setProgress({
        stage: 'validating',
        filesCompleted: 0,
        totalFiles: files.length,
        message: 'Validating files...',
      });

      const uploadIds: string[] = [];
      const errors: string[] = [];
      const warnings: string[] = [];
      let filesProcessed = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        try {
          setProgress({
            stage: 'validating',
            currentFile: file.name,
            filesCompleted: i,
            totalFiles: files.length,
            message: `Validating ${file.name}...`,
          });

          // Validate file
          const validation = await FileImportService.validateFile(file);
          
          if (!validation.isValid) {
            errors.push(`${file.name}: ${validation.errors.join(', ')}`);
            continue;
          }

          if (validation.warnings.length > 0) {
            warnings.push(...validation.warnings.map(w => `${file.name}: ${w}`));
          }

          setProgress({
            stage: 'uploading',
            currentFile: file.name,
            filesCompleted: i,
            totalFiles: files.length,
            message: `Uploading ${file.name}...`,
          });

          // Upload file with progress tracking
          const uploadId = await FileImportService.uploadFile(file, (uploadProgress) => {
            setProgress(prev => ({
              ...prev!,
              uploadProgress,
            }));
          });

          uploadIds.push(uploadId);
          filesProcessed++;
          
          // Add to offline queue for sync (file import metadata)
          // Note: This is file import metadata, not an Event/Contact, so skipping queue for now
          console.log('File import completed:', {
            uploadId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            isCloudFile: file.isCloudFile,
            cloudProvider: file.cloudProvider,
          });

          setProgress({
            stage: 'processing',
            currentFile: file.name,
            filesCompleted: i + 1,
            totalFiles: files.length,
            message: `Processing ${file.name}...`,
          });

        } catch (fileError) {
          console.error(`Error importing file ${file.name}:`, fileError);
          errors.push(`${file.name}: ${fileError instanceof Error ? fileError.message : 'Import failed'}`);
        }
      }

      const processingTimeMs = Date.now() - startTimeRef.current;
      const success = filesProcessed > 0;

      setResult({
        success,
        filesProcessed,
        totalFiles: files.length,
        uploadIds,
        errors,
        warnings,
        processingTimeMs,
      });

      setProgress({
        stage: success ? 'completed' : 'failed',
        filesCompleted: filesProcessed,
        totalFiles: files.length,
        message: success 
          ? `Successfully imported ${filesProcessed} of ${files.length} files`
          : `Failed to import files. ${errors.length} errors occurred.`,
      });

    } catch (error) {
      console.error('Error importing files:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to import files';
      setResult({
        success: false,
        filesProcessed: 0,
        totalFiles: files.length,
        uploadIds: [],
        errors: [errorMessage],
        warnings: [],
        processingTimeMs: Date.now() - startTimeRef.current,
      });
      
      setProgress({
        stage: 'failed',
        filesCompleted: 0,
        totalFiles: files.length,
        message: errorMessage,
      });
    } finally {
      setIsImporting(false);
    }
  }, []);

  const importFromCloudStorage = useCallback(async (providerId: string, fileId: string, fileName: string) => {
    if (Platform.OS !== 'ios') {
      throw new Error('iOS file import is only available on iOS platform');
    }

    try {
      setIsImporting(true);
      setResult(null);
      startTimeRef.current = Date.now();
      
      setProgress({
        stage: 'selecting',
        filesCompleted: 0,
        totalFiles: 1,
        message: `Downloading from ${providerId}...`,
      });

      // Download file from cloud storage
      const file = await CloudStorageService.downloadFile(providerId, fileId, fileName);
      
      // Import the downloaded file
      await importFiles([file]);
      
    } catch (error) {
      console.error('Error importing from cloud storage:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to import from cloud storage';
      setResult({
        success: false,
        filesProcessed: 0,
        totalFiles: 1,
        uploadIds: [],
        errors: [errorMessage],
        warnings: [],
        processingTimeMs: Date.now() - startTimeRef.current,
      });
      
      setProgress({
        stage: 'failed',
        filesCompleted: 0,
        totalFiles: 1,
        message: errorMessage,
      });
      
      setIsImporting(false);
    }
  }, [importFiles]);

  const cancelImport = useCallback(() => {
    // Cancel any active uploads
    for (const fileId of activeUploadsRef.current) {
      FileImportService.cancelUpload(fileId);
    }
    
    activeUploadsRef.current.clear();
    setIsImporting(false);
    setProgress(null);
  }, []);

  const clearResults = useCallback(() => {
    setResult(null);
    setProgress(null);
  }, []);

  return {
    isImporting,
    progress,
    result,
    cloudStorageSupport,
    pickAndImportFiles,
    importFiles,
    importFromCloudStorage,
    cancelImport,
    clearResults,
    checkCloudStorageSupport,
  };
}