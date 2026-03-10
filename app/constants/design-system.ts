/**
 * NEXORA PREMIUM SPORTS UI DESIGN SYSTEM
 *
 * Unified design tokens for typography, spacing, shadows, animations, and layout.
 * All components should reference these constants for visual consistency.
 */

import { COLORS } from './colors';

// ═══════════════════════════════════════════════════════════════════════════
// TYPOGRAPHY SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export const TYPOGRAPHY = {
  // HERO / PRIMARY TITLES
  heroScore: {
    fontSize: 42,
    fontWeight: '800' as const,
    lineHeight: 46,
    letterSpacing: -0.5,
    fontFamily: 'Inter_800ExtraBold',
  },

  // SECTION TITLES
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    lineHeight: 24,
    letterSpacing: -0.3,
    fontFamily: 'Inter_700Bold',
  },

  // CARD TITLES
  cardTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    lineHeight: 22,
    letterSpacing: -0.2,
    fontFamily: 'Inter_700Bold',
  },

  // MATCH METADATA (Team names, comp, time)
  matchMetadata: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 20,
    letterSpacing: -0.1,
    fontFamily: 'Inter_600SemiBold',
  },

  // BODY TEXT
  body: {
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 18,
    letterSpacing: 0,
    fontFamily: 'Inter_500Medium',
  },

  // SUPPORTING TEXT
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
    letterSpacing: 0.2,
    fontFamily: 'Inter_400Regular',
  },

  // BADGE TEXT
  badge: {
    fontSize: 13,
    fontWeight: '600' as const,
    lineHeight: 16,
    letterSpacing: 0.1,
    fontFamily: 'Inter_600SemiBold',
  },

  // SMALL TEXT
  small: {
    fontSize: 11,
    fontWeight: '500' as const,
    lineHeight: 14,
    letterSpacing: 0,
    fontFamily: 'Inter_500Medium',
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SPACING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export const SPACING = {
  // Base units (4px grid)
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,

  // Organized by purpose
  padding: {
    compact: 12,
    standard: 16,
    generous: 20,
    spacious: 24,
  },

  margin: {
    compact: 12,
    standard: 16,
    section: 24,
    large: 32,
  },

  gap: {
    tight: 4,
    small: 8,
    standard: 12,
    large: 16,
  },

  borderRadius: {
    small: 8,
    compact: 10,
    standard: 14,
    card: 16,
    large: 18,
    container: 24,
    pill: 28,
    circle: 9999,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SHADOWS & DEPTH
// ═══════════════════════════════════════════════════════════════════════════

export const SHADOWS = {
  // SUBTLE SHADOW
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },

  // MEDIUM SHADOW
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 8,
  },

  // STRONG SHADOW
  strong: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 36,
    elevation: 10,
  },

  // RED-TINTED SHADOW (for live/emphasis)
  redGlow: {
    shadowColor: COLORS.live,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 12,
  },

  // TEXT GLOW (red)
  textGlow: {
    textShadowColor: COLORS.accent,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },

  // TEXT GLOW LIVE
  textGlowLive: {
    textShadowColor: COLORS.live,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// COLORS & BORDERS
// ═══════════════════════════════════════════════════════════════════════════

export const DESIGN_COLORS = {
  // Borders
  border: {
    subtle: 'rgba(255, 255, 255, 0.08)',
    standard: 'rgba(255, 255, 255, 0.12)',
    light: 'rgba(255, 255, 255, 0.16)',
  },

  // Overlays & Glass Effect
  glass: 'rgba(17, 17, 25, 0.92)',
  glassLight: 'rgba(20, 20, 30, 0.72)',

  // Interactive states
  overlay: {
    light: 'rgba(255, 255, 255, 0.04)',
    standard: 'rgba(255, 255, 255, 0.06)',
    interaction: 'rgba(255, 255, 255, 0.1)',
  },

  // Accent highlights
  accentGlow: {
    subtle: 'rgba(229, 9, 20, 0.14)',
    standard: 'rgba(229, 9, 20, 0.22)',
    strong: 'rgba(229, 9, 20, 0.36)',
  },

  // Live indicator
  liveGlow: {
    subtle: 'rgba(255, 48, 64, 0.14)',
    standard: 'rgba(255, 48, 64, 0.24)',
    border: 'rgba(255, 48, 64, 0.55)',
  },

  // Gradients
  gradients: {
    darkOverlay: ['rgba(15, 15, 30, 0.4)', 'rgba(9, 9, 13, 0.8)'],
    accentOverlay: ['rgba(229, 9, 20, 0.1)', 'rgba(229, 9, 20, 0.2)'],
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATIONS & TIMING
// ═══════════════════════════════════════════════════════════════════════════

export const ANIMATIONS = {
  duration: {
    instant: 100,
    quick: 150,
    standard: 200,
    moderate: 300,
    slow: 500,
    verySlow: 700,
  },

  timing: {
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
    linear: 'linear',
  },

  // Predefined animation configs
  scale: {
    press: {
      from: 1.0,
      to: 0.96,
      duration: 200,
    },
    hover: {
      from: 1.0,
      to: 1.02,
      duration: 150,
    },
    active: {
      from: 0,
      to: 1,
      duration: 200,
    },
  },

  pulse: {
    duration: 700,
    minOpacity: 0.3,
    maxOpacity: 1.0,
  },

  slide: {
    enter: {
      duration: 200,
      displacement: 20,
    },
    exit: {
      duration: 150,
      displacement: -20,
    },
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// CARD DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export const CARD_STYLES = {
  // Standard card properties
  standard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.border.subtle,
    borderRadius: SPACING.borderRadius.card,
    ...SHADOWS.medium,
  },

  // Elevated card
  elevated: {
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.border.standard,
    borderRadius: SPACING.borderRadius.card,
    ...SHADOWS.strong,
  },

  // Live card emphasis
  live: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.liveGlow.border,
    borderRadius: SPACING.borderRadius.card,
    ...SHADOWS.redGlow,
  },

  // Compact card
  compact: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.border.subtle,
    borderRadius: SPACING.borderRadius.compact,
    ...SHADOWS.subtle,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SIZE PRESETS
// ═══════════════════════════════════════════════════════════════════════════

export const SIZES = {
  // Icons
  icon: {
    small: 16,
    standard: 24,
    large: 32,
  },

  // Logos
  logo: {
    small: 20,
    compact: 32,
    standard: 40,
    large: 48,
    hero: 64,
  },

  // Components
  button: {
    height: {
      small: 32,
      standard: 44,
      large: 52,
    },
  },

  badge: {
    height: 24,
    minWidth: 60,
  },

  // Match cards
  matchCard: {
    hero: {
      height: 240,
      borderRadius: 18,
    },
    row: {
      height: 104,
      borderRadius: 16,
    },
    compact: {
      height: 56,
      borderRadius: 14,
    },
  },

  // Navigation
  navBar: {
    height: 56,
    borderRadius: 28,
    width: 0.8, // 80% of screen
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const LAYOUT = {
  // Safe area considerations
  safeArea: {
    top: 12,
    bottom: 80, // Account for tab bar
    sides: 16,
  },

  // Tab bar
  tabBar: {
    height: 56,
    margin: {
      horizontal: 60, // Creates 80% width
      vertical: 12,
    },
  },

  // Match detail
  matchCenter: {
    height: 180,
    headerHeight: 32,
    stateHeight: 104,
    footerHeight: 36,
  },

  // Sections
  section: {
    spacing: 24, // Between sections
    topMargin: 24,
    bottomMargin: 16,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT SPECIFIC PRESETS
// ═══════════════════════════════════════════════════════════════════════════

export const PRESETS = {
  // Team logo with fallback
  teamLogo: {
    size: 32,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: '600' as const,
  },

  // Competition badge
  competitionBadge: {
    padding: {
      horizontal: 12,
      vertical: 6,
    },
    borderRadius: 12,
    fontSize: 13,
  },

  // Live badge
  liveBadge: {
    padding: {
      horizontal: 8,
      vertical: 4,
    },
    borderRadius: 6,
    fontSize: 11,
  },

  // Score center
  scoreDisplay: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
  },

  // Match minute/status
  matchStatus: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
} as const;

export default {
  TYPOGRAPHY,
  SPACING,
  SHADOWS,
  DESIGN_COLORS,
  ANIMATIONS,
  CARD_STYLES,
  SIZES,
  LAYOUT,
  PRESETS,
};
