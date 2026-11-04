// ResidentHome.tsx
// Resident home screen matching the CB Nest dark/gold design.
// Requires: react-native-safe-area-context, @expo/vector-icons
// Make sure your root layout is wrapped in <SafeAreaProvider> (Expo Router does this for you).

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const GOLD = '#D9A93F';
const GOLD_SOFT = '#F0C766';
const BG = '#050505';
const CARD = '#121212';
const BORDER = '#3A2E12';
const MUTED = '#9A9A9A';

type Props = {
  name?: string;
  unitLabel?: string; // e.g. "Block A - Unit 12"
  hasUnreadNotifications?: boolean;
  welcomeImage?: string; // remote URL or require() asset
  onNavigate?: (route: string) => void;
};

type Tile = {
  key: string;
  label: string;
  route: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
};

const TILES: Tile[] = [
  { key: 'property', label: 'My Property', route: '/property', icon: 'home-outline' },
  { key: 'visitors', label: 'Visitor\nManagement', route: '/visitors', icon: 'account-group-outline' },
  { key: 'code', label: 'Generate\nAccess Code', route: '/access-code', icon: 'qrcode-scan' },
  { key: 'events', label: 'Events', route: '/events', icon: 'calendar-month-outline' },
  { key: 'charges', label: 'Service\nCharges', route: '/service-charges', icon: 'cash-multiple' },
  { key: 'pay', label: 'Make Payment', route: '/pay', icon: 'wallet-outline' },
  { key: 'history', label: 'Payment\nHistory', route: '/payment-history', icon: 'file-document-outline' },
  { key: 'maintenance', label: 'Maintenance\nRequests', route: '/maintenance', icon: 'tools' },
  { key: 'announcements', label: 'Estate\nAnnouncements', route: '/announcements', icon: 'bullhorn-outline' },
];

export default function ResidentHome({
  name = 'Resident',
  unitLabel,
  hasUnreadNotifications = false,
  welcomeImage,
  onNavigate = () => {},
}: Props) {
  // HEADROOM FIX: pad by the real top inset (status bar / notch / Dynamic Island)
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand row */}
        <View style={styles.brandRow}>
          <View style={styles.brandLeft}>
            <Ionicons name="business" size={26} color={GOLD} />
            <View style={{ marginLeft: 8 }}>
              <Text style={styles.brand}>CB NEST</Text>
              <Text style={styles.tagline}>Building Your Future, One Step at a Time.</Text>
            </View>
          </View>
        </View>

        {/* Greeting row */}
        <View style={styles.greetingRow}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={26} color={GOLD} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.hello}>Hello,</Text>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            {!!unitLabel && <Text style={styles.unit}>{unitLabel}</Text>}
          </View>
          <TouchableOpacity onPress={() => onNavigate('/notifications')} hitSlop={12}>
            <Ionicons name="notifications-outline" size={26} color="#fff" />
            {hasUnreadNotifications && <View style={styles.dot} />}
          </TouchableOpacity>
        </View>

        {/* Welcome card */}
        <ImageBackground
          source={typeof welcomeImage === 'string' ? { uri: welcomeImage } : (welcomeImage as any)}
          style={styles.welcome}
          imageStyle={{ borderRadius: 16 }}
        >
          <View style={styles.welcomeOverlay}>
            <Text style={styles.welcomeTitle}>Welcome to{'\n'}CB Nest</Text>
            <Text style={styles.welcomeSub}>
              A safer, smarter and more convenient community.
            </Text>
          </View>
        </ImageBackground>

        {/* Quick-action grid: 3 columns */}
        <View style={styles.grid}>
          {TILES.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={styles.tile}
              activeOpacity={0.8}
              onPress={() => onNavigate(t.route)}
            >
              <MaterialCommunityIcons name={t.icon} size={30} color={GOLD_SOFT} />
              <Text style={styles.tileLabel}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* My Account */}
        <TouchableOpacity
          style={styles.account}
          activeOpacity={0.8}
          onPress={() => onNavigate('/account')}
        >
          <Ionicons name="person-circle-outline" size={22} color={GOLD_SOFT} />
          <Text style={styles.accountText}>My Account</Text>
        </TouchableOpacity>
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  brandLeft: { flexDirection: 'row', alignItems: 'center' },
  brand: { color: GOLD, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  tagline: { color: MUTED, fontSize: 9, marginTop: 1 },

  greetingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: GOLD,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hello: { color: MUTED, fontSize: 12 },
  name: { color: '#fff', fontSize: 17, fontWeight: '700' },
  unit: { color: MUTED, fontSize: 12, marginTop: 1 },
  dot: {
    position: 'absolute',
    top: 0,
    right: 1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#E5392E',
  },

  welcome: {
    height: 150,
    borderRadius: 16,
    backgroundColor: '#1B1B1B',
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
    overflow: 'hidden',
  },
  welcomeOverlay: {
    flex: 1,
    padding: 16,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  welcomeTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  welcomeSub: { color: '#DDD', fontSize: 11, marginTop: 4, maxWidth: 220 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: {
    width: '31.5%',
    aspectRatio: 1,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  tileLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },

  account: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 14,
    marginTop: 2,
  },
  accountText: { color: '#fff', fontWeight: '600', marginLeft: 8 },
});
