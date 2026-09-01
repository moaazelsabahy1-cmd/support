import { readFileSync, existsSync } from "fs";
import path from "path";

function applyEnvFile(file: string) {
  if (!existsSync(file)) return 0;
  const text = readFileSync(file, "utf8");
  let applied = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\uFEFF/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const body = line.replace(/^export\s+/, "");
    const match = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
      applied += 1;
    }
  }
  return applied;
}

applyEnvFile(path.join(process.cwd(), ".env"));
applyEnvFile(path.join(process.cwd(), ".env.local"));
const routerVars = Object.keys(process.env)
  .filter((k) => k.startsWith("OPENROUTER"))
  .sort()
  .join(",");
console.info("[load-env] AI provider env names present:", routerVars || "(none)");
