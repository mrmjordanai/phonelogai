import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@phonelogai/shared/i18n';
import { AuthProvider } from './src/components/AuthProvider';
import { SettingsProvider } from './src/contexts/SettingsContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { StatusBar } from 'expo-status-bar';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
      retry: (failureCount, error) => {
        // Don't retry on 400/401/403 errors
        if (error instanceof Error && error.message.includes('4')) {
          return false;
        }
        return failureCount < 3;
      },
    },
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <SettingsProvider>
            <AuthProvider>
              <NavigationContainer>
                <AppNavigator />
                <StatusBar style="auto" />
              </NavigationContainer>
            </AuthProvider>
          </SettingsProvider>
        </I18nextProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}