/**
 * Nexora – Zod Validation Schemas
 *
 * Central place for all upstream API response schemas.
 * Use validateSchema() to safely parse external data before use.
 * Invalid data is logged and returns null — never throws in production.
 *
 * Usage:
 *   import { validateSchema, EspnEventSchema } from './schemas.js';
 *   const match = validateSchema(EspnEventSchema, rawData, 'espn-event');
 */

import { z } from "zod";
import { createLogger } from "./logger.js";

const log = createLogger("schemas");

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Parse and validate data against a Zod schema.
 * Returns the parsed value on success, null on failure (with a warning log).
 *
 * @template T
 * @param {import('zod').ZodType<T>} schema
 * @param {unknown} data
 * @param {string} label - human-readable name for logging
 * @returns {T | null}
 */
export function validateSchema(schema, data, label = "unknown") {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".")}: ${i.message}`);
    log.warn("schema validation failed", { label, issues });
    return null;
  }
  return result.data;
}

// ─── ESPN Schemas ─────────────────────────────────────────────────────────────

export const EspnCompetitorSchema = z.object({
  id: z.string(),
  team: z.object({
    id: z.string(),
    displayName: z.string().optional(),
    name: z.string().optional(),
    abbreviation: z.string().optional(),
    logo: z.string().url().optional().nullable(),
  }),
  score: z.string().optional().nullable(),
  homeAway: z.enum(["home", "away"]).optional(),
  winner: z.boolean().optional(),
});

export const EspnStatusSchema = z.object({
  type: z.object({
    id: z.string(),
    name: z.string(),
    completed: z.boolean().optional(),
    description: z.string().optional(),
  }),
  displayClock: z.string().optional(),
  period: z.number().optional(),
});

export const EspnEventSchema = z.object({
  id: z.string(),
  uid: z.string().optional(),
  name: z.string().optional(),
  shortName: z.string().optional(),
  date: z.string(),
  competitions: z
    .array(
      z.object({
        id: z.string().optional(),
        status: EspnStatusSchema,
        competitors: z.array(EspnCompetitorSchema).min(1),
        venue: z
          .object({
            fullName: z.string().optional(),
            city: z.string().optional(),
            address: z
              .object({
                city: z.string().optional(),
                country: z.string().optional(),
              })
              .optional(),
          })
          .optional(),
        odds: z.array(z.record(z.unknown())).optional(),
      }),
    )
    .min(1),
});

export const EspnEventsResponseSchema = z.object({
  events: z.array(EspnEventSchema).optional().default([]),
});

// ─── Lineup / Player Schemas ──────────────────────────────────────────────────

export const LineupPlayerSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string(),
  jersey: z.union([z.string(), z.number()]).optional().nullable(),
  position: z.string().optional().nullable(),
  photo: z.string().optional().nullable(),
  isCaptain: z.boolean().optional(),
  isStarter: z.boolean().optional(),
  stats: z.record(z.unknown()).optional(),
});

export const LineupTeamSchema = z.object({
  teamId: z.string().optional().nullable(),
  teamName: z.string().optional().nullable(),
  formation: z.string().optional().nullable(),
  players: z.array(LineupPlayerSchema).optional().default([]),
  bench: z.array(LineupPlayerSchema).optional().default([]),
});

export const MatchLineupsSchema = z.object({
  matchId: z.string(),
  home: LineupTeamSchema,
  away: LineupTeamSchema,
  formation: z.string().optional().nullable(),
});

// ─── Transfermarkt Schemas ────────────────────────────────────────────────────

export const TransfermarktPlayerSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string(),
  age: z.number().optional().nullable(),
  nationality: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  marketValue: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
});

export const TransfermarktSearchSchema = z.object({
  players: z.array(TransfermarktPlayerSchema).optional().default([]),
});

// ─── Match Detail Schema ──────────────────────────────────────────────────────

export const MatchDetailSchema = z.object({
  id: z.string(),
  homeTeam: z
    .object({ id: z.string().optional(), name: z.string() })
    .optional()
    .nullable(),
  awayTeam: z
    .object({ id: z.string().optional(), name: z.string() })
    .optional()
    .nullable(),
  status: z.string().optional().nullable(),
  score: z
    .object({
      home: z.number().optional().nullable(),
      away: z.number().optional().nullable(),
    })
    .optional()
    .nullable(),
  venue: z.string().optional().nullable(),
  lineups: MatchLineupsSchema.optional().nullable(),
});

// ─── Weather Schema ───────────────────────────────────────────────────────────

export const WeatherSchema = z.object({
  temperature: z.number().optional().nullable(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
});

// ─── Football Stats (reep-compatible) Schema ─────────────────────────────────

export const PlayerMatchStatsSchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
  team: z.string().optional().nullable(),
  minutesPlayed: z.number().optional().nullable(),
  goals: z.number().optional().default(0),
  assists: z.number().optional().default(0),
  shots: z.number().optional().default(0),
  shotsOnTarget: z.number().optional().default(0),
  xG: z.number().optional().nullable(),
  xA: z.number().optional().nullable(),
  passes: z.number().optional().default(0),
  passAccuracy: z.number().min(0).max(100).optional().nullable(),
  tackles: z.number().optional().default(0),
  interceptions: z.number().optional().default(0),
  yellowCards: z.number().optional().default(0),
  redCards: z.number().optional().default(0),
});

export const MatchStatsSchema = z.object({
  matchId: z.string(),
  players: z.array(PlayerMatchStatsSchema).optional().default([]),
  possession: z
    .object({ home: z.number(), away: z.number() })
    .optional()
    .nullable(),
  shots: z.object({ home: z.number(), away: z.number() }).optional().nullable(),
  xG: z.object({ home: z.number(), away: z.number() }).optional().nullable(),
});
