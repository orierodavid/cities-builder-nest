import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from './theme';
import {
  GoldActionCard,
  GridTile,
  LightActionRow,
  SecurityScreen,
} from './ui';

type Props = {
  officerName: string; // e.g. "Officer James"
  avatarUrl?: string;
  estateName: string; // e.g. "Oniru Estate Lekki"
  greeting?: string; // e.g. "Good morning"
  onPickEstate?: () => void;
  onScan: () => void;
  onEnterCode: () => void;
  onEntryRecords: () => void;
  onExitRecords: () => void;
  onVehicle: () => void;
  onEventGuest: () => void;
  onIncident: () => void;
  onEmergency: () => void;
  onShiftHandover: () => void;
};

export default function SecurityHome(p: Props) {
  return (
    <SecurityScreen>
      {/* Security pill */}
      <View style={styles.pillWrap}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Security</Text>
        </View>
      </View>

      {/* Greeting */}
      <View style={styles.greetRow}>
        {p.avatarUrl ? (
          <Image source={{ uri: p.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={22} color={colors.gold} />
          </View>
        )}
        <View>
          <Text style={styles.greeting}>{p.greeting ?? 'Good morning'}</Text>
          <Text style={styles.name}>{p.officerName}</Text>
        </View>
      </View>

      {/* Estate selector */}
      <Pressable style={styles.estate} onPress={p.onPickEstate}>
        <Ionicons name="business-outline" size={20} color={colors.gold} />
        <Text style={styles.estateText} numberOfLines={1}>
          {p.estateName}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      {/* Primary actions */}
      <GoldActionCard icon="qr-code-outline" label="Scan Visitor Code" onPress={p.onScan} />
      <LightActionRow icon="keypad-outline" label="Enter Access Code" onPress={p.onEnterCode} />

      {/* 2 x 3 grid */}
      <View style={styles.row}>
        <GridTile icon="people-outline" label={'Event Guest\nVerification'} onPress={p.onEventGuest} />
        <GridTile icon="car-outline" label={'Vehicle\nRegistration'} onPress={p.onVehicle} />
      </View>
      <View style={styles.row}>
        <GridTile icon="log-in-outline" label={'Visitor Entry\nRecords'} onPress={p.onEntryRecords} />
        <GridTile icon="log-out-outline" label={'Visitor Exit\nRecords'} onPress={p.onExitRecords} />
      </View>
      <View style={styles.row}>
        <GridTile icon="alert-circle-outline" label={'Incident\nReporting'} onPress={p.onIncident} />
        <GridTile icon="notifications-outline" label={'Emergency\nAlerts'} onPress={p.onEmergency} danger />
      </View>

      {/* Shift handover */}
      <Pressable style={styles.handover} onPress={p.onShiftHandover}>
        <Ionicons name="swap-horizontal-outline" size={18} color={colors.text} />
        <Text style={styles.handoverText}>Shift Handover</Text>
      </Pressable>
    </SecurityScreen>
  );
}

const styles = StyleSheet.create({
  pillWrap: { alignItems: 'center', marginTop: -4 },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  pillText: { color: colors.gold, fontSize: 12, fontWeight: '700' },

  greetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: { color: colors.textMuted, fontSize: 12 },
  name: { color: colors.text, fontSize: 18, fontWeight: '800' },

  estate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  estateText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },

  row: { flexDirection: 'row', gap: spacing.md },

  handover: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.md,
    height: 46,
  },
  handoverText: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
