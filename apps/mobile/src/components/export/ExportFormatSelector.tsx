/**
 * Export Format Selector
 * Component for choosing export format with preview
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView
} from 'react-native';
import { ExportFormat, SizeEstimate } from '../../types/export';

interface ExportFormatSelectorProps {
  formats: Array<{
    format: ExportFormat;
    name: string;
    description: string;
    icon: string;
  }>;
  selectedFormat: ExportFormat;
   
  onFormatSelect: (_format: ExportFormat) => void;
  sizeEstimate?: SizeEstimate | null;
}

interface FormatCardProps {
  format: {
    format: ExportFormat;
    name: string;
    description: string;
    icon: string;
  };
  isSelected: boolean;
  onPress: () => void;
  sizeEstimate?: SizeEstimate | null;
}

function FormatCard({ format, isSelected, onPress, sizeEstimate }: FormatCardProps) {
  return (
    <TouchableOpacity
      style={[styles.formatCard, isSelected && styles.formatCardSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.formatCardContent}>
        <Text style={styles.formatIcon}>{format.icon}</Text>
        <View style={styles.formatInfo}>
          <Text style={[styles.formatName, isSelected && styles.formatNameSelected]}>
            {format.name}
          </Text>
          <Text style={[styles.formatDescription, isSelected && styles.formatDescriptionSelected]}>
            {format.description}
          </Text>
          {sizeEstimate && isSelected && (
            <Text style={styles.formatSize}>
              Estimated size: {sizeEstimate.readable}
            </Text>
          )}
        </View>
        {isSelected && (
          <View style={styles.selectedIndicator}>
            <Text style={styles.selectedCheck}>✓</Text>
          </View>
        )}
      </View>
      
      {/* Format-specific features */}
      <View style={styles.formatFeatures}>
        {format.format === 'excel' && (
          <View style={styles.featureTag}>
            <Text style={styles.featureText}>Charts</Text>
          </View>
        )}
        {format.format === 'pdf' && (
          <View style={styles.featureTag}>
            <Text style={styles.featureText}>Reports</Text>
          </View>
        )}
        {format.format === 'zip' && (
          <View style={styles.featureTag}>
            <Text style={styles.featureText}>Multiple Formats</Text>
          </View>
        )}
        {(format.format === 'csv' || format.format === 'excel') && (
          <View style={styles.featureTag}>
            <Text style={styles.featureText}>Spreadsheet</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export function ExportFormatSelector({
  formats,
  selectedFormat,
  onFormatSelect,
  sizeEstimate
}: ExportFormatSelectorProps) {
  return (
    <ScrollView 
      style={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {formats.map((format) => (
        <FormatCard
          key={format.format}
          format={format}
          isSelected={selectedFormat === format.format}
          onPress={() => onFormatSelect(format.format)}
          sizeEstimate={selectedFormat === format.format ? sizeEstimate : null}
        />
      ))}

      {/* Format Comparison */}
      <View style={styles.comparisonCard}>
        <Text style={styles.comparisonTitle}>Format Comparison</Text>
        <View style={styles.comparisonTable}>
          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonHeader}>Format</Text>
            <Text style={styles.comparisonHeader}>Best For</Text>
            <Text style={styles.comparisonHeader}>File Size</Text>
          </View>
          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonCell}>CSV</Text>
            <Text style={styles.comparisonCell}>Spreadsheets</Text>
            <Text style={styles.comparisonCell}>Small</Text>
          </View>
          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonCell}>JSON</Text>
            <Text style={styles.comparisonCell}>Technical Use</Text>
            <Text style={styles.comparisonCell}>Medium</Text>
          </View>
          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonCell}>Excel</Text>
            <Text style={styles.comparisonCell}>Analysis</Text>
            <Text style={styles.comparisonCell}>Medium</Text>
          </View>
          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonCell}>PDF</Text>
            <Text style={styles.comparisonCell}>Reports</Text>
            <Text style={styles.comparisonCell}>Large</Text>
          </View>
          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonCell}>ZIP</Text>
            <Text style={styles.comparisonCell}>Multiple</Text>
            <Text style={styles.comparisonCell}>Variable</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  formatCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  formatCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#F0F7FF',
  },
  formatCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  formatIcon: {
    fontSize: 24,
    marginRight: 12,
    width: 32,
    textAlign: 'center',
  },
  formatInfo: {
    flex: 1,
  },
  formatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  formatNameSelected: {
    color: '#1D4ED8',
  },
  formatDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  formatDescriptionSelected: {
    color: '#3B82F6',
  },
  formatSize: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCheck: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  formatFeatures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  featureTag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  featureText: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
  },

  // Comparison Table
  comparisonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  comparisonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  comparisonTable: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
  },
  comparisonRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  comparisonHeader: {
    flex: 1,
    padding: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    backgroundColor: '#F9FAFB',
    textAlign: 'center',
  },
  comparisonCell: {
    flex: 1,
    padding: 8,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
});

export default ExportFormatSelector;