const mode = String(process.argv[2] || "ci").trim().toLowerCase();
const routeArg = String(process.argv[3] || "").trim().toLowerCase();

function hasValue(name) {
  return String(process.env[name] || "").trim().length > 0;
}

function parseRoutes(value) {
  if (!value || value === "none") return [];
  return value.split("+").map((entry) => entry.trim()).filter(Boolean);
}

function requiredForRoutes(routes) {
  const required = new Set();
  if (routes.includes("ota")) {
    required.add("EXPO_TOKEN");
    required.add("EXPO_PUBLIC_API_BASE");
  }
  if (routes.includes("apk")) {
    required.add("EXPO_PUBLIC_API_BASE");
    required.add("EXPO_PUBLIC_API_BASES");
  }
  if (routes.includes("server")) {
    required.add("RENDER_DEPLOY_HOOK_URL");
  }
  return [...required];
}

function main() {
  if (mode === "ci") {
    console.log("env sanity (ci): OK");
    return;
  }

  const routes = parseRoutes(routeArg);
  const required = requiredForRoutes(routes);
  const missing = required.filter((name) => !hasValue(name));

  if (missing.length > 0) {
    console.error(`env sanity (${mode}) failed for route '${routeArg}'. Missing: ${missing.join(", ")}`);
    process.exit(1);
  }

  console.log(`env sanity (${mode}) OK for route '${routeArg || "none"}'`);
}

main();
