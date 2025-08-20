import { useState, useCallback, useRef } from 'react';
import { EnhancedFileImportService, ImportProgress, ImportResult, FileProcessingResult } from '../../../services/EnhancedFileImportService';
// import { OfflineQueue } from '../../../services/OfflineQueue'; // TODO: Implement offline queue integration

interface UseFileImportReturn {
  importProgress: ImportProgress | null;
  isImporting: boolean;
  importResults: ImportResult | null;
  error: string | null;
  startFileImport: (_files: { uri: string; name: string; type: string }[]) => Promise<void>;
  cancelImport: () => void;
  clearResults: () => void;
}

export function useFileImport(): UseFileImportReturn {
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const importServiceRef = useRef<typeof EnhancedFileImportService | null>(null);
  const progressUnsubscribeRef = useRef<(() => void) | null>(null);

  const startFileImport = useCallback(async (files: { uri: string; name: string; type: string }[]) => {
    try {
      setIsImporting(true);
      setError(null);
      setImportResults(null);
      setImportProgress(null);

      // Initialize service
      importServiceRef.current = EnhancedFileImportService;

      // Subscribe to progress updates for the first file
      // Note: onProgress requires fileId, but we'll handle progress per file
      // progressUnsubscribeRef.current = importServiceRef.current.onProgress('temp', (progress) => {
      //   setImportProgress(progress);
      // });

      // Process each file
      const results: FileProcessingResult[] = [];
      
      for (const file of files) {
        console.log(`Starting import for file: ${file.name}`);
        
        // Convert to ImportedFile format
        const importedFile = {
          id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          size: 0, // Will be read from the file
          type: file.type,
          uri: file.uri,
        };
        
        const result = await importServiceRef.current.processFile(importedFile, {
          userId: 'current_user', // TODO: Get from auth context
          lineId: 'current_line', // TODO: Get from context
        });
        
        results.push(result);

        // Add successful imports to offline queue for sync
        // FileProcessingResult doesn't have processedData, so we'll handle this differently
        if (result.success) {
          // The actual processed data handling would be done inside the service
          console.log(`Successfully processed ${result.eventsCreated} events from ${result.fileName}`);
        }
      }

      // Combine results if multiple files
      const combinedResult: ImportResult = {
        success: results.every(r => r.success),
        fileName: files.length === 1 ? files[0].name : `${files.length} files`,
        fileType: files.length === 1 ? files[0].type : 'mixed',
        summary: {
          totalRows: results.reduce((sum, r) => sum + (r.eventsCreated + r.contactsCreated), 0),
          validRows: results.reduce((sum, r) => sum + (r.eventsCreated + r.contactsCreated), 0),
          invalidRows: 0, // FileProcessingResult doesn't track invalid rows
          duplicatesFound: results.reduce((sum, r) => sum + r.duplicatesSkipped, 0),
          dataTypes: ['mixed'], // FileProcessingResult doesn't provide this info
          processingTimeMs: results.reduce((sum, r) => sum + r.processingTime, 0),
        },
        errors: results.flatMap(r => r.errors || []),
        warnings: results.flatMap(r => r.warnings || []),
      };

      setImportResults(combinedResult);
      
      console.log('File import completed:', combinedResult);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'File import failed';
      setError(errorMessage);
      console.error('File import error:', err);
      
      // Set failed result
      setImportResults({
        success: false,
        fileName: files.length === 1 ? files[0].name : `${files.length} files`,
        fileType: files.length === 1 ? files[0].type : 'mixed',
        errors: [errorMessage],
        warnings: [],
        summary: {
          totalRows: 0,
          validRows: 0,
          invalidRows: 0,
          duplicatesFound: 0,
          dataTypes: [],
          processingTimeMs: 0,
        },
      });
    } finally {
      setIsImporting(false);
      setImportProgress(null);
      
      // Cleanup progress subscription
      if (progressUnsubscribeRef.current) {
        progressUnsubscribeRef.current();
        progressUnsubscribeRef.current = null;
      }
    }
  }, []);

  const cancelImport = useCallback(() => {
    // Note: EnhancedFileImportService doesn't have cancelImport method
    // Just update local state to indicate cancellation
    setIsImporting(false);
    setImportProgress(null);
    
    // Cleanup progress subscription
    if (progressUnsubscribeRef.current) {
      progressUnsubscribeRef.current();
      progressUnsubscribeRef.current = null;
    }
  }, []);

  const clearResults = useCallback(() => {
    setImportResults(null);
    setError(null);
    setImportProgress(null);
  }, []);

  return {
    importProgress,
    isImporting,
    importResults,
    error,
    startFileImport,
    cancelImport,
    clearResults,
  };
}