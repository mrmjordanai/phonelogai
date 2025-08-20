/**
 * QuerySuggestions Component
 * Tappable query suggestions to help users get started
 */

import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList
} from 'react-native';
import { QuerySuggestionsProps, QuerySuggestion } from '../types';

const QuerySuggestions: React.FC<QuerySuggestionsProps> = memo(({
  suggestions,
  onSelectSuggestion,
  visible = true
}) => {
  // Group suggestions by category
  const categorizedSuggestions = useMemo(() => {
    const grouped = suggestions.reduce((acc, suggestion) => {
      if (!acc[suggestion.category]) {
        acc[suggestion.category] = [];
      }
      acc[suggestion.category].push(suggestion);
      return acc;
    }, {} as Record<string, QuerySuggestion[]>);

    // Sort categories by importance
    const categoryOrder = ['recent', 'calls', 'sms', 'contacts', 'analytics'];
    return categoryOrder.reduce((acc, category) => {
      if (grouped[category]) {
        acc[category] = grouped[category];
      }
      return acc;
    }, {} as Record<string, QuerySuggestion[]>);
  }, [suggestions]);

  const getCategoryIcon = (category: string): string => {
    const icons = {
      calls: '📞',
      sms: '💬',
      contacts: '👥',
      analytics: '📊',
      recent: '🕒'
    };
    return icons[category as keyof typeof icons] || '❓';
  };

  const getCategoryTitle = (category: string): string => {
    const titles = {
      calls: 'Call Analysis',
      sms: 'Messages',
      contacts: 'Contacts',
      analytics: 'Analytics',
      recent: 'Recent Queries'
    };
    return titles[category as keyof typeof titles] || category.charAt(0).toUpperCase() + category.slice(1);
  };

  const renderSuggestionItem = ({ item }: { item: QuerySuggestion }) => (
    <TouchableOpacity
      style={styles.suggestionItem}
      onPress={() => onSelectSuggestion(item.query)}
      accessibilityRole="button"
      accessibilityLabel={`Query suggestion: ${item.title}`}
      accessibilityHint={item.description}
    >
      <View style={styles.suggestionContent}>
        <Text style={styles.suggestionTitle}>{item.title}</Text>
        <Text style={styles.suggestionDescription} numberOfLines={2}>
          {item.description}
        </Text>
      </View>
      
      {item.popularity && item.popularity > 80 && (
        <View style={styles.popularityBadge}>
          <Text style={styles.popularityBadgeText}>Popular</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderCategory = (category: string, categorySuggestions: QuerySuggestion[]) => (
    <View key={category} style={styles.categoryContainer}>
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryIcon}>{getCategoryIcon(category)}</Text>
        <Text style={styles.categoryTitle}>{getCategoryTitle(category)}</Text>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{categorySuggestions.length}</Text>
        </View>
      </View>

      <FlatList
        data={categorySuggestions}
        keyExtractor={item => item.id}
        renderItem={renderSuggestionItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.suggestionsList}
      />
    </View>
  );

  if (!visible || suggestions.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Suggestions</Text>
        <Text style={styles.headerSubtitle}>
          Tap a suggestion to get started
        </Text>
      </View>

      <ScrollView 
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {Object.entries(categorizedSuggestions).map(([category, categorySuggestions]) =>
          renderCategory(category, categorySuggestions)
        )}

        {/* Quick start tips */}
        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>💡 Tips</Text>
          <Text style={styles.tipsText}>
            • Be specific: "calls from John last week" instead of just "calls"{'\n'}
            • Use natural language: "How many messages did I send today?"{'\n'}
            • Ask about trends: "Show my busiest calling day this month"
          </Text>
        </View>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1D1D1F',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  scrollContainer: {
    flex: 1,
  },
  categoryContainer: {
    marginBottom: 20,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  categoryIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
    flex: 1,
  },
  categoryBadge: {
    backgroundColor: '#E5E5EA',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  suggestionsList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  suggestionItem: {
    width: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 4,
  },
  suggestionDescription: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
  },
  popularityBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FF9500',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  popularityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tipsContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 8,
  },
  tipsText: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
  },
});

QuerySuggestions.displayName = 'QuerySuggestions';

export { QuerySuggestions };