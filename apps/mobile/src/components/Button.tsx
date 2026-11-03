import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, type PressableProps } from "react-native";
import { theme } from "../theme/theme";

type Props = PropsWithChildren<Pick<PressableProps, "onPress" | "disabled" | "accessibilityLabel">> & { title?: string };
export function Button({ children, title, disabled, ...props }: Props) {
  return <Pressable accessibilityRole="button" disabled={disabled} style={[styles.button, disabled && styles.disabled]} {...props}>
    {children ?? <Text style={styles.label}>{title}</Text>}
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 18, borderRadius: 12, backgroundColor: theme.gold, alignItems: "center", justifyContent: "center" },
  label: { color: theme.bg, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.5 },
});
