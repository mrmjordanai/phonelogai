import { Platform } from 'react-native';
import * as Device from 'expo-device';

export interface DataCollectionMethod {
  id: string;
  name: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  timeRequired: string;
  dataTypes: ('calls' | 'sms' | 'contacts')[];
  platforms: ('android' | 'ios')[];
  steps: string[];
  requirements: string[];
  limitations: string[];
}

export interface PlatformCapabilities {
  platform: 'android' | 'ios';
  deviceInfo: string;
  nativeDataAccess: {
    calls: boolean;
    sms: boolean;
    contacts: boolean;
  };
  fileImportSupport: boolean;
  recommendedMethods: string[];
}

export interface DataExportGuide {
  title: string;
  description: string;
  targetAudience: string;
  steps: {
    title: string;
    description: string;
    screenshots?: string[];
    tips?: string[];
  }[];
  troubleshooting: {
    problem: string;
    solution: string;
  }[];
  expectedOutput: {
    format: string;
    sampleContent: string;
    fieldMapping: Record<string, string>;
  };
}

class DataCollectionGuidanceServiceClass {
  private static instance: DataCollectionGuidanceServiceClass;

  private constructor() {}

  public static getInstance(): DataCollectionGuidanceServiceClass {
    if (!DataCollectionGuidanceServiceClass.instance) {
      DataCollectionGuidanceServiceClass.instance = new DataCollectionGuidanceServiceClass();
    }
    return DataCollectionGuidanceServiceClass.instance;
  }

  /**
   * Get platform-specific capabilities and recommendations
   */
  public async getPlatformCapabilities(): Promise<PlatformCapabilities> {
    const isAndroid = Platform.OS === 'android';
    
    // Check native access capabilities (always false in Expo managed workflow)
    const nativeDataAccess = {
      calls: false, // Native modules not available
      sms: false,   // Native modules not available  
      contacts: true, // Available through expo-contacts
    };

    return {
      platform: isAndroid ? 'android' : 'ios',
      deviceInfo: `${Device.brand} ${Device.modelName} (${Device.osName} ${Device.osVersion})`,
      nativeDataAccess,
      fileImportSupport: true, // Always available
      recommendedMethods: this.getRecommendedMethods(isAndroid),
    };
  }

  /**
   * Get all available data collection methods
   */
  public getDataCollectionMethods(): DataCollectionMethod[] {
    return [
      {
        id: 'file_import_carrier',
        name: 'Carrier File Import',
        description: 'Download and import call/SMS data files from your mobile carrier',
        difficulty: 'easy',
        timeRequired: '5-10 minutes',
        dataTypes: ['calls', 'sms'],
        platforms: ['android', 'ios'],
        steps: [
          'Log into your carrier account online',
          'Navigate to "My Account" or "Billing"',
          'Look for "Usage Details" or "Call/Text History"',
          'Download detailed records (CDR files)',
          'Import downloaded files in PhoneLog AI',
        ],
        requirements: [
          'Active carrier account login',
          'Internet connection',
          'Recent billing cycle data',
        ],
        limitations: [
          'Limited to recent months (usually 3-12 months)',
          'May not include deleted messages',
          'Depends on carrier data retention policy',
        ],
      },
      {
        id: 'file_import_android_backup',
        name: 'Android Data Export',
        description: 'Export call logs and SMS from Android device using built-in features',
        difficulty: 'medium',
        timeRequired: '10-15 minutes',
        dataTypes: ['calls', 'sms'],
        platforms: ['android'],
        steps: [
          'Install "SMS Backup & Restore" from Google Play Store',
          'Open Phone app, go to Settings → Call History → Export',
          'For SMS: Open SMS Backup & Restore, tap "Backup"',
          'Choose export format (CSV or XML)',
          'Save files to local storage or cloud',
          'Import backup files in PhoneLog AI',
        ],
        requirements: [
          'Android device with admin access',
          'Storage space for backup files',
          'SMS Backup & Restore app (for messages)',
        ],
        limitations: [
          'May require multiple apps for different data types',
          'Limited by device storage capacity',
          'Some manufacturers may restrict access',
        ],
      },
      {
        id: 'file_import_ios_tools',
        name: 'iOS Data Extraction',
        description: 'Extract call and message data from iOS using third-party tools',
        difficulty: 'hard',
        timeRequired: '20-30 minutes',
        dataTypes: ['calls', 'sms'],
        platforms: ['ios'],
        steps: [
          'Install iMazing, 3uTools, or similar tool on computer',
          'Connect iPhone to computer with USB cable',
          'Create device backup (encrypted for full data)',
          'Use extraction tool to export call/SMS data',
          'Convert exported data to CSV format',
          'Transfer files to iPhone and import in PhoneLog AI',
        ],
        requirements: [
          'Computer with iOS extraction software',
          'USB cable for iPhone',
          'iOS device passcode/Touch ID/Face ID',
          'Sufficient computer storage space',
        ],
        limitations: [
          'Requires computer and additional software',
          'May need device unlock and trust authorization',
          'Limited by iOS backup encryption requirements',
          'Tool licensing may be required',
        ],
      },
      {
        id: 'manual_entry',
        name: 'Manual Data Entry',
        description: 'Manually enter important call and message information',
        difficulty: 'easy',
        timeRequired: 'Variable',
        dataTypes: ['calls', 'sms', 'contacts'],
        platforms: ['android', 'ios'],
        steps: [
          'Open PhoneLog AI manual entry screen',
          'Select data type (call, SMS, or contact)',
          'Fill in required fields (number, date, time, etc.)',
          'Add optional details (contact name, content, etc.)',
          'Save entry to local storage',
          'Entries automatically sync when online',
        ],
        requirements: [
          'Time to enter data manually',
          'Knowledge of important calls/messages to track',
        ],
        limitations: [
          'Time-intensive for large amounts of data',
          'Prone to human input errors',
          'May miss data if not systematically entered',
        ],
      },
      {
        id: 'contacts_integration',
        name: 'Contacts Import',
        description: 'Import device contacts for enhanced call/SMS insights',
        difficulty: 'easy',
        timeRequired: '2-3 minutes',
        dataTypes: ['contacts'],
        platforms: ['android', 'ios'],
        steps: [
          'Open PhoneLog AI',
          'Navigate to Data Collection screen',
          'Tap "Import Contacts"',
          'Grant contacts permission when prompted',
          'Wait for import to complete',
          'Review imported contacts',
        ],
        requirements: [
          'Contacts stored on device',
          'Permission to access contacts',
        ],
        limitations: [
          'Only provides contact information',
          'Does not include call/SMS history',
          'May include duplicate contacts',
        ],
      },
    ];
  }

  /**
   * Get detailed export guides for specific scenarios
   */
  public getExportGuides(): DataExportGuide[] {
    return [
      {
        title: 'Android Call Log Export',
        description: 'Export call history from Android devices using built-in features',
        targetAudience: 'Android users wanting to export call logs',
        steps: [
          {
            title: 'Open Phone App',
            description: 'Locate and open your default Phone/Dialer app',
            tips: [
              'Usually found on home screen or app drawer',
              'Look for green phone icon',
              'May be labeled "Phone", "Dialer", or carrier name',
            ],
          },
          {
            title: 'Access Call History',
            description: 'Navigate to your call history or recent calls',
            tips: [
              'Usually a "Recent" or "History" tab',
              'May be the default screen when opening Phone app',
              'Shows list of incoming/outgoing calls',
            ],
          },
          {
            title: 'Find Export Option',
            description: 'Look for settings, menu, or export options',
            tips: [
              'Try three-dot menu (⋮) in top-right corner',
              'Look for "Settings", "Export", or "Share" options',
              'May be under "Call settings" or "Advanced"',
            ],
          },
          {
            title: 'Export Call Log',
            description: 'Select export format and save location',
            tips: [
              'Choose CSV format if available',
              'Select date range if option exists',
              'Save to Downloads or Google Drive for easy access',
            ],
          },
        ],
        troubleshooting: [
          {
            problem: 'No export option found',
            solution: 'Try different Phone apps or check manufacturer-specific settings. Some devices may not have built-in export functionality.',
          },
          {
            problem: 'Export file is empty or corrupted',
            solution: 'Check selected date range and ensure you have call history data. Try exporting a smaller date range.',
          },
          {
            problem: 'Cannot find exported file',
            solution: 'Check Downloads folder, Documents, or the location specified during export. The file may have been saved to internal storage.',
          },
        ],
        expectedOutput: {
          format: 'CSV file with call log data',
          sampleContent: 'Number,Date,Duration,Type,Name\n+1234567890,2023-10-01 14:30:00,120,Outgoing,John Doe',
          fieldMapping: {
            'Number': 'Phone number called/calling',
            'Date': 'Call timestamp',
            'Duration': 'Call length in seconds',
            'Type': 'Incoming/Outgoing/Missed',
            'Name': 'Contact name if available',
          },
        },
      },
      {
        title: 'SMS Backup & Restore Guide',
        description: 'Backup SMS messages on Android using SMS Backup & Restore app',
        targetAudience: 'Android users wanting to backup SMS/MMS messages',
        steps: [
          {
            title: 'Install SMS Backup & Restore',
            description: 'Download the app from Google Play Store',
            tips: [
              'Look for "SMS Backup & Restore" by SyncTech',
              'Check app ratings and reviews',
              'Ensure app has necessary permissions listed',
            ],
          },
          {
            title: 'Grant Permissions',
            description: 'Allow app to access SMS messages and storage',
            tips: [
              'App will prompt for SMS permission',
              'Also grant storage/file access permission',
              'Required for reading and backing up messages',
            ],
          },
          {
            title: 'Create Backup',
            description: 'Start the backup process for your messages',
            tips: [
              'Tap "Set up a backup" or "Create backup"',
              'Choose backup location (local or Google Drive)',
              'Select backup format (XML recommended)',
            ],
          },
          {
            title: 'Configure Backup Options',
            description: 'Select what to backup and backup settings',
            tips: [
              'Include both SMS and MMS if needed',
              'Choose date range or backup all messages',
              'Enable compression to reduce file size',
            ],
          },
          {
            title: 'Complete Backup',
            description: 'Wait for backup to finish and locate backup file',
            tips: [
              'Backup may take several minutes for large message histories',
              'Note the backup file location',
              'Verify backup completed successfully',
            ],
          },
        ],
        troubleshooting: [
          {
            problem: 'Permission denied errors',
            solution: 'Ensure all required permissions are granted in Android Settings > Apps > SMS Backup & Restore > Permissions.',
          },
          {
            problem: 'Backup fails or stops',
            solution: 'Free up device storage space and disable battery optimization for the app in device settings.',
          },
          {
            problem: 'Cannot find backup file',
            solution: 'Check the app\'s backup location settings and look in Documents, Downloads, or the specified folder.',
          },
        ],
        expectedOutput: {
          format: 'XML file with SMS/MMS data',
          sampleContent: '<sms address="+1234567890" date="1696172400000" type="2" body="Hello world!" />',
          fieldMapping: {
            'address': 'Phone number',
            'date': 'Message timestamp (Unix format)',
            'type': '1=Received, 2=Sent',
            'body': 'Message content',
          },
        },
      },
      {
        title: 'Carrier Data Download',
        description: 'Download call detail records (CDR) from your mobile carrier',
        targetAudience: 'Users wanting official carrier call/SMS records',
        steps: [
          {
            title: 'Access Carrier Account',
            description: 'Log into your mobile carrier account online',
            tips: [
              'Visit your carrier\'s official website',
              'Use your phone number and account PIN/password',
              'May need to set up online account if first time',
            ],
          },
          {
            title: 'Navigate to Usage/Billing',
            description: 'Find your account usage or billing section',
            tips: [
              'Look for "My Account", "Usage", or "Billing"',
              'May be under "Account Management" or similar',
              'Different carriers have different layouts',
            ],
          },
          {
            title: 'Find Usage Details',
            description: 'Locate detailed call and text usage information',
            tips: [
              'Look for "Usage Details", "Call History", or "Activity"',
              'May need to select current or previous billing cycle',
              'Some carriers separate voice and text usage',
            ],
          },
          {
            title: 'Download Records',
            description: 'Export or download your usage data',
            tips: [
              'Look for "Download", "Export", or "Print" options',
              'Choose CSV or Excel format if available',
              'May need to request detailed records separately',
            ],
          },
        ],
        troubleshooting: [
          {
            problem: 'Cannot access online account',
            solution: 'Contact carrier customer service to set up online access or reset login credentials.',
          },
          {
            problem: 'No detailed usage available',
            solution: 'Some carriers may require you to request detailed records. Check account settings or contact support.',
          },
          {
            problem: 'Limited date range available',
            solution: 'Most carriers only provide recent months online. Older records may require customer service request.',
          },
        ],
        expectedOutput: {
          format: 'PDF or CSV file with call detail records',
          sampleContent: 'Date,Time,Number,Duration,Type,Charges\n10/01/2023,2:30 PM,555-123-4567,00:02:00,Mobile,0.00',
          fieldMapping: {
            'Date/Time': 'When call/text occurred',
            'Number': 'Phone number called/texting',
            'Duration': 'Call length',
            'Type': 'Call type or SMS indicator',
            'Charges': 'Associated costs',
          },
        },
      },
    ];
  }

  /**
   * Get troubleshooting guide for common issues
   */
  public getTroubleshootingGuide(): {
    category: string;
    issues: {
      problem: string;
      symptoms: string[];
      solutions: string[];
      prevention: string[];
    }[];
  }[] {
    return [
      {
        category: 'File Import Issues',
        issues: [
          {
            problem: 'File not recognized or invalid format',
            symptoms: [
              'Error message "Unsupported file format"',
              'File shows as corrupted or empty',
              'Import process fails immediately',
            ],
            solutions: [
              'Verify file is not corrupted by opening in another app',
              'Try converting file to CSV format',
              'Check file size - very large files may timeout',
              'Ensure file contains actual data, not just headers',
            ],
            prevention: [
              'Always verify exported files before importing',
              'Use recommended export formats (CSV, XML)',
              'Keep backup files under 100MB when possible',
            ],
          },
          {
            problem: 'File imports but no data appears',
            symptoms: [
              'Import shows as successful',
              'No events or contacts created',
              'Zero items processed message',
            ],
            solutions: [
              'Check if file headers match expected format',
              'Verify date formats are recognized',
              'Ensure phone numbers include country codes',
              'Try manual entry to test if data processing works',
            ],
            prevention: [
              'Review sample data before full import',
              'Use standard date formats (YYYY-MM-DD)',
              'Include country codes in phone numbers',
            ],
          },
        ],
      },
      {
        category: 'Permission and Access Issues',
        issues: [
          {
            problem: 'Cannot access device contacts',
            symptoms: [
              'Permission denied error',
              'Contacts import fails',
              'App crashes when accessing contacts',
            ],
            solutions: [
              'Go to device Settings > Apps > PhoneLog AI > Permissions',
              'Enable Contacts permission manually',
              'Restart app after granting permissions',
              'Check if contacts exist on device',
            ],
            prevention: [
              'Grant permissions when prompted',
              'Keep app permissions up to date',
              'Regular check app permissions in settings',
            ],
          },
        ],
      },
      {
        category: 'Data Quality Issues',
        issues: [
          {
            problem: 'Duplicate entries after import',
            symptoms: [
              'Same call/SMS appears multiple times',
              'Contacts duplicated with slight variations',
              'Inconsistent data from multiple sources',
            ],
            solutions: [
              'Use built-in duplicate detection and resolution',
              'Review import sources for overlaps',
              'Run data cleanup after multiple imports',
              'Check date ranges to avoid re-importing same periods',
            ],
            prevention: [
              'Track what data has been imported',
              'Use non-overlapping date ranges',
              'Import from one source at a time initially',
            ],
          },
        ],
      },
    ];
  }

  /**
   * Get recommended data collection strategy based on platform and user needs
   */
  public getRecommendedStrategy(userNeeds: {
    dataTypes: ('calls' | 'sms' | 'contacts')[];
    timeRange: 'recent' | 'historical' | 'all';
    technicalSkill: 'beginner' | 'intermediate' | 'advanced';
    timeAvailable: 'minimal' | 'moderate' | 'extensive';
  }): {
    primaryMethod: DataCollectionMethod;
    alternativeMethods: DataCollectionMethod[];
    estimatedTime: string;
    difficultyRating: string;
    stepByStepPlan: string[];
  } {
    const allMethods = this.getDataCollectionMethods();
    const isAndroid = Platform.OS === 'android';

    // Filter methods by platform and user needs
    const compatibleMethods = allMethods.filter(method => 
      method.platforms.includes(isAndroid ? 'android' : 'ios') &&
      method.dataTypes.some(type => userNeeds.dataTypes.includes(type))
    );

    // Sort by difficulty and user preferences
    const sortedMethods = compatibleMethods.sort((a, b) => {
      const difficultyScore = {
        'easy': 1,
        'medium': 2,
        'hard': 3,
      };

      // Prefer easier methods for beginners
      if (userNeeds.technicalSkill === 'beginner') {
        return difficultyScore[a.difficulty] - difficultyScore[b.difficulty];
      }

      // Consider time available
      if (userNeeds.timeAvailable === 'minimal') {
        return a.timeRequired.localeCompare(b.timeRequired);
      }

      return 0; // Keep original order for advanced users
    });

    const primaryMethod = sortedMethods[0];
    const alternativeMethods = sortedMethods.slice(1, 4); // Top 3 alternatives

    // Calculate estimated time
    const totalTime = userNeeds.dataTypes.length * 15; // Base estimation
    const estimatedTime = `${totalTime}-${totalTime + 30} minutes`;

    // Create step-by-step plan
    const stepByStepPlan = [
      'Review recommended data collection method below',
      'Gather required tools and access credentials',
      'Follow step-by-step export instructions',
      'Verify exported data files are complete',
      'Import files into PhoneLog AI',
      'Review imported data and resolve any duplicates',
    ];

    return {
      primaryMethod,
      alternativeMethods,
      estimatedTime,
      difficultyRating: primaryMethod.difficulty,
      stepByStepPlan,
    };
  }

  /**
   * Get platform-specific recommended methods
   */
  private getRecommendedMethods(isAndroid: boolean): string[] {
    if (isAndroid) {
      return [
        'file_import_carrier',      // Best data quality
        'file_import_android_backup', // Good device data  
        'contacts_integration',     // Easy contacts
        'manual_entry',            // Fallback
      ];
    } else {
      return [
        'file_import_carrier',      // Best option for iOS
        'contacts_integration',     // Easy contacts
        'file_import_ios_tools',    // Advanced users
        'manual_entry',            // Fallback
      ];
    }
  }
}

export const DataCollectionGuidanceService = DataCollectionGuidanceServiceClass.getInstance();