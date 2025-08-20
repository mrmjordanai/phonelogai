import { useState, useEffect, useCallback } from 'react';
import { DataCollectionGuidanceService, DataCollectionMethod, PlatformCapabilities } from '../../../services/DataCollectionGuidanceService';

interface UseDataCollectionReturn {
  capabilities: PlatformCapabilities | null;
  recommendedMethods: DataCollectionMethod[];
  allMethods: DataCollectionMethod[];
  isLoading: boolean;
  error: string | null;
  refreshCapabilities: () => Promise<void>;
  getRecommendedStrategy: (_userNeeds: {
    dataTypes: ('calls' | 'sms' | 'contacts')[];
    timeRange: 'recent' | 'historical' | 'all';
    technicalSkill: 'beginner' | 'intermediate' | 'advanced';
    timeAvailable: 'minimal' | 'moderate' | 'extensive';
  }) => ReturnType<typeof DataCollectionGuidanceService.getRecommendedStrategy>;
}

export function useDataCollection(): UseDataCollectionReturn {
  const [capabilities, setCapabilities] = useState<PlatformCapabilities | null>(null);
  const [recommendedMethods, setRecommendedMethods] = useState<DataCollectionMethod[]>([]);
  const [allMethods, setAllMethods] = useState<DataCollectionMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCapabilities = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get platform capabilities
      const platformCapabilities = await DataCollectionGuidanceService.getPlatformCapabilities();
      setCapabilities(platformCapabilities);

      // Get all available methods
      const methods = DataCollectionGuidanceService.getDataCollectionMethods();
      setAllMethods(methods);

      // Filter methods by platform compatibility
      const compatibleMethods = methods.filter(method =>
        method.platforms.includes(platformCapabilities.platform)
      );

      // Sort by recommended order
      const sortedMethods = compatibleMethods.sort((a, b) => {
        const recommendedOrder = platformCapabilities.recommendedMethods;
        const aIndex = recommendedOrder.indexOf(a.id);
        const bIndex = recommendedOrder.indexOf(b.id);
        
        // Put recommended methods first
        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex;
        } else if (aIndex !== -1) {
          return -1;
        } else if (bIndex !== -1) {
          return 1;
        }
        
        return 0;
      });

      setRecommendedMethods(sortedMethods);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load data collection capabilities';
      setError(errorMessage);
      console.error('Error loading data collection capabilities:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshCapabilities = useCallback(async () => {
    await loadCapabilities();
  }, [loadCapabilities]);

  const getRecommendedStrategy = useCallback((userNeeds: {
    dataTypes: ('calls' | 'sms' | 'contacts')[];
    timeRange: 'recent' | 'historical' | 'all';
    technicalSkill: 'beginner' | 'intermediate' | 'advanced';
    timeAvailable: 'minimal' | 'moderate' | 'extensive';
  }) => {
    return DataCollectionGuidanceService.getRecommendedStrategy(userNeeds);
  }, []);

  useEffect(() => {
    loadCapabilities();
  }, [loadCapabilities]);

  return {
    capabilities,
    recommendedMethods,
    allMethods,
    isLoading,
    error,
    refreshCapabilities,
    getRecommendedStrategy,
  };
}