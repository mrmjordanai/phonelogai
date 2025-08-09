import { Platform } from 'react-native';
import * as Device from 'expo-device';

export interface PlatformCapabilities {
  canAccessCallLog: boolean;
  canAccessSmsLog: boolean;
  supportsBackgroundSync: boolean;
  supportsFileImport: boolean;
  requiresManualImport: boolean;
}

export interface PlatformConfig {
  platform: 'ios' | 'android' | 'web';
  capabilities: PlatformCapabilities;
  minApiLevel?: number;
  targetApiLevel?: number;
}

class PlatformDetectorService {
  private static instance: PlatformDetectorService;
  private _config: PlatformConfig | null = null;

  private constructor() {}

  public static getInstance(): PlatformDetectorService {
    if (!PlatformDetectorService.instance) {
      PlatformDetectorService.instance = new PlatformDetectorService();
    }
    return PlatformDetectorService.instance;
  }

  public async initialize(): Promise<PlatformConfig> {
    if (this._config) {
      return this._config;
    }

    const platformOS = Platform.OS;
    const capabilities = this.determinePlatformCapabilities(platformOS);

    this._config = {
      platform: platformOS as 'ios' | 'android' | 'web',
      capabilities,
      ...(platformOS === 'android' && {
        minApiLevel: 23, // Android 6.0 - minimum for runtime permissions
        targetApiLevel: 33, // Android 13 - current target
      }),
    };

    return this._config;
  }

  private determinePlatformCapabilities(platformOS: string): PlatformCapabilities {
    switch (platformOS) {
      case 'android':
        return {
          canAccessCallLog: true,
          canAccessSmsLog: true,
          supportsBackgroundSync: true,
          supportsFileImport: true,
          requiresManualImport: false,
        };
      
      case 'ios':
        return {
          canAccessCallLog: false, // iOS doesn't allow call log access
          canAccessSmsLog: false,  // iOS doesn't allow SMS log access
          supportsBackgroundSync: true,
          supportsFileImport: true,
          requiresManualImport: true,
        };
      
      case 'web':
        return {
          canAccessCallLog: false,
          canAccessSmsLog: false,
          supportsBackgroundSync: false,
          supportsFileImport: true,
          requiresManualImport: true,
        };
      
      default:
        return {
          canAccessCallLog: false,
          canAccessSmsLog: false,
          supportsBackgroundSync: false,
          supportsFileImport: false,
          requiresManualImport: true,
        };
    }
  }

  public get config(): PlatformConfig {
    if (!this._config) {
      throw new Error('PlatformDetector not initialized. Call initialize() first.');
    }
    return this._config;
  }

  public get isAndroid(): boolean {
    return this.config.platform === 'android';
  }

  public get isIOS(): boolean {
    return this.config.platform === 'ios';
  }

  public get isWeb(): boolean {
    return this.config.platform === 'web';
  }

  public get canCollectDeviceData(): boolean {
    return this.config.capabilities.canAccessCallLog || this.config.capabilities.canAccessSmsLog;
  }

  public get requiresManualDataImport(): boolean {
    return this.config.capabilities.requiresManualImport;
  }

  public async getDeviceInfo(): Promise<{
    brand?: string;
    manufacturer?: string;
    modelName?: string;
    osVersion?: string;
    platform: string;
  }> {
    return {
      brand: Device.brand || undefined,
      manufacturer: Device.manufacturer || undefined,
      modelName: Device.modelName || undefined,
      osVersion: Device.osVersion || undefined,
      platform: Platform.OS,
    };
  }

  public getDataCollectionMessage(): string {
    if (this.isAndroid) {
      return 'PhoneLog AI can automatically collect call and SMS logs from your device to provide insights. All data is encrypted and stored securely.';
    } else if (this.isIOS) {
      return 'iOS privacy settings prevent automatic data collection. You can manually import carrier files (CDR, CSV, PDF) to analyze your communication patterns.';
    } else {
      return 'Manual file import is required for data analysis. Please upload your carrier data files.';
    }
  }

  public getPermissionRationale(permission: 'call_log' | 'sms' | 'contacts'): string {
    const baseMessage = 'PhoneLog AI needs access to your';
    
    switch (permission) {
      case 'call_log':
        return `${baseMessage} call log to analyze communication patterns, identify frequent contacts, and provide insights about your calling habits. This data never leaves your device without your explicit consent.`;
      
      case 'sms':
        return `${baseMessage} SMS messages to track text communication frequency and patterns. Only metadata (timestamps, numbers, counts) is processed - message content remains private unless you choose to analyze it.`;
      
      case 'contacts':
        return `${baseMessage} contacts to match phone numbers with names for better insights and reporting. This helps identify who you communicate with most frequently.`;
      
      default:
        return `${baseMessage} data to provide communication insights while maintaining your privacy.`;
    }
  }
}

export const PlatformDetector = PlatformDetectorService.getInstance();