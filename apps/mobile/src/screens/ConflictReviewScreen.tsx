import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConflictEvent, ConflictType } from '@phonelogai/types';
import { ConflictResolver } from '../services/ConflictResolver';
import { useAuth } from '../components/AuthProvider';

interface ConflictReviewScreenProps {
  navigation: { navigate: (_screen: string, _params?: object) => void; goBack: () => void };
}

export const ConflictReviewScreen: React.FC<ConflictReviewScreenProps> = ({ navigation }) => {
  const { user } = useAuth();
  const [conflicts, setConflicts] = useState<ConflictEvent[]>([]);
  const [selectedConflicts, setSelectedConflicts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isResolving, setIsResolving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | ConflictType>('all');

  useEffect(() => {
    loadConflicts();
  }, []);

  const loadConflicts = useCallback(async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const detectedConflicts = await ConflictResolver.detectConflictsBatch(user.id, {
        batchSize: 50,
        timestampTolerance: 1
      });
      setConflicts(detectedConflicts);
    } catch (error) {
      console.error('Error loading conflicts:', error);
      Alert.alert('Error', 'Failed to load conflicts. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadConflicts();
    setRefreshing(false);
  }, [loadConflicts]);

  const handleSelectConflict = useCallback((conflictId: string) => {
    setSelectedConflicts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(conflictId)) {
        newSet.delete(conflictId);
      } else {
        newSet.add(conflictId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const filteredConflicts = getFilteredConflicts();
    if (selectedConflicts.size === filteredConflicts.length) {
      setSelectedConflicts(new Set());
    } else {
      setSelectedConflicts(new Set(filteredConflicts.map(c => c.id)));
    }
  }, [conflicts, filter, selectedConflicts.size]);

  const handleResolveSelected = useCallback(async (strategy: 'automatic' | 'manual') => {
    if (selectedConflicts.size === 0) {
      Alert.alert('No Selection', 'Please select conflicts to resolve.');
      return;
    }

    try {
      setIsResolving(true);
      const conflictsToResolve = conflicts.filter(c => selectedConflicts.has(c.id));
      
      if (strategy === 'automatic') {
        const resolved = await ConflictResolver.resolveConflictsAutomatically(conflictsToResolve);
        Alert.alert('Success', `Automatically resolved ${resolved.length} conflicts.`);
      } else {
        // For manual resolution, show detailed review for each conflict
        navigation.navigate('ConflictDetail', { 
          conflicts: conflictsToResolve,
          onResolved: loadConflicts 
        });
        return;
      }

      // Remove resolved conflicts from the list
      setConflicts(prev => prev.filter(c => !selectedConflicts.has(c.id)));
      setSelectedConflicts(new Set());
    } catch (error) {
      console.error('Error resolving conflicts:', error);
      Alert.alert('Error', 'Failed to resolve conflicts. Please try again.');
    } finally {
      setIsResolving(false);
    }
  }, [selectedConflicts, conflicts, navigation, loadConflicts]);

  const getFilteredConflicts = useCallback(() => {
    if (filter === 'all') return conflicts;
    return conflicts.filter(c => c.conflict_type === filter);
  }, [conflicts, filter]);

  const getConflictTypeColor = (type: ConflictType): string => {
    switch (type) {
      case 'exact': return '#e74c3c';
      case 'time_variance': return '#f39c12';
      case 'fuzzy': return '#3498db';
      default: return '#95a5a6';
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString();
  };

  const renderConflictItem = (conflict: ConflictEvent) => (
    <TouchableOpacity
      key={conflict.id}
      style={[
        styles.conflictItem,
        selectedConflicts.has(conflict.id) && styles.selectedConflictItem
      ]}
      onPress={() => handleSelectConflict(conflict.id)}
    >
      <View style={styles.conflictHeader}>
        <View style={styles.conflictTypeContainer}>
          <View 
            style={[
              styles.conflictTypeBadge,
              { backgroundColor: getConflictTypeColor(conflict.conflict_type) }
            ]}
          >
            <Text style={styles.conflictTypeBadgeText}>
              {conflict.conflict_type.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.similarityText}>
            {Math.round(conflict.similarity * 100)}% match
          </Text>
        </View>
        <Text style={styles.conflictStrategy}>
          {conflict.resolution_strategy}
        </Text>
      </View>

      <View style={styles.eventsComparison}>
        <View style={styles.eventColumn}>
          <Text style={styles.eventLabel}>Original Event</Text>
          <Text style={styles.eventDetail}>
            {conflict.original.type === 'call' ? '📞' : '💬'} {conflict.original.number}
          </Text>
          <Text style={styles.eventTimestamp}>
            {formatTimestamp(conflict.original.ts)}
          </Text>
          {conflict.original.duration && (
            <Text style={styles.eventDetail}>
              Duration: {conflict.original.duration}s
            </Text>
          )}
          {conflict.original.content && (
            <Text style={styles.eventContent} numberOfLines={2}>
              {conflict.original.content}
            </Text>
          )}
          <Text style={styles.qualityScore}>
            Quality: {Math.round(conflict.original_quality.overall * 100)}%
          </Text>
        </View>

        <View style={styles.separator} />

        <View style={styles.eventColumn}>
          <Text style={styles.eventLabel}>Duplicate Event</Text>
          <Text style={styles.eventDetail}>
            {conflict.duplicate.type === 'call' ? '📞' : '💬'} {conflict.duplicate.number}
          </Text>
          <Text style={styles.eventTimestamp}>
            {formatTimestamp(conflict.duplicate.ts)}
          </Text>
          {conflict.duplicate.duration && (
            <Text style={styles.eventDetail}>
              Duration: {conflict.duplicate.duration}s
            </Text>
          )}
          {conflict.duplicate.content && (
            <Text style={styles.eventContent} numberOfLines={2}>
              {conflict.duplicate.content}
            </Text>
          )}
          <Text style={styles.qualityScore}>
            Quality: {Math.round(conflict.duplicate_quality.overall * 100)}%
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const filteredConflicts = getFilteredConflicts();

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3498db" />
          <Text style={styles.loadingText}>Loading conflicts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Conflict Resolution</Text>
        <Text style={styles.subtitle}>
          {filteredConflicts.length} conflict{filteredConflicts.length !== 1 ? 's' : ''} found
        </Text>
      </View>

      {/* Filter Buttons */}
      <ScrollView horizontal style={styles.filterContainer} showsHorizontalScrollIndicator={false}>
        {['all', 'exact', 'time_variance', 'fuzzy'].map((filterType) => (
          <TouchableOpacity
            key={filterType}
            style={[
              styles.filterButton,
              filter === filterType && styles.activeFilterButton
            ]}
            onPress={() => setFilter(filterType as ConflictType | 'all')}
          >
            <Text style={[
              styles.filterButtonText,
              filter === filterType && styles.activeFilterButtonText
            ]}>
              {filterType === 'all' ? 'All' : filterType.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Action Buttons */}
      {filteredConflicts.length > 0 && (
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={styles.selectAllButton}
            onPress={handleSelectAll}
          >
            <Text style={styles.selectAllButtonText}>
              {selectedConflicts.size === filteredConflicts.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>

          {selectedConflicts.size > 0 && (
            <View style={styles.resolveButtons}>
              <TouchableOpacity
                style={[styles.resolveButton, styles.autoResolveButton]}
                onPress={() => handleResolveSelected('automatic')}
                disabled={isResolving}
              >
                <Text style={styles.resolveButtonText}>
                  Auto Resolve ({selectedConflicts.size})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.resolveButton, styles.manualResolveButton]}
                onPress={() => handleResolveSelected('manual')}
                disabled={isResolving}
              >
                <Text style={styles.resolveButtonText}>
                  Manual Review ({selectedConflicts.size})
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Conflicts List */}
      <ScrollView
        style={styles.conflictsList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredConflicts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No conflicts found! Your data is clean. ✅
            </Text>
          </View>
        ) : (
          filteredConflicts.map(renderConflictItem)
        )}
      </ScrollView>

      {/* Loading Overlay */}
      {isResolving && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingOverlayText}>Resolving conflicts...</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  subtitle: {
    fontSize: 14,
    color: '#7f8c8d',
    marginTop: 4,
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#ecf0f1',
  },
  activeFilterButton: {
    backgroundColor: '#3498db',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#7f8c8d',
    textTransform: 'capitalize',
  },
  activeFilterButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  actionContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  selectAllButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#ecf0f1',
  },
  selectAllButtonText: {
    fontSize: 14,
    color: '#2c3e50',
    fontWeight: '600',
  },
  resolveButtons: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 12,
  },
  resolveButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  autoResolveButton: {
    backgroundColor: '#27ae60',
  },
  manualResolveButton: {
    backgroundColor: '#f39c12',
  },
  resolveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  conflictsList: {
    flex: 1,
  },
  conflictItem: {
    margin: 16,
    marginBottom: 12,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedConflictItem: {
    borderColor: '#3498db',
    backgroundColor: '#f8fbff',
  },
  conflictHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  conflictTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  conflictTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  conflictTypeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  similarityText: {
    fontSize: 12,
    color: '#7f8c8d',
    fontWeight: '600',
  },
  conflictStrategy: {
    fontSize: 12,
    color: '#95a5a6',
    textTransform: 'capitalize',
  },
  eventsComparison: {
    flexDirection: 'row',
  },
  eventColumn: {
    flex: 1,
  },
  separator: {
    width: 1,
    backgroundColor: '#e1e8ed',
    marginHorizontal: 16,
  },
  eventLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 4,
  },
  eventDetail: {
    fontSize: 14,
    color: '#2c3e50',
    marginBottom: 2,
  },
  eventTimestamp: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  eventContent: {
    fontSize: 12,
    color: '#34495e',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  qualityScore: {
    fontSize: 11,
    color: '#27ae60',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    color: '#7f8c8d',
    textAlign: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlayText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
  },
});