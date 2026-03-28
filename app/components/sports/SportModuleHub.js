"use strict";
/**
 * SportModuleHub.tsx
 * ════════════════════════════════════════════════════════════════════════════════
 * Premium Sport UI - Netflix-level design system.
 *
 * Panes: explore | live | matchday | insights
 * No overlaps, no glitching, clean architecture.
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SportModuleHub = SportModuleHub;
var react_1 = require("react");
var react_native_1 = require("react-native");
var expo_router_1 = require("expo-router");
var react_native_safe_area_context_1 = require("react-native-safe-area-context");
var react_query_1 = require("@tanstack/react-query");
var vector_icons_1 = require("@expo/vector-icons");
var NexoraHeader_1 = require("@/components/NexoraHeader");
var onboarding_store_1 = require("@/store/onboarding-store");
var useTranslation_1 = require("@/lib/useTranslation");
var query_client_1 = require("@/lib/query-client");
var SportCards_1 = require("@/components/sports/SportCards");
// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════
var DS = {
    bg: "#09090D",
    card: "#12121A",
    elevated: "#1C1C28",
    accent: "#E50914",
    live: "#FF3040",
    text: "#FFFFFF",
    muted: "#9D9DAA",
    border: "rgba(255,255,255,0.08)",
    glass: "rgba(28,28,40,0.92)",
};
// ═══════════════════════════════════════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function fetchSportsPayload(path) {
    return __awaiter(this, void 0, void 0, function () {
        var json;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, query_client_1.apiRequestJson)(path)];
                case 1:
                    json = _a.sent();
                    return [2 /*return*/, __assign(__assign({}, json), { live: Array.isArray(json === null || json === void 0 ? void 0 : json.live) ? json.live : [], upcoming: Array.isArray(json === null || json === void 0 ? void 0 : json.upcoming) ? json.upcoming : [], finished: Array.isArray(json === null || json === void 0 ? void 0 : json.finished) ? json.finished : [] })];
            }
        });
    });
}
function fetchSportsMenuTools(path) {
    return __awaiter(this, void 0, void 0, function () {
        var json;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, query_client_1.apiRequestJson)(path)];
                case 1:
                    json = _a.sent();
                    return [2 /*return*/, __assign(__assign({}, json), { footballPredictions: Array.isArray(json === null || json === void 0 ? void 0 : json.footballPredictions) ? json.footballPredictions : [], dailyAccaPicks: Array.isArray(json === null || json === void 0 ? void 0 : json.dailyAccaPicks) ? json.dailyAccaPicks : [] })];
            }
        });
    });
}
function shouldRetrySportsQuery(failureCount, error) {
    if (failureCount >= 1)
        return false;
    var msg = String((error === null || error === void 0 ? void 0 : error.message) || "").toLowerCase();
    return msg.includes("network") || msg.includes("timeout") || msg.includes("failed to fetch");
}
/**
 * SportModuleHub - Main container for Sport tab
 * Manages pane routing: explore | live | matchday | insights
 */
function SportModuleHub(_a) {
    var _this = this;
    var _b, _c;
    var _d = _a.initialPane, initialPane = _d === void 0 ? "explore" : _d;
    var insets = (0, react_native_safe_area_context_1.useSafeAreaInsets)();
    var t = (0, useTranslation_1.useTranslation)().t;
    var queryClient = (0, react_query_1.useQueryClient)();
    var width = (0, react_native_1.useWindowDimensions)().width;
    // ─ State ─────────────────────────────────────────────────────────────────────
    var _e = (0, react_1.useState)(initialPane), activePane = _e[0], setActivePane = _e[1];
    var _f = (0, react_1.useState)(function () {
        var d = new Date();
        return d.toISOString().slice(0, 10);
    }), selectedDate = _f[0], setSelectedDate = _f[1];
    var _g = (0, react_1.useState)(false), refreshing = _g[0], setRefreshing = _g[1];
    var appStateRef = (0, react_1.useRef)(react_native_1.AppState.currentState);
    // ─ Data Queries ──────────────────────────────────────────────────────────────
    var sportsEnabled = (0, onboarding_store_1.useOnboardingStore)(function (s) { return s.sportsEnabled; });
    var liveQuery = (0, react_query_1.useQuery)({
        queryKey: ["sports", "live", selectedDate],
        queryFn: function () { return fetchSportsPayload("/api/sports/live?date=".concat(encodeURIComponent(selectedDate))); },
        staleTime: 20000,
        refetchInterval: 30000,
        retry: shouldRetrySportsQuery,
        enabled: sportsEnabled,
    });
    var todayQuery = (0, react_query_1.useQuery)({
        queryKey: ["sports", "today", selectedDate],
        queryFn: function () { return fetchSportsPayload("/api/sports/today?date=".concat(encodeURIComponent(selectedDate))); },
        staleTime: 20000,
        refetchInterval: 30000,
        retry: shouldRetrySportsQuery,
        enabled: sportsEnabled,
    });
    // ─ AppState listener: refetch on foreground ──────────────────────────────────
    (0, react_1.useEffect)(function () {
        var sub = react_native_1.AppState.addEventListener("change", function (nextState) {
            if (nextState === "active" && appStateRef.current !== "active") {
                void liveQuery.refetch();
                void todayQuery.refetch();
            }
            appStateRef.current = nextState;
        });
        return function () { return sub.remove(); };
    }, [liveQuery, todayQuery]);
    // ─ Pull to refresh ───────────────────────────────────────────────────────────
    var handleRefresh = (0, react_1.useCallback)(function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setRefreshing(true);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, , 3, 4]);
                    return [4 /*yield*/, Promise.all([
                            liveQuery.refetch(),
                            todayQuery.refetch(),
                        ])];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    setRefreshing(false);
                    return [7 /*endfinally*/];
                case 4: return [2 /*return*/];
            }
        });
    }); }, [liveQuery, todayQuery]);
    if (!sportsEnabled) {
        return (<react_native_1.View style={styles.container}>
        <NexoraHeader_1.NexoraHeader variant="module" title="NEXORA SPORT" titleColor={DS.accent} compact showSearch showNotification showFavorites showProfile onSearch={function () { return expo_router_1.router.push("/(tabs)/search"); }} onNotification={function () { return expo_router_1.router.push("/follow-center"); }} onFavorites={function () { return expo_router_1.router.push("/favorites"); }} onProfile={function () { return expo_router_1.router.push("/profile"); }}/>
        <react_native_1.View style={styles.disabledContainer}>
          <vector_icons_1.Ionicons name="football-outline" size={56} color={DS.accent}/>
          <react_native_1.Text style={styles.disabledTitle}>{t("sportsHome.disabled")}</react_native_1.Text>
          <react_native_1.TouchableOpacity style={styles.enableButton} onPress={function () { return expo_router_1.router.push("/settings"); }} activeOpacity={0.9}>
            <vector_icons_1.Ionicons name="settings" size={18} color={DS.bg}/>
            <react_native_1.Text style={styles.enableButtonText}>{t("common.settings")}</react_native_1.Text>
          </react_native_1.TouchableOpacity>
        </react_native_1.View>
      </react_native_1.View>);
    }
    return (<react_native_1.View style={styles.container}>
      {/* Background glow effects */}
      <react_native_1.View style={styles.bgGlow}/>

      {/* Header - stable, always visible */}
      <react_native_1.View style={styles.headerContainer}>
        <NexoraHeader_1.NexoraHeader variant="module" title="NEXORA SPORT" titleColor={DS.accent} compact showSearch showNotification showFavorites showProfile onSearch={function () { return expo_router_1.router.push("/(tabs)/search"); }} onNotification={function () { return expo_router_1.router.push("/follow-center"); }} onFavorites={function () { return expo_router_1.router.push("/favorites"); }} onProfile={function () { return expo_router_1.router.push("/profile"); }}/>

        {/* Pane Navigation */}
        <react_native_1.View style={styles.paneNav}>
          <react_native_1.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.paneNavContent}>
            {["explore", "live", "matchday", "insights"].map(function (pane) {
            var isActive = activePane === pane;
            var label = {
                explore: t("sportsHome.explore"),
                live: t("sportsHome.live"),
                matchday: t("sportsHome.matchday"),
                insights: "Insights",
            }[pane];
            return (<react_native_1.TouchableOpacity key={pane} style={[styles.paneNavItem, isActive && styles.paneNavItemActive]} onPress={function () { return setActivePane(pane); }} activeOpacity={0.8}>
                  <react_native_1.Text style={[styles.paneNavText, isActive && styles.paneNavTextActive]}>
                    {label}
                  </react_native_1.Text>
                </react_native_1.TouchableOpacity>);
        })}
          </react_native_1.ScrollView>
        </react_native_1.View>
      </react_native_1.View>

      {/* Content Panes */}
      <react_native_1.ScrollView style={styles.content} contentContainerStyle={styles.contentInner} refreshControl={<react_native_1.RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={DS.accent}/>} scrollEventThrottle={16} showsVerticalScrollIndicator={false}>
        {activePane === "explore" && <ExplorePane />}
        {activePane === "live" && <LivePane matches={((_b = liveQuery.data) === null || _b === void 0 ? void 0 : _b.live) || []}/>}
        {activePane === "matchday" && <MatchdayPane matches={((_c = todayQuery.data) === null || _c === void 0 ? void 0 : _c.upcoming) || []}/>}
        {activePane === "insights" && <InsightsPane />}
      </react_native_1.ScrollView>
    </react_native_1.View>);
}
// ═══════════════════════════════════════════════════════════════════════════════
// PANE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
function ExplorePane() {
    var t = (0, useTranslation_1.useTranslation)().t;
    return (<react_native_1.View style={{ paddingBottom: 40 }}>
      <SectionTitle title={t("sportsHome.explore")}/>
      <react_native_1.View style={{ paddingHorizontal: 18, paddingVertical: 20 }}>
        <react_native_1.Text style={styles.placeholderText}>{t("sportsHome.exploreSports")}</react_native_1.Text>
      </react_native_1.View>
    </react_native_1.View>);
}
function LivePane(_a) {
    var matches = _a.matches;
    var t = (0, useTranslation_1.useTranslation)().t;
    if (!matches || matches.length === 0) {
        return (<react_native_1.View style={{ paddingBottom: 40 }}>
        <SectionTitle title={t("sportsHome.live")}/>
        <EmptyState icon="football-outline" title={t("sportsHome.noLiveMatches")}/>
      </react_native_1.View>);
    }
    return (<react_native_1.View style={{ paddingBottom: 40 }}>
      <SectionTitle title={t("sportsHome.live")} count={matches.length}/>
      <react_native_1.View style={styles.matchList}>
        {matches.map(function (match, idx) { return (<SportCards_1.LiveMatchCard key={"".concat(match.id, "-").concat(idx)} match={match} onPress={function () { }}/>); })}
      </react_native_1.View>
    </react_native_1.View>);
}
function MatchdayPane(_a) {
    var matches = _a.matches;
    var t = (0, useTranslation_1.useTranslation)().t;
    if (!matches || matches.length === 0) {
        return (<react_native_1.View style={{ paddingBottom: 40 }}>
        <SectionTitle title={t("sportsHome.matchday")}/>
        <EmptyState icon="calendar-outline" title={t("sportsHome.noUpcomingMatches")}/>
      </react_native_1.View>);
    }
    return (<react_native_1.View style={{ paddingBottom: 40 }}>
      <SectionTitle title={t("sportsHome.matchday")} count={matches.length}/>
      <react_native_1.View style={styles.matchList}>
        {matches.map(function (match, idx) { return (<SportCards_1.UpcomingMatchCard key={"".concat(match.id, "-").concat(idx)} match={match} onPress={function () { }}/>); })}
      </react_native_1.View>
    </react_native_1.View>);
}
function InsightsPane() {
    var t = (0, useTranslation_1.useTranslation)().t;
    return (<react_native_1.View style={{ paddingBottom: 40 }}>
      <SectionTitle title="Insights"/>
      <react_native_1.View style={{ paddingHorizontal: 18, paddingVertical: 20 }}>
        <react_native_1.Text style={styles.placeholderText}>Analysis & predictions coming soon</react_native_1.Text>
      </react_native_1.View>
    </react_native_1.View>);
}
function SectionTitle(_a) {
    var title = _a.title, count = _a.count;
    return (<react_native_1.View style={styles.sectionTitle}>
      <react_native_1.View style={styles.sectionTitleLeft}>
        <react_native_1.View style={styles.accentBar}/>
        <react_native_1.Text style={styles.sectionTitleText}>{title}</react_native_1.Text>
        {count !== undefined && count > 0 && (<react_native_1.View style={styles.countBadge}>
            <react_native_1.Text style={styles.countText}>{count}</react_native_1.Text>
          </react_native_1.View>)}
      </react_native_1.View>
    </react_native_1.View>);
}
function EmptyState(_a) {
    var icon = _a.icon, title = _a.title;
    return (<react_native_1.View style={styles.emptyState}>
      <vector_icons_1.Ionicons name={icon} size={48} color={DS.muted}/>
      <react_native_1.Text style={styles.emptyStateText}>{title}</react_native_1.Text>
    </react_native_1.View>);
}
// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
var styles = react_native_1.StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: DS.bg,
    },
    bgGlow: {
        position: "absolute",
        top: 0,
        left: "50%",
        width: 400,
        height: 400,
        borderRadius: 200,
        backgroundColor: "rgba(229,9,20,0.08)",
        transform: [{ translateX: -200 }],
        zIndex: 1,
    },
    // ─────────────────────────────────────────────────────────────────────────────
    // HEADER & NAV
    // ─────────────────────────────────────────────────────────────────────────────
    headerContainer: {
        backgroundColor: DS.bg,
        zIndex: 100,
        borderBottomWidth: 1,
        borderBottomColor: DS.border,
    },
    paneNav: {
        backgroundColor: DS.card,
        borderBottomWidth: 1,
        borderBottomColor: DS.border,
    },
    paneNavContent: {
        paddingHorizontal: 18,
        paddingVertical: 12,
        gap: 8,
    },
    paneNavItem: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: "transparent",
    },
    paneNavItemActive: {
        backgroundColor: DS.elevated,
        borderWidth: 1,
        borderColor: "".concat(DS.accent, "60"),
    },
    paneNavText: {
        fontSize: 13,
        fontWeight: "600",
        color: DS.muted,
        fontFamily: "Inter_600SemiBold",
    },
    paneNavTextActive: {
        color: DS.accent,
        fontWeight: "700",
        fontFamily: "Inter_700Bold",
    },
    // ─────────────────────────────────────────────────────────────────────────────
    // CONTENT
    // ─────────────────────────────────────────────────────────────────────────────
    content: {
        flex: 1,
    },
    contentInner: {
        paddingTop: 12,
    },
    // ─────────────────────────────────────────────────────────────────────────────
    // SECTION TITLE
    // ─────────────────────────────────────────────────────────────────────────────
    sectionTitle: {
        paddingHorizontal: 18,
        paddingVertical: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    sectionTitleLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    accentBar: {
        width: 3,
        height: 24,
        backgroundColor: DS.accent,
        borderRadius: 2,
    },
    sectionTitleText: {
        fontSize: 20,
        fontWeight: "800",
        color: DS.text,
        letterSpacing: -0.3,
        fontFamily: "Inter_800ExtraBold",
    },
    countBadge: {
        backgroundColor: "rgba(229,9,20,0.15)",
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderWidth: 1,
        borderColor: "rgba(229,9,20,0.3)",
        marginLeft: 8,
    },
    countText: {
        fontSize: 11,
        fontWeight: "800",
        color: DS.accent,
        fontFamily: "Inter_700Bold",
    },
    // ─────────────────────────────────────────────────────────────────────────────
    // MATCH LIST
    // ─────────────────────────────────────────────────────────────────────────────
    matchList: {
        paddingHorizontal: 18,
        gap: 12,
    },
    // ─────────────────────────────────────────────────────────────────────────────
    // EMPTY STATE
    // ─────────────────────────────────────────────────────────────────────────────
    emptyState: {
        marginTop: 60,
        alignItems: "center",
        gap: 12,
    },
    emptyStateText: {
        fontSize: 14,
        fontWeight: "500",
        color: DS.muted,
        fontFamily: "Inter_500Medium",
    },
    placeholderText: {
        fontSize: 14,
        fontWeight: "500",
        color: DS.muted,
        fontFamily: "Inter_500Medium",
    },
    // ─────────────────────────────────────────────────────────────────────────────
    // DISABLED STATE
    // ─────────────────────────────────────────────────────────────────────────────
    disabledContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        paddingHorizontal: 20,
    },
    disabledTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: DS.text,
        fontFamily: "Inter_700Bold",
    },
    disabledMessage: {
        fontSize: 13,
        fontWeight: "500",
        color: DS.muted,
        textAlign: "center",
        fontFamily: "Inter_500Medium",
    },
    enableButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: DS.accent,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 10,
        marginTop: 12,
    },
    enableButtonText: {
        fontSize: 14,
        fontWeight: "700",
        color: DS.bg,
        fontFamily: "Inter_700Bold",
    },
});
