"use strict";
/**
 * SportCards.tsx
 * ════════════════════════════════════════════════════════════════════════════════
 * Premium card components for sports UI
 * - LiveMatchCard: Real-time match with score & minute
 * - UpcomingMatchCard: Future match with kickoff time
 * - FinishedMatchCard: Completed match with final score
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiveMatchCard = LiveMatchCard;
exports.UpcomingMatchCard = UpcomingMatchCard;
exports.FinishedMatchCard = FinishedMatchCard;
var react_1 = require("react");
var react_native_1 = require("react-native");
var expo_linear_gradient_1 = require("expo-linear-gradient");
var TeamLogo_1 = require("@/components/TeamLogo");
var logo_manager_1 = require("@/lib/logo-manager");
var DS = {
    bg: "#09090D",
    card: "#12121A",
    elevated: "#1C1C28",
    accent: "#E50914",
    live: "#FF3040",
    text: "#FFFFFF",
    muted: "#9D9DAA",
    border: "rgba(255,255,255,0.08)",
};
function LiveMatchCard(_a) {
    var _b, _c;
    var match = _a.match, onPress = _a.onPress;
    var brand = (0, logo_manager_1.resolveCompetitionBrand)({
        name: (match === null || match === void 0 ? void 0 : match.league) || "League",
        espnLeague: (match === null || match === void 0 ? void 0 : match.espnLeague) || null,
    });
    var leagueLogo = brand.logo;
    var homeScore = (_b = match === null || match === void 0 ? void 0 : match.homeScore) !== null && _b !== void 0 ? _b : "–";
    var awayScore = (_c = match === null || match === void 0 ? void 0 : match.awayScore) !== null && _c !== void 0 ? _c : "–";
    var minute = (match === null || match === void 0 ? void 0 : match.minute) ? "".concat(match.minute, "'") : "LIVE";
    return (<react_native_1.TouchableOpacity onPress={onPress} activeOpacity={0.88} style={styles.liveWrap}>
      <expo_linear_gradient_1.LinearGradient colors={["#1A0A0E", "#0D0D1A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.liveCard}>
        {/* Red accent border - left side */}
        <react_native_1.View style={styles.liveAccentBorder}/>

        {/* Teams + Score layout */}
        <react_native_1.View style={styles.liveTeamsRow}>
          {/* HOME TEAM */}
          <react_native_1.View style={styles.liveTeamBlock}>
            <react_native_1.Text style={styles.liveTeamName} numberOfLines={1}>
              {(match === null || match === void 0 ? void 0 : match.homeTeam) || "Home"}
            </react_native_1.Text>
            <TeamLogo_1.TeamLogo uri={match === null || match === void 0 ? void 0 : match.homeTeamLogo} teamName={(match === null || match === void 0 ? void 0 : match.homeTeam) || ""} size={40}/>
          </react_native_1.View>

          {/* SCORE + COMPETITION */}
          <react_native_1.View style={styles.liveScoreBlock}>
            {leagueLogo && (<react_native_1.Image source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo }} style={styles.liveLeagueLogo} resizeMode="contain"/>)}
            <react_native_1.Text style={styles.liveLiveText}>{minute}</react_native_1.Text>
            <react_native_1.Text style={styles.liveScore}>
              {homeScore} - {awayScore}
            </react_native_1.Text>
          </react_native_1.View>

          {/* AWAY TEAM */}
          <react_native_1.View style={styles.liveTeamBlock}>
            <react_native_1.Text style={styles.liveTeamName} numberOfLines={1}>
              {(match === null || match === void 0 ? void 0 : match.awayTeam) || "Away"}
            </react_native_1.Text>
            <TeamLogo_1.TeamLogo uri={match === null || match === void 0 ? void 0 : match.awayTeamLogo} teamName={(match === null || match === void 0 ? void 0 : match.awayTeam) || ""} size={40}/>
          </react_native_1.View>
        </react_native_1.View>

        {/* Stadium info (optional) */}
        {(match === null || match === void 0 ? void 0 : match.stadium) && (<react_native_1.Text style={styles.liveStadium} numberOfLines={1}>
            📍 {match.stadium}
          </react_native_1.Text>)}
      </expo_linear_gradient_1.LinearGradient>
    </react_native_1.TouchableOpacity>);
}
function UpcomingMatchCard(_a) {
    var match = _a.match, onPress = _a.onPress;
    var brand = (0, logo_manager_1.resolveCompetitionBrand)({
        name: (match === null || match === void 0 ? void 0 : match.league) || "League",
        espnLeague: (match === null || match === void 0 ? void 0 : match.espnLeague) || null,
    });
    var leagueLogo = brand.logo;
    return (<react_native_1.TouchableOpacity onPress={onPress} activeOpacity={0.88} style={styles.upcomingWrap}>
      <react_native_1.View style={styles.upcomingCard}>
        {/* League header */}
        <react_native_1.View style={styles.upcomingHeader}>
          {leagueLogo && (<react_native_1.Image source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo }} style={styles.upcomingLeagueLogo} resizeMode="contain"/>)}
          <react_native_1.Text style={styles.upcomingLeagueText} numberOfLines={1}>
            {brand.name || (match === null || match === void 0 ? void 0 : match.league)}
          </react_native_1.Text>
        </react_native_1.View>

        {/* Teams */}
        <react_native_1.View style={styles.upcomingTeamsRow}>
          {/* Home team */}
          <react_native_1.View style={styles.upcomingTeamBlock}>
            <react_native_1.Text style={styles.upcomingTeamName} numberOfLines={1}>
              {match === null || match === void 0 ? void 0 : match.homeTeam}
            </react_native_1.Text>
            <TeamLogo_1.TeamLogo uri={match === null || match === void 0 ? void 0 : match.homeTeamLogo} teamName={(match === null || match === void 0 ? void 0 : match.homeTeam) || ""} size={34}/>
          </react_native_1.View>

          {/* Vs + Kickoff time */}
          <react_native_1.View style={styles.upcomingVsBlock}>
            <react_native_1.Text style={styles.upcomingVsText}>VS</react_native_1.Text>
            <react_native_1.Text style={styles.upcomingTimeText}>
              {(match === null || match === void 0 ? void 0 : match.startTime) || "TBD"}
            </react_native_1.Text>
          </react_native_1.View>

          {/* Away team */}
          <react_native_1.View style={styles.upcomingTeamBlock}>
            <react_native_1.Text style={styles.upcomingTeamName} numberOfLines={1}>
              {match === null || match === void 0 ? void 0 : match.awayTeam}
            </react_native_1.Text>
            <TeamLogo_1.TeamLogo uri={match === null || match === void 0 ? void 0 : match.awayTeamLogo} teamName={(match === null || match === void 0 ? void 0 : match.awayTeam) || ""} size={34}/>
          </react_native_1.View>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_1.TouchableOpacity>);
}
function FinishedMatchCard(_a) {
    var _b, _c;
    var match = _a.match, onPress = _a.onPress;
    var brand = (0, logo_manager_1.resolveCompetitionBrand)({
        name: (match === null || match === void 0 ? void 0 : match.league) || "League",
        espnLeague: (match === null || match === void 0 ? void 0 : match.espnLeague) || null,
    });
    var leagueLogo = brand.logo;
    var homeScore = (_b = match === null || match === void 0 ? void 0 : match.homeScore) !== null && _b !== void 0 ? _b : "–";
    var awayScore = (_c = match === null || match === void 0 ? void 0 : match.awayScore) !== null && _c !== void 0 ? _c : "–";
    return (<react_native_1.TouchableOpacity onPress={onPress} activeOpacity={0.88} style={styles.finishedWrap}>
      <react_native_1.View style={styles.finishedCard}>
        {/* League header */}
        <react_native_1.View style={styles.finishedHeader}>
          {leagueLogo && (<react_native_1.Image source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo }} style={styles.finishedLeagueLogo} resizeMode="contain"/>)}
          <react_native_1.Text style={styles.finishedLeagueText} numberOfLines={1}>
            {brand.name || (match === null || match === void 0 ? void 0 : match.league)}
          </react_native_1.Text>
        </react_native_1.View>

        {/* Teams + Score */}
        <react_native_1.View style={styles.finishedTeamsRow}>
          {/* Home team */}
          <react_native_1.View style={styles.finishedTeamBlock}>
            <react_native_1.Text style={styles.finishedTeamName} numberOfLines={1}>
              {match === null || match === void 0 ? void 0 : match.homeTeam}
            </react_native_1.Text>
            <TeamLogo_1.TeamLogo uri={match === null || match === void 0 ? void 0 : match.homeTeamLogo} teamName={(match === null || match === void 0 ? void 0 : match.homeTeam) || ""} size={34}/>
          </react_native_1.View>

          {/* Score */}
          <react_native_1.View style={styles.finishedScoreBlock}>
            <react_native_1.Text style={styles.finishedScore}>
              {homeScore} - {awayScore}
            </react_native_1.Text>
            <react_native_1.Text style={styles.finishedFTText}>FT</react_native_1.Text>
          </react_native_1.View>

          {/* Away team */}
          <react_native_1.View style={styles.finishedTeamBlock}>
            <react_native_1.Text style={styles.finishedTeamName} numberOfLines={1}>
              {match === null || match === void 0 ? void 0 : match.awayTeam}
            </react_native_1.Text>
            <TeamLogo_1.TeamLogo uri={match === null || match === void 0 ? void 0 : match.awayTeamLogo} teamName={(match === null || match === void 0 ? void 0 : match.awayTeam) || ""} size={34}/>
          </react_native_1.View>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_1.TouchableOpacity>);
}
// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
var styles = react_native_1.StyleSheet.create({
    // ─────────────────────────────────────────────────────────────────────────────
    // LIVE MATCH CARD
    // ─────────────────────────────────────────────────────────────────────────────
    liveWrap: {
        marginBottom: 8,
    },
    liveCard: {
        borderRadius: 16,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(229,9,20,0.34)",
        padding: 14,
        backgroundColor: "#0B0F1A",
        elevation: 7,
    },
    liveAccentBorder: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
        backgroundColor: DS.accent,
    },
    liveTeamsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: 4,
        gap: 8,
    },
    liveTeamBlock: {
        flex: 1,
        alignItems: "center",
        gap: 6,
    },
    liveTeamName: {
        fontSize: 12,
        fontWeight: "600",
        color: DS.text,
        textAlign: "center",
        fontFamily: "Inter_600SemiBold",
    },
    liveScoreBlock: {
        paddingHorizontal: 12,
        alignItems: "center",
        justifyContent: "center",
        minWidth: 100,
    },
    liveLeagueLogo: {
        width: 24,
        height: 24,
        marginBottom: 6,
    },
    liveLiveText: {
        fontSize: 10,
        fontWeight: "700",
        color: DS.live,
        letterSpacing: 1,
        marginBottom: 6,
        fontFamily: "Inter_700Bold",
    },
    liveScore: {
        fontSize: 26,
        fontWeight: "800",
        color: DS.text,
        letterSpacing: 0.8,
        fontFamily: "Inter_800ExtraBold",
    },
    liveStadium: {
        color: DS.muted,
        fontSize: 9,
        marginTop: 8,
        paddingLeft: 4,
        fontFamily: "Inter_500Medium",
    },
    // ─────────────────────────────────────────────────────────────────────────────
    // UPCOMING MATCH CARD
    // ─────────────────────────────────────────────────────────────────────────────
    upcomingWrap: {
        marginBottom: 8,
    },
    upcomingCard: {
        backgroundColor: DS.card,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: DS.border,
        padding: 12,
        gap: 12,
    },
    upcomingHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.06)",
    },
    upcomingLeagueLogo: {
        width: 16,
        height: 16,
        borderRadius: 4,
    },
    upcomingLeagueText: {
        fontSize: 11,
        fontWeight: "600",
        color: DS.muted,
        flex: 1,
        fontFamily: "Inter_600SemiBold",
    },
    upcomingTeamsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
    },
    upcomingTeamBlock: {
        flex: 1,
        alignItems: "center",
        gap: 6,
    },
    upcomingTeamName: {
        fontSize: 11,
        fontWeight: "600",
        color: DS.text,
        textAlign: "center",
        fontFamily: "Inter_600SemiBold",
    },
    upcomingVsBlock: {
        paddingHorizontal: 12,
        alignItems: "center",
        justifyContent: "center",
        minWidth: 70,
    },
    upcomingVsText: {
        fontSize: 10,
        fontWeight: "700",
        color: DS.muted,
        marginBottom: 4,
        fontFamily: "Inter_700Bold",
    },
    upcomingTimeText: {
        fontSize: 12,
        fontWeight: "700",
        color: DS.text,
        fontFamily: "Inter_700Bold",
    },
    // ─────────────────────────────────────────────────────────────────────────────
    // FINISHED MATCH CARD
    // ─────────────────────────────────────────────────────────────────────────────
    finishedWrap: {
        marginBottom: 8,
    },
    finishedCard: {
        backgroundColor: DS.elevated,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        padding: 12,
        gap: 12,
    },
    finishedHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.04)",
    },
    finishedLeagueLogo: {
        width: 16,
        height: 16,
        borderRadius: 4,
    },
    finishedLeagueText: {
        fontSize: 11,
        fontWeight: "600",
        color: DS.muted,
        flex: 1,
        fontFamily: "Inter_600SemiBold",
    },
    finishedTeamsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
    },
    finishedTeamBlock: {
        flex: 1,
        alignItems: "center",
        gap: 6,
    },
    finishedTeamName: {
        fontSize: 11,
        fontWeight: "600",
        color: DS.text,
        textAlign: "center",
        fontFamily: "Inter_600SemiBold",
    },
    finishedScoreBlock: {
        paddingHorizontal: 12,
        alignItems: "center",
        justifyContent: "center",
        minWidth: 70,
    },
    finishedScore: {
        fontSize: 20,
        fontWeight: "700",
        color: DS.text,
        marginBottom: 4,
        fontFamily: "Inter_700Bold",
    },
    finishedFTText: {
        fontSize: 9,
        fontWeight: "700",
        color: DS.muted,
        letterSpacing: 0.5,
        fontFamily: "Inter_700Bold",
    },
});
