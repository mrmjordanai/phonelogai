/**
 * EmptyState Component
 * Welcome screen when chat is empty
 */

import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity
} from 'react-native';

interface EmptyStateProps {
  onSampleQuery?: (_query: string) => void;
}

const EmptyState: React.FC<EmptyStateProps> = memo(({ onSampleQuery }) => {
  const sampleQueries = [
    "Show me my top 5 contacts by call frequency",
    "How many SMS messages did I send last month?",
    "Who called me most on weekends?",
    "Show calls longer than 10 minutes from this week"
  ];

  return (
    <View style={styles.container}>
      {/* Welcome header */}
      <View style={styles.header}>
        <Text style={styles.welcomeEmoji}>🤖</Text>
        <Text style={styles.title}>Chat with Your Data</Text>
        <Text style={styles.subtitle}>
          Ask me anything about your calls and messages using natural language
        </Text>
      </View>

      {/* Features */}
      <View style={styles.featuresContainer}>
        <Text style={styles.featuresTitle}>What I can help you with:</Text>
        
        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>📞</Text>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Call Analysis</Text>
            <Text style={styles.featureDescription}>
              Find patterns, analyze duration, identify top contacts
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>💬</Text>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Message Statistics</Text>
            <Text style={styles.featureDescription}>
              Count messages, analyze messaging patterns
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>📊</Text>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Data Insights</Text>
            <Text style={styles.featureDescription}>
              Get charts, tables, and summaries of your communication data
            </Text>
          </View>
        </View>
      </View>

      {/* Sample queries */}
      {onSampleQuery && (
        <View style={styles.samplesContainer}>
          <Text style={styles.samplesTitle}>Try these sample queries:</Text>
          {sampleQueries.map((query, index) => (
            <TouchableOpacity
              key={index}
              style={styles.sampleQuery}
              onPress={() => onSampleQuery(query)}
              accessibilityRole="button"
              accessibilityLabel={`Sample query: ${query}`}
            >
              <Text style={styles.sampleQueryText}>"{query}"</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Powered by AI • Your data stays private
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  welcomeEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1D1D1F',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 24,
  },
  featuresContainer: {
    marginBottom: 32,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 16,
    width: 32,
    textAlign: 'center',
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
  },
  samplesContainer: {
    marginBottom: 32,
  },
  samplesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 12,
  },
  sampleQuery: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  sampleQueryText: {
    fontSize: 14,
    color: '#007AFF',
    fontStyle: 'italic',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  footerText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
  },
});

EmptyState.displayName = 'EmptyState';

export { EmptyState };