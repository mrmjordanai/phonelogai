import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ImportProgress {
  fileName: string;
  totalFiles: number;
  currentFile: number;
  totalRows: number;
  processedRows: number;
  phase: string;
  estimatedTimeRemaining?: number;
}

interface ImportResult {
  success: boolean;
  fileName: string;
  fileType: string;
  processedData?: unknown[];
  summary?: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicatesFound: number;
    dataTypes: string[];
    processingTimeMs: number;
  };
  errors?: string[];
  warnings?: string[];
}

interface CollectionProgressProps {
  progress: ImportProgress | null;
  isActive: boolean;
  results: ImportResult | null;
  onCancel: () => void;
  onClearResults: () => void;
}

export function CollectionProgress({
  progress,
  isActive,
  results,
  onCancel,
  onClearResults,
}: CollectionProgressProps) {
  const formatTime = (ms: number) => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  const getProgressPercentage = () => {
    if (!progress) return 0;
    return Math.round((progress.processedRows / progress.totalRows) * 100);
  };

  return (
    <View style={styles.container}>
      {/* Active Progress */}
      {isActive && progress && (
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Processing Files...</Text>
            <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
              <Ionicons name="close" size={20} color="#F44336" />
            </TouchableOpacity>
          </View>

          <Text style={styles.fileName}>{progress.fileName}</Text>
          <Text style={styles.progressPhase}>{progress.phase}</Text>

          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${getProgressPercentage()}%` }
              ]}
            />
          </View>

          <View style={styles.progressStats}>
            <Text style={styles.progressText}>
              {progress.processedRows.toLocaleString()} / {progress.totalRows.toLocaleString()} rows
            </Text>
            <Text style={styles.progressPercentage}>
              {getProgressPercentage()}%
            </Text>
          </View>

          {progress.estimatedTimeRemaining && (
            <Text style={styles.timeRemaining}>
              Est. {formatTime(progress.estimatedTimeRemaining)} remaining
            </Text>
          )}
        </View>
      )}

      {/* Results */}
      {results && !isActive && (
        <View style={styles.resultsCard}>
          <View style={styles.resultsHeader}>
            <View style={styles.resultStatus}>
              <Ionicons
                name={results.success ? "checkmark-circle" : "alert-circle"}
                size={24}
                color={results.success ? "#4CAF50" : "#F44336"}
              />
              <Text style={[
                styles.resultTitle,
                { color: results.success ? "#4CAF50" : "#F44336" }
              ]}>
                {results.success ? "Import Successful" : "Import Failed"}
              </Text>
            </View>
            <TouchableOpacity onPress={onClearResults} style={styles.clearButton}>
              <Ionicons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <Text style={styles.resultFileName}>{results.fileName}</Text>

          {results.summary && (
            <ScrollView style={styles.summaryContainer} showsVerticalScrollIndicator={false}>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>
                    {results.summary.totalRows.toLocaleString()}
                  </Text>
                  <Text style={styles.summaryLabel}>Total Rows</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: "#4CAF50" }]}>
                    {results.summary.validRows.toLocaleString()}
                  </Text>
                  <Text style={styles.summaryLabel}>Valid</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: "#F44336" }]}>
                    {results.summary.invalidRows.toLocaleString()}
                  </Text>
                  <Text style={styles.summaryLabel}>Invalid</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: "#FF9800" }]}>
                    {results.summary.duplicatesFound.toLocaleString()}
                  </Text>
                  <Text style={styles.summaryLabel}>Duplicates</Text>
                </View>
              </View>

              <View style={styles.dataTypes}>
                <Text style={styles.dataTypesTitle}>Data Types Found:</Text>
                <View style={styles.dataTypesList}>
                  {results.summary.dataTypes.map((type, index) => (
                    <View key={index} style={styles.dataTypeBadge}>
                      <Text style={styles.dataTypeText}>{type.toUpperCase()}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <Text style={styles.processingTime}>
                Processing Time: {formatTime(results.summary.processingTimeMs)}
              </Text>
            </ScrollView>
          )}

          {/* Errors */}
          {results.errors && results.errors.length > 0 && (
            <View style={styles.errorsContainer}>
              <Text style={styles.errorsTitle}>Errors:</Text>
              {results.errors.slice(0, 3).map((error, index) => (
                <Text key={index} style={styles.errorText}>
                  • {error}
                </Text>
              ))}
              {results.errors.length > 3 && (
                <Text style={styles.moreErrors}>
                  +{results.errors.length - 3} more errors
                </Text>
              )}
            </View>
          )}

          {/* Warnings */}
          {results.warnings && results.warnings.length > 0 && (
            <View style={styles.warningsContainer}>
              <Text style={styles.warningsTitle}>Warnings:</Text>
              {results.warnings.slice(0, 2).map((warning, index) => (
                <Text key={index} style={styles.warningText}>
                  • {warning}
                </Text>
              ))}
              {results.warnings.length > 2 && (
                <Text style={styles.moreWarnings}>
                  +{results.warnings.length - 2} more warnings
                </Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  progressCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  cancelButton: {
    padding: 4,
  },
  fileName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  progressPhase: {
    fontSize: 14,
    color: '#2196F3',
    marginBottom: 12,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 4,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
  },
  progressPercentage: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  timeRemaining: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  resultsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  clearButton: {
    padding: 4,
  },
  resultFileName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  summaryContainer: {
    maxHeight: 200,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  summaryItem: {
    width: '50%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  dataTypes: {
    marginBottom: 12,
  },
  dataTypesTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  dataTypesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dataTypeBadge: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  dataTypeText: {
    fontSize: 10,
    color: '#2196F3',
    fontWeight: '500',
  },
  processingTime: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  errorsContainer: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#ffebee',
    borderRadius: 8,
  },
  errorsTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F44336',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#F44336',
    lineHeight: 16,
  },
  moreErrors: {
    fontSize: 12,
    color: '#F44336',
    fontStyle: 'italic',
    marginTop: 2,
  },
  warningsContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#fff3e0',
    borderRadius: 8,
  },
  warningsTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FF9800',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    color: '#FF9800',
    lineHeight: 16,
  },
  moreWarnings: {
    fontSize: 12,
    color: '#FF9800',
    fontStyle: 'italic',
    marginTop: 2,
  },
});