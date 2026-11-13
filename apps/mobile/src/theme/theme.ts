// CB Nest dark / gold brand tokens shared by every mobile role and screen.
export const theme = {
  gold: '#D9A93F',
  goldSoft: '#F0C766',
  ochre: '#C29804',
  olive: '#725801',
  darkBrown: '#302100',

  bg: '#050505',
  card: '#121212',
  border: '#3A2E12',
  muted: '#9A9A9A',
  text: '#F0C766',

  green: '#2FB36D',
  red: '#8E1B14',
  redText: '#8E1B14',
} as const;

export type Theme = typeof theme;
