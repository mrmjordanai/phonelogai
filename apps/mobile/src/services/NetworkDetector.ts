import NetInfo, { 
  NetInfoState, 
  NetInfoStateType, 
  NetInfoConnectedDetails 
} from '@react-native-netinfo/netinfo';
import { AppState, AppStateStatus } from 'react-native';

export type ConnectionType = 'wifi' | 'cellular' | 'ethernet' | 'bluetooth' | 'wimax' | 'vpn' | 'other' | 'none';
export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'none';
export type SyncStrategy = 'immediate' | 'wifi_preferred' | 'cellular_fallback' | 'offline';

export interface NetworkState {
  isConnected: boolean;
  connectionType: ConnectionType;
  connectionQuality: ConnectionQuality;
  isWiFi: boolean;
  isCellular: boolean;
  isInternetReachable: boolean | null;
  estimatedBandwidth?: number; // Mbps
  connectionStrength?: number; // 0-5 scale
  lastConnectedAt?: string;
  disconnectedDuration?: number; // milliseconds
}

export interface NetworkConfig {
  qualityCheckInterval: number; // milliseconds
  qualityTestTimeout: number; // milliseconds
  wifiPreferredThreshold: number; // hours
  cellularFallbackThreshold: number; // MB or hours
  minBandwidthForSync: number; // Mbps
  enableDetailedMetrics: boolean;
}

export interface SyncThresholds {
  wifiPreferred: {
    maxOfflineHours: number;
    maxQueueSizeMB: number;
  };
  cellularFallback: {
    maxOfflineHours: number;
    maxQueueSizeMB: number;
    maxBatchSizeMB: number;
  };
  emergencySync: {
    maxOfflineHours: number;
    maxQueueSizeMB: number;
  };
}

export interface NetworkMetrics {
  connectionUptime: number; // percentage
  averageBandwidth: number; // Mbps
  connectionStability: number; // 0-1 score
  wifiUsageRatio: number; // 0-1 ratio
  totalDataTransferred: number; // bytes
  syncSuccessRate: number; // percentage
  averageLatency: number; // milliseconds
}

class NetworkDetectorService {
  private static instance: NetworkDetectorService;
  private currentState: NetworkState;
  private config: NetworkConfig;
  private thresholds: SyncThresholds;
  private listeners: Set<(state: NetworkState) => void> = new Set();
  private qualityCheckTimer?: NodeJS.Timeout;
  private connectionHistory: NetworkState[] = [];
  private metrics: NetworkMetrics;
  private appState: AppStateStatus = 'active';
  private lastOfflineTime?: number;
  private unsubscribeNetInfo?: () => void;
  private unsubscribeAppState?: () => void;

  private constructor() {
    this.currentState = {
      isConnected: false,
      connectionType: 'none',
      connectionQuality: 'none',
      isWiFi: false,
      isCellular: false,
      isInternetReachable: null
    };

    this.config = {
      qualityCheckInterval: 30000, // 30 seconds
      qualityTestTimeout: 5000, // 5 seconds
      wifiPreferredThreshold: 24, // 24 hours
      cellularFallbackThreshold: 1, // 1 MB
      minBandwidthForSync: 0.1, // 0.1 Mbps
      enableDetailedMetrics: true
    };

    this.thresholds = {
      wifiPreferred: {
        maxOfflineHours: 1,
        maxQueueSizeMB: 0.5
      },
      cellularFallback: {
        maxOfflineHours: 24,
        maxQueueSizeMB: 1,
        maxBatchSizeMB: 0.1
      },
      emergencySync: {
        maxOfflineHours: 48,
        maxQueueSizeMB: 5
      }
    };

    this.metrics = {
      connectionUptime: 0,
      averageBandwidth: 0,
      connectionStability: 0,
      wifiUsageRatio: 0,
      totalDataTransferred: 0,
      syncSuccessRate: 0,
      averageLatency: 0
    };
  }

  public static getInstance(): NetworkDetectorService {
    if (!NetworkDetectorService.instance) {
      NetworkDetectorService.instance = new NetworkDetectorService();
    }
    return NetworkDetectorService.instance;
  }

  /**
   * Initialize network monitoring
   */
  async initialize(): Promise<void> {
    try {
      // Get initial network state
      const initialState = await NetInfo.fetch();
      this.updateNetworkState(initialState);

      // Set up network state listener
      this.unsubscribeNetInfo = NetInfo.addEventListener((state) => {
        this.updateNetworkState(state);
      });

      // Set up app state listener
      this.unsubscribeAppState = AppState.addEventListener('change', (nextAppState) => {
        this.handleAppStateChange(nextAppState);
      });

      // Start quality monitoring
      if (this.config.enableDetailedMetrics) {
        this.startQualityMonitoring();
      }

      console.log('Network detector initialized');
    } catch (error) {
      console.error('Failed to initialize network detector:', error);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.unsubscribeNetInfo?.();
    this.unsubscribeAppState?.();
    if (this.qualityCheckTimer) {
      clearInterval(this.qualityCheckTimer);
    }
    this.listeners.clear();
  }

  /**
   * Get current network state
   */
  getCurrentState(): NetworkState {
    return { ...this.currentState };
  }

  /**
   * Add network state change listener
   */
  addListener(listener: (state: NetworkState) => void): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => this.listeners.delete(listener);
  }

  /**
   * Determine sync strategy based on current conditions
   */
  determineSyncStrategy(queueSizeMB: number, offlineHours: number): SyncStrategy {
    const state = this.currentState;
    
    if (!state.isConnected || !state.isInternetReachable) {
      return 'offline';
    }

    // Emergency sync - override all preferences
    if (offlineHours >= this.thresholds.emergencySync.maxOfflineHours || 
        queueSizeMB >= this.thresholds.emergencySync.maxQueueSizeMB) {
      return 'immediate';
    }

    // WiFi preferred sync
    if (state.isWiFi || 
        (state.connectionQuality === 'excellent' && state.estimatedBandwidth && state.estimatedBandwidth > 5)) {
      return 'immediate';
    }

    // Cellular fallback conditions
    if (state.isCellular) {
      const withinFallbackTime = offlineHours >= this.thresholds.cellularFallback.maxOfflineHours;
      const withinFallbackSize = queueSizeMB >= this.thresholds.cellularFallback.maxQueueSizeMB;
      
      if (withinFallbackTime || withinFallbackSize) {
        return 'cellular_fallback';
      }
    }

    // Wait for better connection
    return 'wifi_preferred';
  }

  /**
   * Check if sync should be performed now
   */
  shouldSync(queueSizeMB: number, offlineHours: number): boolean {
    const strategy = this.determineSyncStrategy(queueSizeMB, offlineHours);
    return strategy === 'immediate' || strategy === 'cellular_fallback';
  }

  /**
   * Get recommended batch size for current connection
   */
  getRecommendedBatchSize(): number {
    const state = this.currentState;
    
    if (!state.isConnected) return 0;

    if (state.isWiFi && state.connectionQuality === 'excellent') {
      return 100; // Large batches on good WiFi
    }
    
    if (state.isWiFi && state.connectionQuality === 'good') {
      return 50; // Medium batches on decent WiFi
    }
    
    if (state.isCellular) {
      switch (state.connectionQuality) {
        case 'excellent':
        case 'good':
          return 25; // Smaller batches on cellular
        case 'fair':
          return 10; // Very small batches on poor cellular
        case 'poor':
          return 5; // Minimal batches
        default:
          return 1;
      }
    }

    return 10; // Conservative default
  }

  /**
   * Get network metrics
   */
  getMetrics(): NetworkMetrics {
    this.calculateMetrics();
    return { ...this.metrics };
  }

  /**
   * Test connection quality
   */
  async testConnectionQuality(): Promise<{
    latency: number;
    bandwidth: number;
    quality: ConnectionQuality;
  }> {
    if (!this.currentState.isConnected) {
      return { latency: -1, bandwidth: 0, quality: 'none' };
    }

    try {
      const startTime = Date.now();
      
      // Simple latency test with small request
      const latencyTest = fetch('https://httpbin.org/get', {
        method: 'GET',
        timeout: this.config.qualityTestTimeout
      });

      await latencyTest;
      const latency = Date.now() - startTime;

      // Estimate bandwidth based on connection type and latency
      let estimatedBandwidth = 0;
      if (this.currentState.isWiFi) {
        estimatedBandwidth = latency < 100 ? 10 : latency < 300 ? 5 : 1;
      } else if (this.currentState.isCellular) {
        estimatedBandwidth = latency < 200 ? 2 : latency < 500 ? 1 : 0.5;
      }

      const quality = this.calculateQuality(latency, estimatedBandwidth);

      return { latency, bandwidth: estimatedBandwidth, quality };
    } catch (error) {
      console.warn('Connection quality test failed:', error);
      return { latency: -1, bandwidth: 0, quality: 'poor' };
    }
  }

  /**
   * Get connection stability score
   */
  getConnectionStability(): number {
    if (this.connectionHistory.length < 2) return 1;

    let stableConnections = 0;
    for (let i = 1; i < this.connectionHistory.length; i++) {
      if (this.connectionHistory[i].isConnected === this.connectionHistory[i - 1].isConnected) {
        stableConnections++;
      }
    }

    return stableConnections / (this.connectionHistory.length - 1);
  }

  /**
   * Private methods
   */
  private updateNetworkState(netInfoState: NetInfoState): void {
    const previousState = { ...this.currentState };
    
    const connectionType = this.mapConnectionType(netInfoState.type);
    const isConnected = netInfoState.isConnected === true;
    const isInternetReachable = netInfoState.isInternetReachable;

    this.currentState = {
      isConnected,
      connectionType,
      isWiFi: netInfoState.type === NetInfoStateType.wifi,
      isCellular: netInfoState.type === NetInfoStateType.cellular,
      isInternetReachable,
      connectionQuality: this.estimateConnectionQuality(netInfoState),
      estimatedBandwidth: this.estimateBandwidth(netInfoState),
      connectionStrength: this.getConnectionStrength(netInfoState),
      lastConnectedAt: isConnected ? new Date().toISOString() : previousState.lastConnectedAt,
      disconnectedDuration: isConnected ? 0 : this.calculateDisconnectedDuration(previousState)
    };

    // Track connection changes
    if (previousState.isConnected !== isConnected) {
      if (!isConnected) {
        this.lastOfflineTime = Date.now();
      } else {
        this.lastOfflineTime = undefined;
      }
    }

    // Add to history (keep last 100 entries)
    this.connectionHistory.push({ ...this.currentState });
    if (this.connectionHistory.length > 100) {
      this.connectionHistory.shift();
    }

    // Notify listeners
    this.notifyListeners();
  }

  private mapConnectionType(netInfoType: NetInfoStateType): ConnectionType {
    switch (netInfoType) {
      case NetInfoStateType.wifi: return 'wifi';
      case NetInfoStateType.cellular: return 'cellular';
      case NetInfoStateType.ethernet: return 'ethernet';
      case NetInfoStateType.bluetooth: return 'bluetooth';
      case NetInfoStateType.wimax: return 'wimax';
      case NetInfoStateType.vpn: return 'vpn';
      case NetInfoStateType.other: return 'other';
      default: return 'none';
    }
  }

  private estimateConnectionQuality(netInfoState: NetInfoState): ConnectionQuality {
    if (!netInfoState.isConnected) return 'none';

    // Use connection details if available
    const details = netInfoState.details as NetInfoConnectedDetails;
    
    if (netInfoState.type === NetInfoStateType.wifi && details) {
      const strength = (details as any).strength || (details as any).frequency;
      if (strength) {
        if (strength >= 80) return 'excellent';
        if (strength >= 60) return 'good';
        if (strength >= 40) return 'fair';
        return 'poor';
      }
    }

    if (netInfoState.type === NetInfoStateType.cellular && details) {
      const cellularGeneration = (details as any).cellularGeneration;
      switch (cellularGeneration) {
        case '5g': return 'excellent';
        case '4g': return 'good';
        case '3g': return 'fair';
        default: return 'poor';
      }
    }

    // Default estimation based on connection type
    switch (netInfoState.type) {
      case NetInfoStateType.wifi: return 'good';
      case NetInfoStateType.ethernet: return 'excellent';
      case NetInfoStateType.cellular: return 'fair';
      default: return 'poor';
    }
  }

  private estimateBandwidth(netInfoState: NetInfoState): number {
    if (!netInfoState.isConnected) return 0;

    const details = netInfoState.details as NetInfoConnectedDetails;
    
    // Use actual bandwidth if available
    if (details && (details as any).downlinkMax) {
      return (details as any).downlinkMax;
    }

    // Estimate based on connection type and quality
    switch (netInfoState.type) {
      case NetInfoStateType.wifi:
        return 10; // Assume decent WiFi
      case NetInfoStateType.ethernet:
        return 100; // Assume fast ethernet
      case NetInfoStateType.cellular:
        const cellularDetails = details as any;
        if (cellularDetails?.cellularGeneration === '5g') return 20;
        if (cellularDetails?.cellularGeneration === '4g') return 5;
        if (cellularDetails?.cellularGeneration === '3g') return 1;
        return 0.5;
      default:
        return 1;
    }
  }

  private getConnectionStrength(netInfoState: NetInfoState): number | undefined {
    if (!netInfoState.isConnected) return undefined;

    const details = netInfoState.details as NetInfoConnectedDetails;
    if (details && (details as any).strength !== undefined) {
      return (details as any).strength;
    }

    return undefined;
  }

  private calculateDisconnectedDuration(previousState: NetworkState): number {
    if (previousState.disconnectedDuration && this.lastOfflineTime) {
      return Date.now() - this.lastOfflineTime;
    }
    return previousState.disconnectedDuration || 0;
  }

  private calculateQuality(latency: number, bandwidth: number): ConnectionQuality {
    if (latency < 0) return 'none';

    // Score based on latency and bandwidth
    let score = 0;
    
    // Latency scoring (0-50 points)
    if (latency < 100) score += 50;
    else if (latency < 300) score += 30;
    else if (latency < 1000) score += 15;
    else score += 5;

    // Bandwidth scoring (0-50 points)
    if (bandwidth > 5) score += 50;
    else if (bandwidth > 2) score += 30;
    else if (bandwidth > 0.5) score += 15;
    else score += 5;

    // Convert to quality levels
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  private startQualityMonitoring(): void {
    this.qualityCheckTimer = setInterval(async () => {
      if (this.appState === 'active' && this.currentState.isConnected) {
        try {
          const qualityTest = await this.testConnectionQuality();
          
          // Update current state with test results
          this.currentState.estimatedBandwidth = qualityTest.bandwidth;
          this.currentState.connectionQuality = qualityTest.quality;
          
          this.notifyListeners();
        } catch (error) {
          console.warn('Quality monitoring test failed:', error);
        }
      }
    }, this.config.qualityCheckInterval);
  }

  private handleAppStateChange(nextAppState: AppStateStatus): void {
    this.appState = nextAppState;
    
    if (nextAppState === 'active') {
      // Re-check network state when app becomes active
      NetInfo.fetch().then(state => this.updateNetworkState(state));
    }
  }

  private calculateMetrics(): void {
    if (this.connectionHistory.length === 0) return;

    const connectedStates = this.connectionHistory.filter(state => state.isConnected);
    const wifiStates = connectedStates.filter(state => state.isWiFi);

    this.metrics = {
      connectionUptime: connectedStates.length / this.connectionHistory.length,
      averageBandwidth: connectedStates.length > 0 ? 
        connectedStates.reduce((sum, state) => sum + (state.estimatedBandwidth || 0), 0) / connectedStates.length : 0,
      connectionStability: this.getConnectionStability(),
      wifiUsageRatio: connectedStates.length > 0 ? wifiStates.length / connectedStates.length : 0,
      totalDataTransferred: 0, // Would need to be tracked separately
      syncSuccessRate: 0, // Would need to be provided by sync service
      averageLatency: 0 // Would need to be calculated from quality tests
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentState);
      } catch (error) {
        console.error('Network listener error:', error);
      }
    }
  }
}

export const NetworkDetector = NetworkDetectorService.getInstance();