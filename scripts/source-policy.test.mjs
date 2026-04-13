import assert from "node:assert/strict";
import {
  getSourcePolicy,
  normalizePolicySource,
  selectFieldCandidate,
  selectPriorityCandidate,
  shouldReplaceField,
} from "../server/shared/source-resolver.js";

const policy = getSourcePolicy();

assert.ok(
  policy.priorityOrder["lineup-player-photo"],
  "lineup photo policy exists",
);
assert.equal(normalizePolicySource("transfermarkt-roster"), "transfermarkt");

const lineupPhoto = selectPriorityCandidate("lineup-player-photo", [
  {
    source: "espn",
    value: "https://a.espncdn.com/i/headshots/soccer/players/full/1.png",
  },
  {
    source: "sofascore",
    value: "https://api.sofascore.app/api/v1/player/1/image",
  },
]);
assert.equal(lineupPhoto.source, "sofascore");

const profilePhoto = selectFieldCandidate("player-profile", "photo", [
  {
    source: "sofascore",
    value: "https://api.sofascore.app/api/v1/player/1/image",
  },
  {
    source: "espn",
    value: "https://a.espncdn.com/i/headshots/soccer/players/full/1.png",
  },
]);
assert.equal(profilePhoto.source, "espn");

const marketValue = selectFieldCandidate("player-profile", "marketValue", [
  { source: "estimated", value: "€4.0M" },
  { source: "transfermarkt", value: "€9.0M" },
]);
assert.equal(marketValue.source, "transfermarkt");

assert.equal(
  shouldReplaceField("lineup-player", "photo", "espn", "sofascore"),
  true,
);
assert.equal(
  shouldReplaceField("player-profile", "photo", "espn", "sofascore"),
  false,
);

console.log("source-policy tests passed");
