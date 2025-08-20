import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ProfileSettingsScreen } from '../screens/settings/ProfileSettingsScreen';
import { PrivacySettingsScreen } from '../screens/settings/PrivacySettingsScreen';
import { NotificationSettingsScreen } from '../screens/settings/NotificationSettingsScreen';
import { DataStorageSettingsScreen } from '../screens/settings/DataStorageSettingsScreen';
import { HelpSupportScreen } from '../screens/settings/HelpSupportScreen';
import { AboutScreen } from '../screens/settings/AboutScreen';

export type SettingsStackParamList = {
  SettingsMain: undefined;
  ProfileSettings: undefined;
  PrivacySettings: undefined;
  NotificationSettings: undefined;
  DataStorageSettings: undefined;
  HelpSupport: undefined;
  About: undefined;
};

const Stack = createStackNavigator<SettingsStackParamList>();

export function SettingsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen 
        name="SettingsMain" 
        component={SettingsScreen} 
      />
      <Stack.Screen 
        name="ProfileSettings" 
        component={ProfileSettingsScreen}
      />
      <Stack.Screen 
        name="PrivacySettings" 
        component={PrivacySettingsScreen}
      />
      <Stack.Screen 
        name="NotificationSettings" 
        component={NotificationSettingsScreen}
      />
      <Stack.Screen 
        name="DataStorageSettings" 
        component={DataStorageSettingsScreen}
      />
      <Stack.Screen 
        name="HelpSupport" 
        component={HelpSupportScreen}
      />
      <Stack.Screen 
        name="About" 
        component={AboutScreen}
      />
    </Stack.Navigator>
  );
}