import { execSync } from "node:child_process";

const ports = process.argv.slice(2).map((port) => String(port).trim()).filter(Boolean);

if (ports.length === 0) {
  console.log("ℹ️  Geen poorten opgegeven, niets op te ruimen.");
  process.exit(0);
}

for (const port of ports) {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const pids = output
      .split("\n")
      .map((pid) => pid.trim())
      .filter(Boolean);

    if (pids.length === 0) {
      console.log(`✅ Poort ${port} was vrij`);
      continue;
    }

    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        // ignore individual kill errors
      }
    }

    console.log(`✅ Poort ${port} vrijgemaakt (${pids.length} proces${pids.length > 1 ? "sen" : ""} gestopt)`);
  } catch {
    console.log(`✅ Poort ${port} was vrij`);
  }
}
