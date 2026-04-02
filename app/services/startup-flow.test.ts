import {
  canFinishStartupGate,
  getIntroTimings,
  resolveEntryRoute,
  resolveIntroVariant,
} from "./startup-flow";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function testIntroVariants() {
  const firstLaunch = resolveIntroVariant("2.6.28", null);
  assert(firstLaunch.variant === "extended", "first launch should use extended intro");

  const majorUpdate = resolveIntroVariant("3.0.0", "2.9.9");
  assert(majorUpdate.variant === "extended", "major version update should use extended intro");

  const normalLaunch = resolveIntroVariant("2.6.28", "2.6.27");
  assert(normalLaunch.variant === "standard", "normal launch should use standard intro");
}

function testRoutes() {
  assert(resolveEntryRoute(true) === "/(tabs)/home", "authenticated route should be home");
  assert(resolveEntryRoute(false) === "/auth", "logged-out route should be auth");
}

function testStandardDurationGate() {
  const timings = getIntroTimings("standard");
  assert(timings.maxDurationMs === 5000, "standard intro max should be 5 seconds");

  const tooEarly = canFinishStartupGate({
    variant: "standard",
    startedAtMs: 0,
    nowMs: 1800,
    introCompleted: true,
    criticalBootstrapDone: true,
    authReady: true,
    skipRequested: false,
  });
  assert(!tooEarly, "standard intro should not finish before minimum duration");

  const valid = canFinishStartupGate({
    variant: "standard",
    startedAtMs: 0,
    nowMs: 2500,
    introCompleted: true,
    criticalBootstrapDone: true,
    authReady: true,
    skipRequested: false,
  });
  assert(valid, "standard intro should finish once min duration and readiness are met");
}

function testExtendedSkipAndReadyTransitions() {
  const timings = getIntroTimings("extended");
  assert(timings.maxDurationMs > 5000, "extended intro should be longer than standard");

  const skipTooSoon = canFinishStartupGate({
    variant: "extended",
    startedAtMs: 0,
    nowMs: 1200,
    introCompleted: false,
    criticalBootstrapDone: true,
    authReady: true,
    skipRequested: true,
  });
  assert(!skipTooSoon, "extended intro skip should not finish before skip threshold");

  const skipAllowed = canFinishStartupGate({
    variant: "extended",
    startedAtMs: 0,
    nowMs: 2600,
    introCompleted: false,
    criticalBootstrapDone: true,
    authReady: true,
    skipRequested: true,
  });
  assert(skipAllowed, "extended intro skip should finish after skip threshold when app is ready");

  const appNotReady = canFinishStartupGate({
    variant: "extended",
    startedAtMs: 0,
    nowMs: 9200,
    introCompleted: true,
    criticalBootstrapDone: false,
    authReady: false,
    skipRequested: true,
  });
  assert(!appNotReady, "startup gate should not finish if auth/bootstrap are not safe");
}

function testSlowDeviceAndNetworkFallbackBehavior() {
  const slowButSafe = canFinishStartupGate({
    variant: "extended",
    startedAtMs: 0,
    nowMs: 9100,
    introCompleted: false,
    criticalBootstrapDone: true,
    authReady: true,
    skipRequested: false,
  });
  assert(slowButSafe, "startup gate should release once max duration is reached and app is safe");

  const poorNetworkStillBlocked = canFinishStartupGate({
    variant: "standard",
    startedAtMs: 0,
    nowMs: 5400,
    introCompleted: true,
    criticalBootstrapDone: false,
    authReady: true,
    skipRequested: false,
  });
  assert(!poorNetworkStillBlocked, "poor network should keep gate blocked until safe fallback takes over");

  const authHydrationStuck = canFinishStartupGate({
    variant: "standard",
    startedAtMs: 0,
    nowMs: 5400,
    introCompleted: true,
    criticalBootstrapDone: true,
    authReady: false,
    skipRequested: false,
  });
  assert(authHydrationStuck, "startup gate should release at max duration when auth hydration is delayed");
}

function runAllTests() {
  testIntroVariants();
  testRoutes();
  testStandardDurationGate();
  testExtendedSkipAndReadyTransitions();
  testSlowDeviceAndNetworkFallbackBehavior();
  console.log("startup flow tests: all scenarios passed");
}

runAllTests();
