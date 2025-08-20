export default {
  expo: {
    name: "PhoneLog AI",
    slug: "phonelogai",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    splash: {
      backgroundColor: "#ffffff"
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.phonelogai.app",
      infoPlist: {
        NSDocumentPickerUsageDescription: "PhoneLog AI needs access to import carrier data files (CSV, PDF, Excel) for communication analysis.",
        NSPhotoLibraryUsageDescription: "PhoneLog AI may need to import carrier data files from your photo library."
      }
    },
    notification: {
      color: "#3B82F6",
      androidMode: "default",
      androidCollapsedTitle: "PhoneLog AI"
    },
    android: {
      package: "com.phonelogai.app",
      compileSdkVersion: 34,
      targetSdkVersion: 34,
      minSdkVersion: 23,
      permissions: [
        "READ_PHONE_STATE",
        "READ_CALL_LOG", 
        "READ_SMS",
        "READ_CONTACTS",
        "READ_EXTERNAL_STORAGE",
        "INTERNET",
        "ACCESS_NETWORK_STATE",
        "VIBRATE",
        "RECEIVE_BOOT_COMPLETED",
        "WAKE_LOCK"
      ],
      intentFilters: [
        {
          action: "VIEW",
          data: [
            {
              scheme: "content",
              mimeType: "text/csv"
            },
            {
              scheme: "content", 
              mimeType: "application/pdf"
            },
            {
              scheme: "content",
              mimeType: "application/vnd.ms-excel"
            },
            {
              scheme: "content",
              mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    web: {},
    plugins: [
      "expo-dev-client",
      "expo-contacts",
      "expo-document-picker",
      "expo-notifications"
    ],
    extra: {
      eas: {
        projectId: "phonelogai-mobile"
      }
    }
  }
};