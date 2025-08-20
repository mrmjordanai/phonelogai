import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';

interface LoadingOverlayProps {
  message?: string;
  size?: 'small' | 'large';
  color?: string;
}

export function LoadingOverlay({ 
  message = 'Loading...', 
  size = 'large',
  color = '#2196F3' 
}: LoadingOverlayProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size={size} color={color} />
        {message && (
          <Text style={[styles.message, { color }]}>
            {message}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  content: {
    alignItems: 'center',
    padding: 20,
  },
  message: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
});