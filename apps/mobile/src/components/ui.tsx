// src/components/ui.tsx
// Shared building blocks so EVERY page has the same dark/gold feel.
// Build each page from: <Screen> + <Card> + <SectionTitle> + <ListRow> + <EmptyState> + <GoldButton>.
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StatusBar, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme as t } from '../theme/theme';

/* ---------- Screen: safe-area headroom + dark bg + optional header ---------- */
type ScreenProps = {
  title?: string;
  subtitle?: string;
  back?: boolean; // show a back chevron; enabled by default
  right?: React.ReactNode;
  scroll?: boolean;
  children: React.ReactNode;
};

export function Screen({ title, subtitle, back = true, right, scroll = true, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />

      {!!title && (
        <View style={s.header}>
          {back ? (
            <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(resident)' as never); }} hitSlop={12} style={{ marginRight: 8 }}>
              <Ionicons name="chevron-back" size={26} color={t.text} />
            </TouchableOpacity>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{title}</Text>
            {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
          </View>
          {right}
        </View>
      )}

      {scroll ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>{children}</View>
      )}
    </View>
  );
}

/* ---------- Card ---------- */
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

/* ---------- Section title ---------- */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={s.section}>{children}</Text>;
}

/* ---------- List row (icon, title, subtitle, chevron) ---------- */
type RowProps = {
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
};

export function ListRow({ icon, title, subtitle, right, onPress }: RowProps) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} disabled={!onPress} activeOpacity={0.75}>
      {!!icon && <MaterialCommunityIcons name={icon} size={22} color={t.goldSoft} style={{ marginRight: 14 }} />}
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {!!subtitle && <Text style={s.rowSub}>{subtitle}</Text>}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={t.muted} /> : null)}
    </TouchableOpacity>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({
  icon = 'inbox-outline',
  title,
  message,
}: {
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  message?: string;
}) {
  return (
    <View style={s.empty}>
      <MaterialCommunityIcons name={icon} size={40} color={t.goldSoft} />
      <Text style={s.emptyTitle}>{title}</Text>
      {!!message && <Text style={s.emptyMsg}>{message}</Text>}
    </View>
  );
}

/* ---------- Buttons ---------- */
export function GoldButton({ label, onPress, disabled }: { label: string; onPress?: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[s.gold, disabled && { opacity: 0.5 }]} onPress={onPress} disabled={disabled}>
      <Text style={s.goldText}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: t.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: t.muted, fontSize: 12, marginTop: 2 },

  card: {
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  section: { color: t.goldSoft, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 8, marginBottom: 8, textTransform: 'uppercase' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  rowTitle: { color: t.text, fontSize: 14, fontWeight: '600' },
  rowSub: { color: t.muted, fontSize: 12, marginTop: 2 },

  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { color: t.text, fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptyMsg: { color: t.muted, fontSize: 12, marginTop: 4, textAlign: 'center', maxWidth: 260 },

  gold: { backgroundColor: t.gold, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  goldText: { color: '#000', fontWeight: '700', fontSize: 15 },
});
