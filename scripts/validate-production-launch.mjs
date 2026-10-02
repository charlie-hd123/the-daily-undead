import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.html"), "utf8");
const match = html.match(
  /<meta name="daily-undead-progression-launch-at" content="([^"]+)">/,
);
const launchValue = match?.[1] || "";
const launchAt = Date.parse(launchValue);

if (!Number.isFinite(launchAt) || launchValue === "__PROGRESSION_UPDATE_LAUNCH_AT__") {
  console.error("Set the exact UTC progression launch timestamp in index.html before production.");
  process.exitCode = 1;
} else {
  const popupEndsAt = new Date(launchAt + 2 * 24 * 60 * 60 * 1000).toISOString();
  const reminderEndsAt = new Date(launchAt + 4 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`Progression launch: ${new Date(launchAt).toISOString()}`);
  console.log(`Automatic popup ends: ${popupEndsAt}`);
  console.log(`Leaderboard reminder ends: ${reminderEndsAt}`);
}
