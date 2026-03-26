/**
 * NEXORA Premium Design System Tokens
 * Dark-first, red accent, minimal futuristic aesthetic
 */

export const designTokens = {
  // Color Palette - Dark Theme Premium
  colors: {
    // Primary Brand
    primary: '#EF4444', // Vibrant red accent
    primaryLight: '#F87171',
    primaryDark: '#DC2626',

    // Neutrals - Dark Theme
    background: '#0F172A', // Deep dark blue
    backgroundAlt: '#1E293B', // Slightly lighter
    surface: '#1A1F35', // Card surface
    surfaceAlt: '#0F172A',
    border: '#334155', // Border color

    // Text
    textPrimary: '#F8FAFC', // White-ish
    textSecondary: '#CBD5E1', // Light gray
    textTertiary: '#94A3B8', // Muted gray
    textMuted: '#64748B', // Darker gray

    // States
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',

    // Semantic
    disabled: '#475569',
    placeholder: '#64748B',
  },

  // Spacing Scale - 4px base
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    '2xl': 32,
    '3xl': 48,
    '4xl': 64,
  },

  // Typography
  typography: {
    // Display/Hero
    display: {
      fontSize: 32,
      lineHeight: 40,
      fontWeight: '700' as const,
      letterSpacing: -0.5,
    },
    // Headings
    heading1: {
      fontSize: 28,
      lineHeight: 36,
      fontWeight: '700' as const,
      letterSpacing: -0.3,
    },
    heading2: {
      fontSize: 24,
      lineHeight: 32,
      fontWeight: '700' as const,
      letterSpacing: -0.2,
    },
    heading3: {
      fontSize: 20,
      lineHeight: 28,
      fontWeight: '600' as const,
      letterSpacing: -0.1,
    },
    // Body
    bodyLarge: {
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '400' as const,
      letterSpacing: 0,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '400' as const,
      letterSpacing: 0,
    },
    bodySmall: {
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '400' as const,
      letterSpacing: 0.5,
    },
    // Labels
    label: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
    },
    labelSmall: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '600' as const,
      letterSpacing: 0.8,
    },
  },

  // Border Radius - Premium rounded cards
  radius: {
    none: 0,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 20,
    full: 9999,
  },

  // Shadow System - Subtle depth
  shadow: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    // Accent glow - red
    glow: '0 0 20px 0 rgba(239, 68, 68, 0.2)',
    glowStrong: '0 0 30px 0 rgba(239, 68, 68, 0.3)',
  },

  // Animation/Transition
  transition: {
    fast: 150,
    base: 200,
    slow: 300,
    slower: 500,
  },

  // Z-Index Stack
  zIndex: {
    hide: -1,
    base: 0,
    dropdown: 100,
    sticky: 500,
    fixed: 1000,
    modal: 1500,
    notification: 2000,
    tooltip: 2500,
  },

  // Opacity
  opacity: {
    disabled: 0.5,
    hover: 0.8,
    active: 1,
  },
};

// Component-specific tokens
export const componentTokens = {
  // Button
  button: {
    paddingX: 16,
    paddingY: 12,
    borderRadius: 8,
    minHeight: 44, // Touch target
  },

  // Card
  card: {
    borderRadius: 12,
    padding: 16,
    shadow: designTokens.shadow.md,
  },

  // Input
  input: {
    borderRadius: 8,
    paddingX: 12,
    paddingY: 10,
    minHeight: 44,
  },

  // Chip
  chip: {
    borderRadius: 6,
    paddingX: 10,
    paddingY: 6,
  },

  // Tab
  tab: {
    paddingX: 12,
    paddingY: 10,
    borderRadius: 6,
  },
};
