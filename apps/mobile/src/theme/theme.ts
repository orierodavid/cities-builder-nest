// CB Nest brand tokens sampled from the supplied company letterhead artwork.
export const theme = {
  // Primary brand accents
  gold: '#FBCC0D',
  goldSoft: '#FED106',
  ochre: '#C29804',
  olive: '#725801',
  darkBrown: '#302100',

  // Neutral surfaces sampled from the supplied artwork
  bg: '#FFFFFF',
  card: '#FFFFFF',
  border: '#E8D9A8',
  muted: '#6B6250',
  text: '#000000',

  // Semantic status colours (not part of the brand palette)
  green: '#23834B',
  red: '#B42318',
  redText: '#B42318',
} as const;

export type Theme = typeof theme;
