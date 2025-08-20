import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type TimeRangePreset = '7d' | '30d' | '90d' | '1y' | 'custom';

interface TimeRangeSelectorProps {
  selectedPreset: TimeRangePreset;
  onPresetSelect: (_preset: TimeRangePreset) => void;
  onCustomRangePress: () => void;
  dateRange: {
    from: Date;
    to: Date;
  };
}

const presetOptions: Array<{
  key: TimeRangePreset;
  label: string;
  description: string;
}> = [
  { key: '7d', label: '7 Days', description: 'Last week' },
  { key: '30d', label: '30 Days', description: 'Last month' },
  { key: '90d', label: '90 Days', description: 'Last 3 months' },
  { key: '1y', label: '1 Year', description: 'Last year' },
  { key: 'custom', label: 'Custom', description: 'Pick dates' },
];

export const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
  selectedPreset,
  onPresetSelect,
  onCustomRangePress,
  dateRange,
}) => {
  const formatDateRange = (from: Date, to: Date): string => {
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
      });
    };
    
    return `${formatDate(from)} - ${formatDate(to)}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Time Range</Text>
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
      >
        {presetOptions.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.presetButton,
              selectedPreset === option.key && styles.presetButtonActive
            ]}
            onPress={() => {
              if (option.key === 'custom') {
                onCustomRangePress();
              } else {
                onPresetSelect(option.key);
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.presetLabel,
              selectedPreset === option.key && styles.presetLabelActive
            ]}>
              {option.label}
            </Text>
            <Text style={[
              styles.presetDescription,
              selectedPreset === option.key && styles.presetDescriptionActive
            ]}>
              {option.description}
            </Text>
            
            {option.key === 'custom' && (
              <Ionicons 
                name="calendar" 
                size={12} 
                color={selectedPreset === option.key ? '#FFFFFF' : '#9CA3AF'} 
                style={styles.customIcon}
              />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Current date range display */}
      <View style={styles.dateRangeContainer}>
        <Ionicons name="calendar-outline" size={16} color="#6B7280" />
        <Text style={styles.dateRangeText}>
          {formatDateRange(dateRange.from, dateRange.to)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  scrollContainer: {
    marginBottom: 12,
  },
  scrollContent: {
    paddingRight: 16,
  },
  presetButton: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    minWidth: 80,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  presetButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  presetLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  presetLabelActive: {
    color: '#FFFFFF',
  },
  presetDescription: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  presetDescriptionActive: {
    color: '#E5E7EB',
  },
  customIcon: {
    marginTop: 4,
  },
  dateRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  dateRangeText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
    fontWeight: '500',
  },
});