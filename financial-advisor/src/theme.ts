export const colors = {
  bg: '#0B1220',
  surface: '#131C2E',
  surfaceRaised: '#1B2740',
  border: '#26334D',
  text: '#EAF0FA',
  textMuted: '#8FA0BC',
  textFaint: '#5C6C8A',
  primary: '#4F8CFF',
  primarySoft: 'rgba(79, 140, 255, 0.16)',
  positive: '#2FD483',
  positiveSoft: 'rgba(47, 212, 131, 0.14)',
  negative: '#FF5D73',
  negativeSoft: 'rgba(255, 93, 115, 0.14)',
  warning: '#FFB020',
  warningSoft: 'rgba(255, 176, 32, 0.14)',
  accent: '#9B7BFF',
  accentSoft: 'rgba(155, 123, 255, 0.16)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  title: 22,
  heading: 17,
  body: 14,
  small: 12,
  tiny: 10,
} as const;
