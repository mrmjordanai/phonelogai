import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
} from 'react-native';
import { ContactFiltersProps, ContactFiltersState } from '../types';

export function ContactFilters({
  filters,
  onFiltersChange,
  onClearFilters,
  availableTags,
}: ContactFiltersProps) {
  const [showSortModal, setShowSortModal] = useState(false);

  // Handle sort option change
  const handleSortChange = (sortBy: ContactFiltersState['sortBy']) => {
    onFiltersChange({ sortBy });
    setShowSortModal(false);
  };

  // Handle sort direction toggle
  const handleSortDirectionToggle = () => {
    const newDirection = filters.sortDirection === 'asc' ? 'desc' : 'asc';
    onFiltersChange({ sortDirection: newDirection });
  };

  // Handle tag selection
  const handleTagToggle = (tag: string) => {
    const newTags = filters.selectedTags.includes(tag)
      ? filters.selectedTags.filter(t => t !== tag)
      : [...filters.selectedTags, tag];
    
    onFiltersChange({ selectedTags: newTags });
  };

  // Get sort button text
  const getSortButtonText = () => {
    const sortLabels = {
      relevance: 'Relevance',
      name: 'Name',
      last_contact: 'Last Contact',
      interaction_frequency: 'Activity',
    };
    
    const label = sortLabels[filters.sortBy];
    const direction = filters.sortDirection === 'asc' ? '↑' : '↓';
    return `${label} ${direction}`;
  };

  // Check if filters are active
  const hasActiveFilters = filters.selectedTags.length > 0 || 
                           filters.sortBy !== 'relevance' || 
                           filters.sortDirection !== 'asc';

  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Sort Button */}
        <TouchableOpacity
          style={[styles.filterButton, filters.sortBy !== 'relevance' && styles.activeFilterButton]}
          onPress={() => setShowSortModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Sort options"
        >
          <Text style={[styles.filterButtonText, filters.sortBy !== 'relevance' && styles.activeFilterButtonText]}>
            {getSortButtonText()}
          </Text>
        </TouchableOpacity>

        {/* Tag Filters */}
        {availableTags.map(tag => {
          const isSelected = filters.selectedTags.includes(tag);
          return (
            <TouchableOpacity
              key={tag}
              style={[styles.filterButton, isSelected && styles.activeFilterButton]}
              onPress={() => handleTagToggle(tag)}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${tag}`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.filterButtonText, isSelected && styles.activeFilterButtonText]}>
                {tag}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={onClearFilters}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Sort Modal */}
      <Modal
        visible={showSortModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSortModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setShowSortModal(false)}
          activeOpacity={1}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sort by</Text>
              <TouchableOpacity
                onPress={() => setShowSortModal(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Sort Options */}
            {[
              { key: 'relevance', label: 'Relevance' },
              { key: 'name', label: 'Name' },
              { key: 'last_contact', label: 'Last Contact' },
              { key: 'interaction_frequency', label: 'Activity' },
            ].map(option => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.modalOption,
                  filters.sortBy === option.key && styles.modalOptionSelected
                ]}
                onPress={() => handleSortChange(option.key as ContactFiltersState['sortBy'])}
              >
                <Text style={[
                  styles.modalOptionText,
                  filters.sortBy === option.key && styles.modalOptionTextSelected
                ]}>
                  {option.label}
                </Text>
                {filters.sortBy === option.key && (
                  <TouchableOpacity
                    onPress={handleSortDirectionToggle}
                    style={styles.sortDirectionButton}
                  >
                    <Text style={styles.sortDirectionText}>
                      {filters.sortDirection === 'asc' ? '↑' : '↓'}
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  activeFilterButton: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  activeFilterButtonText: {
    color: '#ffffff',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#ef4444',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '80%',
    maxWidth: 300,
    paddingVertical: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalCloseButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#6b7280',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  modalOptionSelected: {
    backgroundColor: '#f0f9ff',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#374151',
  },
  modalOptionTextSelected: {
    color: '#3b82f6',
    fontWeight: '500',
  },
  sortDirectionButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
  },
  sortDirectionText: {
    fontSize: 18,
    color: '#374151',
  },
});