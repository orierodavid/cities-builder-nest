// Shared CB Nest dark/gold tokens.
export const theme = {
  gold: '#D9A93F',
  goldSoft: '#F0C766',
  bg: '#050505',
  card: '#121212',
  border: '#3A2E12',
  muted: '#9A9A9A',
  text: '#FFFFFF',
  green: '#2FB36D',
  red: '#8E1B14',
  redText: '#F2B5B0',
} as const;

export type Theme = typeof theme;
