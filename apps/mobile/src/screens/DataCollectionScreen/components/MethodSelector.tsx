import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';

import { DataCollectionMethod, PlatformCapabilities } from '../../../services/DataCollectionGuidanceService';

interface MethodSelectorProps {
  capabilities: PlatformCapabilities | null;
  recommendedMethods: DataCollectionMethod[];
  selectedMethod: DataCollectionMethod | null;
  onMethodSelected: (_method: DataCollectionMethod) => void;
  onTabChange: (_tab: 'methods' | 'import' | 'manual' | 'contacts' | 'help') => void;
}

export function MethodSelector({
  capabilities,
  recommendedMethods,
  selectedMethod,
  onMethodSelected,
  onTabChange,
}: MethodSelectorProps) {
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return '#4CAF50';
      case 'medium': return '#FF9800';
      case 'hard': return '#F44336';
      default: return '#757575';
    }
  };

  const getMethodIcon = (methodId: string) => {
    if (methodId.includes('carrier')) return 'cloud-download';
    if (methodId.includes('android')) return 'android';
    if (methodId.includes('ios')) return 'phone-iphone';
    if (methodId.includes('manual')) return 'edit';
    if (methodId.includes('contacts')) return 'contacts';
    return 'storage';
  };

  const renderMethod = ({ item: method }: { item: DataCollectionMethod }) => {
    const isRecommended = capabilities?.recommendedMethods.includes(method.id);
    const isSelected = selectedMethod?.id === method.id;

    return (
      <TouchableOpacity
        style={[
          styles.methodCard,
          isSelected && styles.selectedMethod,
          isRecommended && styles.recommendedMethod,
        ]}
        onPress={() => onMethodSelected(method)}
      >
        <View style={styles.methodHeader}>
          <View style={styles.methodIcon}>
            <Icon 
              name={getMethodIcon(method.id)} 
              size={24} 
              color={isSelected ? '#fff' : '#2196F3'} 
            />
          </View>
          <View style={styles.methodInfo}>
            <View style={styles.methodTitleRow}>
              <Text style={[styles.methodName, isSelected && styles.selectedText]}>
                {method.name}
              </Text>
              {isRecommended && (
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedText}>Recommended</Text>
                </View>
              )}
            </View>
            <Text style={[styles.methodDescription, isSelected && styles.selectedText]}>
              {method.description}
            </Text>
          </View>
        </View>

        <View style={styles.methodDetails}>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Icon name="schedule" size={16} color={isSelected ? '#fff' : '#666'} />
              <Text style={[styles.detailText, isSelected && styles.selectedText]}>
                {method.timeRequired}
              </Text>
            </View>
            <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(method.difficulty) }]}>
              <Text style={styles.difficultyText}>
                {method.difficulty.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.dataTypes}>
            {method.dataTypes.map((type) => (
              <View key={type} style={styles.dataTypeBadge}>
                <Text style={[styles.dataTypeText, isSelected && styles.selectedText]}>
                  {type.toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.methodActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              onMethodSelected(method);
              if (method.id.startsWith('file_import')) {
                onTabChange('import');
              } else if (method.id === 'manual_entry') {
                onTabChange('manual');
              } else {
                onTabChange('help');
              }
            }}
          >
            <Text style={[styles.actionText, isSelected && styles.selectedText]}>
              Get Started
            </Text>
            <Icon name="arrow-forward" size={16} color={isSelected ? '#fff' : '#2196F3'} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {capabilities && (
        <View style={styles.header}>
          <Text style={styles.title}>Data Collection Methods</Text>
          <Text style={styles.subtitle}>
            Choose how you'd like to import your communication data
          </Text>
          
          <View style={styles.platformInfo}>
            <Icon name="info" size={16} color="#666" />
            <Text style={styles.platformText}>
              {capabilities.deviceInfo} • {recommendedMethods.length} methods available
            </Text>
          </View>
        </View>
      )}

      <FlatList
        data={recommendedMethods}
        keyExtractor={(item) => item.id}
        renderItem={renderMethod}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => onTabChange('import')}
        >
          <Icon name="upload-file" size={20} color="#2196F3" />
          <Text style={styles.quickActionText}>Import Files</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => onTabChange('manual')}
        >
          <Icon name="edit" size={20} color="#2196F3" />
          <Text style={styles.quickActionText}>Manual Entry</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => onTabChange('contacts')}
        >
          <Icon name="contacts" size={20} color="#2196F3" />
          <Text style={styles.quickActionText}>Import Contacts</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => onTabChange('help')}
        >
          <Icon name="help" size={20} color="#2196F3" />
          <Text style={styles.quickActionText}>Get Help</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  platformInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  platformText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  listContent: {
    paddingBottom: 20,
  },
  methodCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectedMethod: {
    backgroundColor: '#2196F3',
    borderColor: '#1976D2',
  },
  recommendedMethod: {
    borderColor: '#4CAF50',
    borderWidth: 2,
  },
  methodHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  methodInfo: {
    flex: 1,
  },
  methodTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  methodName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  methodDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  recommendedBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  recommendedText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  methodDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  difficultyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  difficultyText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  dataTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dataTypeBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  dataTypeText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  methodActions: {
    alignItems: 'flex-end',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '500',
    marginRight: 4,
  },
  selectedText: {
    color: '#fff',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  quickActionButton: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 8,
  },
  quickActionText: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '500',
    marginTop: 4,
  },
});