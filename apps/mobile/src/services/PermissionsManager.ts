import { Platform, Alert, Linking, PermissionsAndroid } from 'react-native';
import * as Permissions from 'expo-permissions';
import { PlatformDetector } from '../utils/PlatformDetector';

export type AndroidPermission = 
  | 'android.permission.READ_CALL_LOG'
  | 'android.permission.READ_SMS' 
  | 'android.permission.READ_CONTACTS'
  | 'android.permission.READ_PHONE_STATE';

export type PermissionStatus = 'granted' | 'denied' | 'never_ask_again' | 'undetermined';

export interface PermissionResult {
  status: PermissionStatus;
  canAskAgain: boolean;
  shouldShowRationale: boolean;
}

export interface PermissionsState {
  callLog: PermissionResult;
  sms: PermissionResult;
  contacts: PermissionResult;
  phoneState: PermissionResult;
}

class PermissionsManagerService {
  private static instance: PermissionsManagerService;
  private _permissionsState: PermissionsState | null = null;

  private constructor() {}

  public static getInstance(): PermissionsManagerService {
    if (!PermissionsManagerService.instance) {
      PermissionsManagerService.instance = new PermissionsManagerService();
    }
    return PermissionsManagerService.instance;
  }

  /**
   * Check current status of all required permissions
   */
  public async checkAllPermissions(): Promise<PermissionsState> {
    if (!PlatformDetector.isAndroid) {
      // iOS/Web - return denied status for all device permissions
      const deniedResult: PermissionResult = {
        status: 'denied',
        canAskAgain: false,
        shouldShowRationale: false,
      };

      this._permissionsState = {
        callLog: deniedResult,
        sms: deniedResult,
        contacts: deniedResult,
        phoneState: deniedResult,
      };

      return this._permissionsState;
    }

    // Android - check actual permissions
    const [callLogStatus, smsStatus, contactsStatus, phoneStateStatus] = await Promise.all([
      this.checkSinglePermission(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG),
      this.checkSinglePermission(PermissionsAndroid.PERMISSIONS.READ_SMS),
      this.checkSinglePermission(PermissionsAndroid.PERMISSIONS.READ_CONTACTS),
      this.checkSinglePermission(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE),
    ]);

    this._permissionsState = {
      callLog: callLogStatus,
      sms: smsStatus,
      contacts: contactsStatus,
      phoneState: phoneStateStatus,
    };

    return this._permissionsState;
  }

  /**
   * Check status of a single Android permission
   */
  private async checkSinglePermission(permission: AndroidPermission): Promise<PermissionResult> {
    if (!PlatformDetector.isAndroid) {
      return {
        status: 'denied',
        canAskAgain: false,
        shouldShowRationale: false,
      };
    }

    try {
      const hasPermission = await PermissionsAndroid.check(permission);
      
      if (hasPermission) {
        return {
          status: 'granted',
          canAskAgain: false,
          shouldShowRationale: false,
        };
      }

      const shouldShowRationale = await PermissionsAndroid.shouldShowRequestPermissionRationale(permission);
      
      return {
        status: shouldShowRationale ? 'denied' : 'undetermined',
        canAskAgain: true,
        shouldShowRationale,
      };
    } catch (error) {
      console.error('Error checking permission:', permission, error);
      return {
        status: 'denied',
        canAskAgain: false,
        shouldShowRationale: false,
      };
    }
  }

  /**
   * Request specific permission with rationale
   */
  public async requestPermission(
    permission: 'call_log' | 'sms' | 'contacts' | 'phone_state',
    showRationale: boolean = true
  ): Promise<PermissionResult> {
    if (!PlatformDetector.isAndroid) {
      return {
        status: 'denied',
        canAskAgain: false,
        shouldShowRationale: false,
      };
    }

    const androidPermission = this.getAndroidPermission(permission);
    const currentStatus = await this.checkSinglePermission(androidPermission);

    // Already granted
    if (currentStatus.status === 'granted') {
      return currentStatus;
    }

    // Show rationale if needed and requested
    if (showRationale && currentStatus.shouldShowRationale) {
      const shouldContinue = await this.showPermissionRationale(permission);
      if (!shouldContinue) {
        return currentStatus;
      }
    }

    try {
      const result = await PermissionsAndroid.request(androidPermission, {
        title: this.getPermissionTitle(permission),
        message: this.getPermissionMessage(permission),
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      });

      return this.mapAndroidPermissionResult(result);
    } catch (error) {
      console.error('Error requesting permission:', permission, error);
      return {
        status: 'denied',
        canAskAgain: false,
        shouldShowRationale: false,
      };
    }
  }

  /**
   * Request multiple permissions in sequence
   */
  public async requestPermissions(
    permissions: Array<'call_log' | 'sms' | 'contacts' | 'phone_state'>,
    showRationale: boolean = true
  ): Promise<PermissionsState> {
    if (!PlatformDetector.isAndroid) {
      return await this.checkAllPermissions();
    }

    const results: Partial<PermissionsState> = {};

    for (const permission of permissions) {
      results[permission] = await this.requestPermission(permission, showRationale);
      
      // If user denied with "never ask again", stop requesting more permissions
      if (results[permission]?.status === 'never_ask_again') {
        break;
      }
    }

    // Fill in any missing permissions with current status
    return await this.checkAllPermissions();
  }

  /**
   * Request all data collection permissions
   */
  public async requestDataCollectionPermissions(): Promise<PermissionsState> {
    return await this.requestPermissions(['call_log', 'sms', 'contacts', 'phone_state']);
  }

  /**
   * Show rationale dialog before requesting permission
   */
  private async showPermissionRationale(permission: 'call_log' | 'sms' | 'contacts' | 'phone_state'): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert(
        'Permission Required',
        PlatformDetector.getPermissionRationale(permission === 'phone_state' ? 'call_log' : permission),
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: 'Continue',
            onPress: () => resolve(true),
          },
        ]
      );
    });
  }

  /**
   * Show settings dialog when permission is permanently denied
   */
  public showPermissionDeniedDialog(permission: 'call_log' | 'sms' | 'contacts'): void {
    const permissionName = permission === 'call_log' ? 'Call Log' : 
                          permission === 'sms' ? 'SMS' : 'Contacts';

    Alert.alert(
      `${permissionName} Access Required`,
      `PhoneLog AI needs ${permissionName.toLowerCase()} access to provide insights. Please enable it in your device settings.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Open Settings',
          onPress: () => Linking.openSettings(),
        },
      ]
    );
  }

  /**
   * Get the required permissions for data collection
   */
  public get requiredPermissions(): Array<'call_log' | 'sms' | 'contacts' | 'phone_state'> {
    if (!PlatformDetector.isAndroid) {
      return [];
    }
    return ['call_log', 'sms', 'contacts', 'phone_state'];
  }

  /**
   * Check if we have sufficient permissions for data collection
   */
  public get canCollectData(): boolean {
    if (!this._permissionsState || !PlatformDetector.isAndroid) {
      return false;
    }

    return this._permissionsState.callLog.status === 'granted' ||
           this._permissionsState.sms.status === 'granted';
  }

  /**
   * Get summary of permission status
   */
  public getPermissionsSummary(): {
    granted: string[];
    denied: string[];
    needsAttention: string[];
  } {
    if (!this._permissionsState) {
      return { granted: [], denied: [], needsAttention: [] };
    }

    const granted: string[] = [];
    const denied: string[] = [];
    const needsAttention: string[] = [];

    Object.entries(this._permissionsState).forEach(([key, value]) => {
      const permissionName = key === 'callLog' ? 'Call Log' :
                            key === 'sms' ? 'SMS' :
                            key === 'contacts' ? 'Contacts' : 'Phone State';

      switch (value.status) {
        case 'granted':
          granted.push(permissionName);
          break;
        case 'never_ask_again':
          needsAttention.push(permissionName);
          break;
        case 'denied':
        case 'undetermined':
          denied.push(permissionName);
          break;
      }
    });

    return { granted, denied, needsAttention };
  }

  private getAndroidPermission(permission: 'call_log' | 'sms' | 'contacts' | 'phone_state'): AndroidPermission {
    switch (permission) {
      case 'call_log':
        return PermissionsAndroid.PERMISSIONS.READ_CALL_LOG;
      case 'sms':
        return PermissionsAndroid.PERMISSIONS.READ_SMS;
      case 'contacts':
        return PermissionsAndroid.PERMISSIONS.READ_CONTACTS;
      case 'phone_state':
        return PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE;
      default:
        throw new Error(`Unknown permission: ${permission}`);
    }
  }

  private getPermissionTitle(permission: 'call_log' | 'sms' | 'contacts' | 'phone_state'): string {
    switch (permission) {
      case 'call_log':
        return 'Call Log Access';
      case 'sms':
        return 'SMS Access';
      case 'contacts':
        return 'Contacts Access';
      case 'phone_state':
        return 'Phone State Access';
      default:
        return 'Permission Required';
    }
  }

  private getPermissionMessage(permission: 'call_log' | 'sms' | 'contacts' | 'phone_state'): string {
    switch (permission) {
      case 'call_log':
        return 'Allow PhoneLog AI to access your call history to analyze communication patterns and provide insights.';
      case 'sms':
        return 'Allow PhoneLog AI to access your SMS messages to track communication frequency and patterns.';
      case 'contacts':
        return 'Allow PhoneLog AI to access your contacts to match phone numbers with names for better insights.';
      case 'phone_state':
        return 'Allow PhoneLog AI to access phone state information for better call tracking and analysis.';
      default:
        return 'This permission is required for PhoneLog AI to function properly.';
    }
  }

  private mapAndroidPermissionResult(result: string): PermissionResult {
    switch (result) {
      case PermissionsAndroid.RESULTS.GRANTED:
        return {
          status: 'granted',
          canAskAgain: false,
          shouldShowRationale: false,
        };
      case PermissionsAndroid.RESULTS.DENIED:
        return {
          status: 'denied',
          canAskAgain: true,
          shouldShowRationale: false,
        };
      case PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN:
        return {
          status: 'never_ask_again',
          canAskAgain: false,
          shouldShowRationale: false,
        };
      default:
        return {
          status: 'denied',
          canAskAgain: false,
          shouldShowRationale: false,
        };
    }
  }
}

export const PermissionsManager = PermissionsManagerService.getInstance();