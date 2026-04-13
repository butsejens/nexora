export function canRelease({
  ciPassed,
  envPassed,
  route,
}) {
  if (!ciPassed) return { allowed: false, reason: "ci-failed" };
  if (!envPassed) return { allowed: false, reason: "env-failed" };
  if (!route || route === "none" || route === "manual-review") {
    return { allowed: false, reason: "no-release-route" };
  }
  return { allowed: true, reason: "ok" };
}
