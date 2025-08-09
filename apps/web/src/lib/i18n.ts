import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Translation resources
const resources = {
  'en-US': {
    common: {
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      edit: 'Edit',
      view: 'View',
      search: 'Search',
      filter: 'Filter',
      export: 'Export',
      import: 'Import',
      upload: 'Upload',
      download: 'Download',
      next: 'Next',
      previous: 'Previous',
      close: 'Close',
      settings: 'Settings',
      profile: 'Profile',
      logout: 'Logout',
    },
    auth: {
      login: 'Login',
      signup: 'Sign Up',
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      forgotPassword: 'Forgot Password?',
      rememberMe: 'Remember Me',
      signInWithGoogle: 'Sign in with Google',
      alreadyHaveAccount: 'Already have an account?',
      dontHaveAccount: "Don't have an account?",
    },
    navigation: {
      dashboard: 'Dashboard',
      contacts: 'Contacts',
      events: 'Events',
      analytics: 'Analytics',
      settings: 'Settings',
      privacy: 'Privacy',
      billing: 'Billing',
      support: 'Support',
    },
    dashboard: {
      title: 'Dashboard',
      totalCalls: 'Total Calls',
      totalSms: 'Total SMS',
      uniqueContacts: 'Unique Contacts',
      averageCallDuration: 'Average Call Duration',
      recentActivity: 'Recent Activity',
      topContacts: 'Top Contacts',
      timeExplorer: 'Time Explorer',
      heatMap: 'Heat Map',
    },
  },
};

// Initialize i18n
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en-US',
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;