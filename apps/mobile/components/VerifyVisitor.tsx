import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from './theme';
import { GoldButton, OutlineButton, SecurityScreen } from './ui';

type Props = {
  onBack: () => void;
  onCodeSubmit: (code: string) => void;
  onSwitchCamera: () => void;
  /** Pass your <CameraView /> (expo-camera) here; it fills the viewfinder. */
  camera?: React.ReactNode;
};

const FRAME = 240;
const CORNER = 36;

export default function SecurityVerify({ onBack, onCodeSubmit, onSwitchCamera, camera }: Props) {
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');

  return (
    <SecurityScreen title="Verify Visitor" onBack={onBack}>
      {/* Viewfinder */}
      <View style={styles.viewfinder}>
        {camera}
        <View style={styles.frame} pointerEvents="none">
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
      </View>
      <Text style={styles.hint}>Position the QR code within the frame</Text>

      {manual ? (
        <View style={styles.manualBox}>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            placeholder="______"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={6}
            style={styles.input}
          />
          <GoldButton
            label="Verify Access Code"
            disabled={code.length !== 6}
            onPress={() => onCodeSubmit(code)}
          />
        </View>
      ) : (
        <OutlineButton label="Enter Code Manually" onPress={() => setManual(true)} />
      )}

      <OutlineButton label="Switch Camera" icon="camera-outline" onPress={onSwitchCamera} />
    </SecurityScreen>
  );
}

const styles = StyleSheet.create({
  viewfinder: {
    height: 340,
    borderRadius: radius.lg,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: { width: FRAME, height: FRAME },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: colors.gold,
  },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  manualBox: { gap: spacing.md },
  input: {
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 10,
    textAlign: 'center',
  },
});
