import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { DataCollectionMethod, PlatformCapabilities } from '../../../services/DataCollectionGuidanceService';

interface GuidanceSectionProps {
  selectedMethod: DataCollectionMethod | null;
  capabilities: PlatformCapabilities | null;
  onBack: () => void;
}

export function GuidanceSection({ selectedMethod, capabilities, onBack }: GuidanceSectionProps) {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#2196F3" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Help & Guidance</Text>
          <Text style={styles.subtitle}>Step-by-step instructions</Text>
        </View>
      </View>

      {selectedMethod ? (
        <View style={styles.methodGuidance}>
          <View style={styles.methodCard}>
            <Text style={styles.methodName}>{selectedMethod.name}</Text>
            <Text style={styles.methodDescription}>{selectedMethod.description}</Text>
          </View>

          <View style={styles.stepsCard}>
            <Text style={styles.cardTitle}>Instructions</Text>
            {selectedMethod.steps.map((step, index) => (
              <View key={index} style={styles.stepItem}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.generalGuidance}>
          <Text style={styles.sectionTitle}>Getting Started</Text>
          <Text style={styles.guidanceText}>
            Select a data collection method to see specific instructions for your platform.
          </Text>
          
          {capabilities && (
            <View style={styles.platformInfo}>
              <Text style={styles.platformTitle}>Your Platform: {capabilities.platform}</Text>
              <Text style={styles.platformDescription}>{capabilities.deviceInfo}</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  methodGuidance: {
    gap: 16,
  },
  methodCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  methodName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  methodDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  stepsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  stepItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  generalGuidance: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  guidanceText: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 20,
  },
  platformInfo: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
  },
  platformTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  platformDescription: {
    fontSize: 14,
    color: '#666',
  },
});