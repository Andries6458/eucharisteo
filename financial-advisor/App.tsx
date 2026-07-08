import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  Radar,
  ReceiptText,
  UserRound,
  Wallet,
} from 'lucide-react-native';

import { AppProvider, useApp } from './src/context/AppContext';
import CurrencySelector from './src/components/CurrencySelector';
import WalletScreen from './src/screens/WalletScreen';
import AdvisoryScreen from './src/screens/AdvisoryScreen';
import TaxScreen from './src/screens/TaxScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { colors, spacing, typography } from './src/theme';

export type RootTabParamList = {
  Wallet: undefined;
  Advisory: undefined;
  Tax: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    border: colors.border,
    primary: colors.primary,
    text: colors.text,
  },
};

function GlobalBar() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.globalBar, { paddingTop: insets.top + spacing.sm }]}>
      <View>
        <Text style={styles.appTitle}>Financial Advisor</Text>
        <Text style={styles.appSubtitle}>Multi-currency wealth & tax</Text>
      </View>
      <CurrencySelector />
    </View>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>Loading your portfolio…</Text>
    </View>
  );
}

function Root() {
  const { ready } = useApp();

  if (!ready) {
    return <LoadingScreen />;
  }

  return (
    <View style={styles.appShell}>
      <GlobalBar />
      <NavigationContainer theme={navTheme}>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textFaint,
            tabBarStyle: {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              height: 62,
              paddingBottom: 8,
              paddingTop: 6,
            },
            tabBarLabelStyle: {
              fontSize: typography.tiny,
              fontWeight: '700',
            },
          }}
        >
          <Tab.Screen
            name="Wallet"
            component={WalletScreen}
            options={{
              title: 'Wallet',
              tabBarIcon: ({ color, size }) => (
                <Wallet color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="Advisory"
            component={AdvisoryScreen}
            options={{
              title: 'Advisory',
              tabBarIcon: ({ color, size }) => (
                <Radar color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="Tax"
            component={TaxScreen}
            options={{
              title: 'Tax Optimizer',
              tabBarIcon: ({ color, size }) => (
                <ReceiptText color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="Profile"
            component={ProfileScreen}
            options={{
              title: 'Profile',
              tabBarIcon: ({ color, size }) => (
                <UserRound color={color} size={size} />
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="light" />
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  globalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appTitle: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: '900',
  },
  appSubtitle: {
    color: colors.textFaint,
    fontSize: typography.small,
    marginTop: 2,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: typography.body,
  },
});
