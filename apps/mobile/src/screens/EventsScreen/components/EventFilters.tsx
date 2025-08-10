import * as React from 'react';
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Switch,
  ViewStyle,
} from 'react-native';
import { EventFilters as EventFiltersType, QuickFilter } from '../types';

interface EventFiltersProps {
  filters: EventFiltersType;
  quickFilters: QuickFilter[];
  onFiltersChange: (filters: Partial<EventFiltersType>) => void;
  onQuickFilterPress: (quickFilter: QuickFilter) => void;
  onClearAll: () => void;
  style?: ViewStyle;
}

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  filters: EventFiltersType;
  onFiltersChange: (filters: Partial<EventFiltersType>) => void;
}

// Filter option components
const FilterOption = ({ 
  label, 
  selected, 
  onPress, 
  icon 
}: { 
  label: string; 
  selected: boolean; 
  onPress: () => void; 
  icon?: string;
}) => (
  <TouchableOpacity
    style={[styles.filterOption, selected && styles.filterOptionSelected]}
    onPress={onPress}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityState={{ selected }}
  >
    {icon && <Text style={styles.filterOptionIcon}>{icon}</Text>}
    <Text style={[styles.filterOptionText, selected && styles.filterOptionTextSelected]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const DateRangePicker = ({ 
  startDate, 
  endDate, 
  onStartDateChange, 
  onEndDateChange 
}: {
  startDate?: Date;
  endDate?: Date;
  onStartDateChange: (date?: Date) => void;
  onEndDateChange: (date?: Date) => void;
}) => {
  const presets = [
    { label: 'Today', start: new Date(new Date().setHours(0, 0, 0, 0)), end: new Date() },
    { label: 'Yesterday', start: new Date(Date.now() - 24 * 60 * 60 * 1000), end: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    { label: 'Last 7 days', start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), end: new Date() },
    { label: 'Last 30 days', start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
  ];

  return (
    <View style={styles.dateRangeContainer}>
      <Text style={styles.sectionTitle}>Date Range</Text>
      <View style={styles.datePresets}>
        {presets.map((preset, index) => (
          <TouchableOpacity
            key={index}
            style={styles.datePreset}
            onPress={() => {
              onStartDateChange(preset.start);
              onEndDateChange(preset.end);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.datePresetText}>{preset.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      
      {(startDate || endDate) && (
        <View style={styles.selectedDateRange}>
          <Text style={styles.selectedDateText}>
            {startDate ? startDate.toLocaleDateString() : 'Start'} - {endDate ? endDate.toLocaleDateString() : 'End'}
          </Text>
          <TouchableOpacity
            onPress={() => {
              onStartDateChange(undefined);
              onEndDateChange(undefined);
            }}
            style={styles.clearDateButton}
          >
            <Text style={styles.clearDateText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const DurationRangePicker = ({ 
  min, 
  max, 
  onMinChange, 
  onMaxChange 
}: {
  min?: number;
  max?: number;
  onMinChange: (min?: number) => void;
  onMaxChange: (max?: number) => void;
}) => {
  const presets = [
    { label: 'Quick (< 30s)', min: 0, max: 30 },
    { label: 'Short (30s - 2m)', min: 30, max: 120 },
    { label: 'Medium (2m - 10m)', min: 120, max: 600 },
    { label: 'Long (> 10m)', min: 600, max: undefined },
  ];

  return (
    <View style={styles.durationContainer}>
      <Text style={styles.sectionTitle}>Call Duration</Text>
      <View style={styles.durationPresets}>
        {presets.map((preset, index) => (
          <TouchableOpacity
            key={index}
            style={styles.durationPreset}
            onPress={() => {
              onMinChange(preset.min);
              onMaxChange(preset.max);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.durationPresetText}>{preset.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      
      {(min !== undefined || max !== undefined) && (
        <View style={styles.selectedDuration}>
          <Text style={styles.selectedDurationText}>
            {min !== undefined ? `${min}s` : '0s'} - {max !== undefined ? `${max}s` : '∞'}
          </Text>
          <TouchableOpacity
            onPress={() => {
              onMinChange(undefined);
              onMaxChange(undefined);
            }}
            style={styles.clearDurationButton}
          >
            <Text style={styles.clearDurationText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

function FilterModal({ visible, onClose, filters, onFiltersChange }: FilterModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
            <Text style={styles.modalCloseText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Filter Events</Text>
          <TouchableOpacity 
            onPress={() => {
              onFiltersChange({
                type: 'all',
                direction: 'all',
                status: 'all',
                dateRange: {},
                durationRange: undefined
              });
            }}
            style={styles.modalClearButton}
          >
            <Text style={styles.modalClearText}>Clear All</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
          {/* Event Type Filter */}
          <View style={styles.filterSection}>
            <Text style={styles.sectionTitle}>Event Type</Text>
            <View style={styles.filterOptionsRow}>
              <FilterOption
                label="All"
                selected={filters.type === 'all'}
                onPress={() => onFiltersChange({ type: 'all' })}
                icon="📱"
              />
              <FilterOption
                label="Calls"
                selected={filters.type === 'call'}
                onPress={() => onFiltersChange({ type: 'call' })}
                icon="📞"
              />
              <FilterOption
                label="SMS"
                selected={filters.type === 'sms'}
                onPress={() => onFiltersChange({ type: 'sms' })}
                icon="💬"
              />
            </View>
          </View>

          {/* Direction Filter */}
          <View style={styles.filterSection}>
            <Text style={styles.sectionTitle}>Direction</Text>
            <View style={styles.filterOptionsRow}>
              <FilterOption
                label="All"
                selected={filters.direction === 'all'}
                onPress={() => onFiltersChange({ direction: 'all' })}
              />
              <FilterOption
                label="Incoming"
                selected={filters.direction === 'inbound'}
                onPress={() => onFiltersChange({ direction: 'inbound' })}
                icon="📥"
              />
              <FilterOption
                label="Outgoing"
                selected={filters.direction === 'outbound'}
                onPress={() => onFiltersChange({ direction: 'outbound' })}
                icon="📤"
              />
            </View>
          </View>

          {/* Status Filter (only for calls) */}
          {filters.type !== 'sms' && (
            <View style={styles.filterSection}>
              <Text style={styles.sectionTitle}>Call Status</Text>
              <View style={styles.filterOptionsColumn}>
                <FilterOption
                  label="All"
                  selected={filters.status === 'all'}
                  onPress={() => onFiltersChange({ status: 'all' })}
                />
                <FilterOption
                  label="Answered"
                  selected={filters.status === 'answered'}
                  onPress={() => onFiltersChange({ status: 'answered' })}
                  icon="✅"
                />
                <FilterOption
                  label="Missed"
                  selected={filters.status === 'missed'}
                  onPress={() => onFiltersChange({ status: 'missed' })}
                  icon="❌"
                />
                <FilterOption
                  label="Busy"
                  selected={filters.status === 'busy'}
                  onPress={() => onFiltersChange({ status: 'busy' })}
                  icon="🔴"
                />
                <FilterOption
                  label="Declined"
                  selected={filters.status === 'declined'}
                  onPress={() => onFiltersChange({ status: 'declined' })}
                  icon="🚫"
                />
              </View>
            </View>
          )}

          {/* Date Range Filter */}
          <View style={styles.filterSection}>
            <DateRangePicker
              startDate={filters.dateRange.start}
              endDate={filters.dateRange.end}
              onStartDateChange={(start) => onFiltersChange({ 
                dateRange: { ...filters.dateRange, start } 
              })}
              onEndDateChange={(end) => onFiltersChange({ 
                dateRange: { ...filters.dateRange, end } 
              })}
            />
          </View>

          {/* Duration Range Filter (only for calls) */}
          {filters.type !== 'sms' && (
            <View style={styles.filterSection}>
              <DurationRangePicker
                min={filters.durationRange?.min}
                max={filters.durationRange?.max}
                onMinChange={(min) => onFiltersChange({ 
                  durationRange: { ...filters.durationRange, min } 
                })}
                onMaxChange={(max) => onFiltersChange({ 
                  durationRange: { ...filters.durationRange, max } 
                })}
              />
            </View>
          )}
        </ScrollView>

        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={styles.applyButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.applyButtonText}>Apply Filters</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function EventFilters({
  filters,
  quickFilters,
  onFiltersChange,
  onQuickFilterPress,
  onClearAll,
  style
}: EventFiltersProps) {
  const [showFilterModal, setShowFilterModal] = useState(false);

  const activeFilterCount = useCallback(() => {
    let count = 0;
    if (filters.type !== 'all') count++;
    if (filters.direction !== 'all') count++;
    if (filters.status !== 'all') count++;
    if (filters.dateRange.start || filters.dateRange.end) count++;
    if (filters.durationRange) count++;
    return count;
  }, [filters]);

  const isQuickFilterActive = useCallback((quickFilter: QuickFilter) => {
    return Object.entries(quickFilter.filters).every(([key, value]) => {
      const currentValue = filters[key as keyof EventFiltersType];
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return JSON.stringify(currentValue) === JSON.stringify(value);
      }
      return currentValue === value;
    });
  }, [filters]);

  const containerStyle = [styles.container, style];
  const filterCount = activeFilterCount();

  return (
    <View style={containerStyle}>
      {/* Quick Filters */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickFiltersContainer}
      >
        {quickFilters.map((quickFilter) => (
          <TouchableOpacity
            key={quickFilter.id}
            style={[
              styles.quickFilterButton,
              isQuickFilterActive(quickFilter) && styles.quickFilterButtonActive
            ]}
            onPress={() => onQuickFilterPress(quickFilter)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: isQuickFilterActive(quickFilter) }}
          >
            {quickFilter.icon && (
              <Text style={styles.quickFilterIcon}>{quickFilter.icon}</Text>
            )}
            <Text 
              style={[
                styles.quickFilterText,
                isQuickFilterActive(quickFilter) && styles.quickFilterTextActive
              ]}
            >
              {quickFilter.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Filter Controls */}
      <View style={styles.filterControls}>
        <TouchableOpacity
          style={[styles.filterButton, filterCount > 0 && styles.filterButtonActive]}
          onPress={() => setShowFilterModal(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Advanced filters${filterCount > 0 ? `, ${filterCount} active` : ''}`}
        >
          <Text style={styles.filterIcon}>⚙️</Text>
          <Text 
            style={[
              styles.filterButtonText,
              filterCount > 0 && styles.filterButtonTextActive
            ]}
          >
            Filters
          </Text>
          {filterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {filterCount > 0 && (
          <TouchableOpacity
            style={styles.clearAllButton}
            onPress={onClearAll}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Text style={styles.clearAllText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Modal */}
      <FilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  quickFiltersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  quickFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quickFilterButtonActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  quickFilterIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  quickFilterText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  quickFilterTextActive: {
    color: '#1D4ED8',
  },
  filterControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  filterButtonActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  filterIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  filterButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  filterButtonTextActive: {
    color: '#1D4ED8',
  },
  filterBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  clearAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalCloseButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  modalCloseText: {
    fontSize: 16,
    color: '#6B7280',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalClearButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  modalClearText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  applyButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  
  // Filter section styles
  filterSection: {
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  filterOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  filterOptionsColumn: {
    marginHorizontal: -4,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    margin: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minWidth: 80,
  },
  filterOptionSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  filterOptionIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  filterOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  filterOptionTextSelected: {
    color: '#1D4ED8',
  },
  
  // Date range styles
  dateRangeContainer: {
    marginBottom: 8,
  },
  datePresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  datePreset: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    margin: 4,
  },
  datePresetText: {
    fontSize: 14,
    color: '#374151',
  },
  selectedDateRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  selectedDateText: {
    fontSize: 14,
    color: '#1D4ED8',
    fontWeight: '500',
  },
  clearDateButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearDateText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  
  // Duration range styles
  durationContainer: {
    marginBottom: 8,
  },
  durationPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  durationPreset: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    margin: 4,
  },
  durationPresetText: {
    fontSize: 14,
    color: '#374151',
  },
  selectedDuration: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  selectedDurationText: {
    fontSize: 14,
    color: '#1D4ED8',
    fontWeight: '500',
  },
  clearDurationButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearDurationText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
});

export default EventFilters;