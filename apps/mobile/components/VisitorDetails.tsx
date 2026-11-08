import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from './theme';
import { Badge, GoldButton, OutlineButton, SecurityScreen } from './ui';

type Visitor = {
  name: string;
  category: string; // "Personal Visitor"
  photoUrl?: string;
  valid: boolean;
  accessCode: string;
  host: string;
  property: string;
  date: string;
  time: string;
  accessType: string;
  vehicle?: string;
};

type Props = {
  visitor: Visitor;
  onBack: () => void;
  onApprove: () => void;
  onDeny: () => void;
};

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function VisitorDetails({ visitor: v, onBack, onApprove, onDeny }: Props) {
  return (
    <SecurityScreen title="Visitor Details" onBack={onBack}>
      <View style={styles.card}>
        <View style={styles.top}>
          {v.photoUrl ? (
            <Image source={{ uri: v.photoUrl }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoFallback]}>
              <Ionicons name="person" size={28} color={colors.textMuted} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{v.name}</Text>
            <Text style={styles.category}>{v.category}</Text>
          </View>
        </View>

        {v.valid ? <Badge label="Valid Access Code" /> : null}

        <View style={styles.rows}>
          <Row label="Access Code" value={v.accessCode} />
          <Row label="Host" value={v.host} />
          <Row label="Property" value={v.property} />
          <Row label="Date" value={v.date} />
          <Row label="Time" value={v.time} />
          <Row label="Access Type" value={v.accessType} />
          <Row label="Vehicle (Optional)" value={v.vehicle} />
        </View>
      </View>

      <GoldButton label="Approve Entry" onPress={onApprove} />
      <OutlineButton label="Deny Entry" tone="danger" onPress={onDeny} />
    </SecurityScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photo: { width: 56, height: 56, borderRadius: radius.sm },
  photoFallback: { backgroundColor: '#E8E8E8', alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  category: { color: '#666', fontSize: 12, marginTop: 2 },
  rows: { gap: 14, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { color: '#555', fontSize: 13, flexShrink: 0 },
  rowValue: { color: colors.ink, fontSize: 13, fontWeight: '700', textAlign: 'right', flex: 1 },
});
