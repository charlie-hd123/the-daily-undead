import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);

async function readProjectFile(path) {
  return fs.readFile(new URL(path, projectRoot), "utf8");
}

test("the published page uses local fonts and privacy-safe external links", async () => {
  const [html, css] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("styles.css"),
  ]);

  assert.doesNotMatch(html, /fonts\.(?:googleapis|gstatic)\.com/);
  assert.doesNotMatch(css, /fonts\.(?:googleapis|gstatic)\.com/);
  assert.match(
    html,
    /href="https:\/\/tally\.so\/r\/q4XeD7"[^>]*rel="noopener noreferrer"[^>]*referrerpolicy="no-referrer"/,
  );
  assert.match(html, /id="advance-dev-day"[^>]*hidden/);
  assert.match(html, /id="advance-dev-day"[^>]*>ADVANCE A DAY<\/button>/);
  assert.match(
    html,
    /trademarks of their respective owners\.[\s\S]*id="advance-dev-day"[\s\S]*<\/p>/,
  );
});

test("the launch package includes a restrained maintenance page", async () => {
  const maintenance = await readProjectFile("maintenance.html");

  assert.match(maintenance, /<h1>Scheduled maintenance<\/h1>/);
  assert.match(maintenance, /Your Score, Puzzle Solves, Round and Highest Round are safe\./);
  assert.doesNotMatch(maintenance, /regroup/i);
  assert.doesNotMatch(maintenance, /https?:\/\//i);
});

test("the page's local release assets exist", async () => {
  const requiredFiles = [
    "assets/favicon.png",
    "assets/apple-touch-icon.png",
    "assets/zombie-logo.png",
    "assets/avatars/richtofen.png",
    "assets/avatars/dempsey.png",
    "assets/avatars/takeo.png",
    "assets/avatars/nikolai.png",
    "assets/avatars/samantha.png",
    "assets/avatars/dr-maxis.png",
    "assets/avatars/dr-monty.png",
    "assets/avatars/warden.png",
    "assets/avatars/misty.png",
    "assets/avatars/stuhlinger.png",
    "assets/avatars/marlton.png",
    "assets/avatars/russman.png",
    "assets/avatars/scarlett.png",
    "assets/avatars/diego.png",
    "assets/avatars/bruno.png",
    "assets/avatars/stanton.png",
    "assets/avatars/weaver.png",
    "assets/avatars/grey.png",
    "assets/avatars/carver.png",
    "assets/avatars/maya.png",
    "assets/avatars/shadowman.png",
    "assets/avatars/tedd.png",
    "assets/avatars/brutus.png",
    "assets/fonts/OFL.txt",
    "assets/fonts/barlow-400.ttf",
    "assets/fonts/barlow-500.ttf",
    "assets/fonts/barlow-600.ttf",
    "assets/fonts/barlow-700.ttf",
    "assets/fonts/barlow-800.ttf",
    "assets/fonts/barlow-condensed-600.ttf",
    "assets/fonts/barlow-condensed-700.ttf",
    "assets/fonts/barlow-condensed-800.ttf",
    "assets/fonts/barlow-condensed-900.ttf",
    "styles.css",
    "js/app.js",
    "js/account.js",
    "js/account-session.js",
    "js/community-stats.js",
    "js/game-core.js",
    "js/leaderboards.js",
    "js/progression.js",
    "js/social-demo.js",
  ];

  await Promise.all(
    requiredFiles.map(async (path) => {
      const stats = await fs.stat(new URL(path, projectRoot));
      assert.equal(stats.isFile(), true, `${path} should exist`);
      assert.equal(stats.size > 0, true, `${path} should not be empty`);
    }),
  );
});

test("browser-loaded code and styles share the current cache version", async () => {
  const [html, app] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("js/app.js"),
  ]);
  const versionTokens = [...`${html}\n${app}`.matchAll(/\?v=(\d{8}-\d+)/g)].map(
    (match) => match[1],
  );

  assert.equal(versionTokens.length >= 5, true);
  assert.deepEqual(new Set(versionTokens), new Set(["20261002-7"]));
});

test("account controls support optional sign-in without exposing private credentials", async () => {
  const [html, css, account, appScript, workerConfig] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("styles.css"),
    readProjectFile("js/account.js"),
    readProjectFile("js/app.js"),
    readProjectFile("worker/wrangler.jsonc"),
  ]);

  assert.match(html, /id="account-button"/);
  assert.match(html, /id="leaderboards-button"/);
  assert.match(html, /id="account-button"[\s\S]*?id="leaderboards-button"/);
  assert.match(html, /id="leaderboards-dialog"/);
  assert.match(html, /<p class="kicker">The Daily Undead Leaderboards<\/p>/);
  assert.match(html, /<h2>Leaderboards<\/h2>/);
  assert.match(html, /data-leaderboard-tab="daily"/);
  assert.match(html, /data-leaderboard-tab="all-time"/);
  assert.match(html, /data-leaderboard-player-count/);
  assert.match(html, /<h3>Correct today<\/h3>/);
  assert.doesNotMatch(html, /Map \+ bonus correct/);
  assert.match(html, /data-leaderboard-list="daily-elite"/);
  assert.doesNotMatch(html, /data-leaderboard-list="daily-incorrect"/);
  assert.match(html, /data-leaderboard-list="all-time"/);
  assert.doesNotMatch(html, /data-all-time-ranking/);
  assert.match(html, /data-leaderboard-your-rank/);
  assert.match(html, /data-leaderboard-find="daily"/);
  assert.match(html, /data-leaderboard-find="all-time"/);
  assert.match(html, /placeholder="Tell us your favourite Zombies memory\.\.\."/);
  assert.match(account, /label: "Toxic", requiredMaps: 50/);
  assert.match(account, /label: "Cryo", requiredMaps: 100/);
  assert.match(account, /label: "Napalm", requiredMaps: 250/);
  assert.match(account, /label: "Blood", requiredMaps: 500/);
  assert.match(account, /label: "Aether", requiredMaps: 1000/);
  assert.match(appScript, /initialiseLeaderboards\(\{/);
  assert.match(appScript, /getCurrentUsername: getLeaderboardUsername/);
  assert.match(appScript, /get\("leaderboardUser"\)/);
  assert.match(
    appScript,
    /bestRound = Math\.max\(loadBestRound\(\), streakCount\);\s*\/\/ Older browser saves[\s\S]*?saveBestRound\(\);/,
  );
  assert.match(
    appScript,
    /function saveBestRound\(\)[\s\S]*?localStorage\.setItem\(bestRoundStorageKey, String\(bestRound\)\)/,
  );
  assert.match(css, /\.leaderboard-entry\.is-current-player/);
  assert.match(css, /\.leaderboard-status \{\s*margin: 0 0 0\.85rem;/);
  assert.doesNotMatch(css, /\.leaderboard-status \{[^}]*min-height:/);
  const leaderboards = await readProjectFile("js/leaderboards.js");
  assert.match(leaderboards, /scrollIntoView\(\{ block: "center"/);
  assert.match(leaderboards, /toolbar\.hidden = !\[\.\.\.toolbar\.children\]\.some/);
  assert.match(css, /\.leaderboard-dialog \[role="tabpanel"\] \{[\s\S]*?margin-top: 0\.65rem;/);
  assert.match(css, /\.leaderboard-panel-tools\[hidden\] \{\s*display: none;/);
  assert.match(css, /@media \(max-width: 35rem\)[\s\S]*?\.leaderboard-dialog \[role="tabpanel"\] \{[\s\S]*?margin-top: 0\.45rem;/);
  assert.match(css, /@media \(max-width: 35rem\)[\s\S]*?\.leaderboard-all-time-tools \.leaderboard-find-me \{\s*transform: translateY\(0\.1rem\);/);
  assert.match(
    html,
    /class="header-utility"[\s\S]*id="account-button"[\s\S]*class="round-timing"[\s\S]*class="player-stats"/,
  );
  assert.match(html, /class="round-timing"[\s\S]*class="next-round"/);
  assert.doesNotMatch(html, /id="account-status"/);
  assert.doesNotMatch(account, /accountStatus|setStatus/);
  assert.doesNotMatch(css, /\.account-status/);
  assert.match(appScript, /weekday: "long"/);
  assert.match(appScript, /className = "puzzle-date-long"/);
  assert.match(css, /@media \(max-width: 35rem\)[\s\S]*?\.puzzle-date-short \{\s*display: none;/);
  assert.match(css, /@media \(max-width: 35rem\)[\s\S]*?\.puzzle-date-long \{\s*display: inline;/);
  assert.match(
    html,
    />Create an account to keep your score across devices\./,
  );
  assert.match(
    css,
    /@media \(max-width: 60rem\)[\s\S]*?\.header-utility \.round-timing \{\s*order: -1;/,
  );
  assert.match(html, /id="account-onboarding-form"/);
  assert.match(html, /<h2>Choose your username<\/h2>/);
  assert.match(html, /Score\s*<strong id="score-count">0<\/strong>/);
  assert.match(html, /Solves\s*<strong id="solves-count">0<\/strong>/);
  assert.match(html, /Round\s*<strong id="streak-count">1<\/strong>/);
  assert.match(html, /<button class="button primary" type="submit">Finish setup<\/button>/);
  assert.match(account, /accountButton\.textContent = "Finish setup";/);
  assert.match(appScript, /<h2>Run ended<\/h2>/);
  assert.doesNotMatch(appScript, /revive-player|revive-missed-day|Revive unavailable/);
  assert.match(appScript, /Your Score, Solves and Highest Round are safe\./);
  assert.match(appScript, /Return tomorrow to keep your Round alive\./);
  assert.match(
    appScript,
    /`🔥 Round: \$\{shareRound\}`,[\s\S]*?`⚡ Score: \$\{score\}`,[\s\S]*?`🏆 Solves: \$\{solves\}`,[\s\S]*?`📈 Highest Round: \$\{bestRound\}`/,
  );
  assert.doesNotMatch(appScript, /<h2>Your run has ended<\/h2>/);
  assert.match(
    html,
    /This public username will identify you on leaderboards\. Your email is never shown\./,
  );
  assert.match(html, /name="importLocalProgress"/);
  assert.match(account, /session\?\.getToken\(\)/);
  assert.match(account, /Authorization: `Bearer \$\{token\}`/);
  assert.match(account, /accountButton\.textContent = "Log in";/);
  assert.match(html, /id="account-session-expired-dialog"/);
  assert.match(html, /<h2>Session has expired<\/h2>/);
  assert.match(html, /id="account-session-login"[^>]*>Log in<\/button>/);
  assert.match(html, /Your existing cloud save is safe\./);
  assert.match(html, /id="account-progress-conflict-dialog"/);
  assert.match(account, /accountButton\.textContent = "Session expired";/);
  assert.match(account, /readRememberedAccount/);
  assert.match(account, /readPendingProgress/);
  assert.match(account, /baseRevision/);
  assert.match(css, /#account-button\.has-expired-session/);
  assert.match(account, /accountButton\.textContent = "Loading\.\.\.";/);
  assert.doesNotMatch(account, /setStatus\("Playing as guest"\)/);
  assert.match(account, /accountButton\.textContent = profile\.username;/);
  assert.match(account, /accountButton\.classList\.add\("has-username"\)/);
  assert.match(css, /\.account-button\.has-username \{\s*text-transform: none;/);
  assert.match(account, /function createClerkAppearance\(\)/);
  assert.match(account, /appearance: createClerkAppearance\(\)/);
  assert.match(account, /colorPrimary: "#67e8ff"/);
  assert.match(account, /colorBackground: "#0d111d"/);
  assert.match(account, /fontFamilyButtons: displayFont/);
  assert.match(account, /fontSize: "0\.875rem"/);
  assert.match(account, /outline: "3px solid #ffffff"/);
  assert.match(account, /boxShadow:[\s\S]*?!important/);
  assert.match(account, /navbarButton__active/);
  assert.match(account, /profileSectionPrimaryButton/);
  assert.match(account, /formButtonPrimary/);
  assert.match(account, /customPages/);
  assert.match(account, /label: "Change username"/);
  assert.match(account, /"\/api\/account\/username"/);
  assert.match(html, /id="account-username-dialog"/);
  assert.equal((html.match(/maxlength="16"/g) || []).length, 2);
  assert.equal((html.match(/3–16 letters, numbers or underscores\./g) || []).length, 2);
  assert.match(
    html,
    /id="account-onboarding-form"[\s\S]*?name="username"[\s\S]*?id="account-username-form"/,
  );
  assert.match(
    html,
    /id="account-username-form"[\s\S]*?name="publicName"[\s\S]*?autocomplete="off"/,
  );
  assert.match(account, /usernameForm\.elements\.publicName\.value = profile\.username/);
  assert.match(account, /button\.dataset\.openUsernameEditor = ""/);
  assert.match(account, /event\.target\.closest\("\[data-open-username-editor\]"\)/);
  assert.match(account, /label: "Sign out"/);
  assert.match(account, /clerk\.signOut\(/);
  assert.match(html, /id="account-details-dialog"/);
  assert.match(html, /id="account-security-dialog"/);
  assert.match(html, /id="account-sign-out-dialog"/);
  assert.match(account, /action === "profile"[\s\S]*?openDialog\(accountDetailsDialog\)/);
  assert.match(account, /action === "security"[\s\S]*?openDialog\(accountSecurityDialog\)/);
  assert.match(account, /action === "sign-out"[\s\S]*?openDialog\(accountSignOutDialog\)/);
  assert.match(
    html,
    /data-account-action="game-profile"[\s\S]*?data-account-action="username"[\s\S]*?data-account-action="profile"[\s\S]*?data-account-action="security"[\s\S]*?data-account-action="sign-out"/,
  );
  assert.match(appScript, /catalog\.mapOrder\?\.\[game\.id\][\s\S]*?mapOrder\.get\(left\.id\)/);
  assert.match(account, /textContent = "Edit your profile →"[\s\S]*?openProfileEditor\(\)/);
  assert.match(account, /textContent = "Profile saved\.";[\s\S]*?closeDialog\(profileEditorDialog\)/);
  assert.match(css, /\.public-profile-header h2 \{[^}]*text-transform: none;/);
  assert.match(account, /\[data-confirm-sign-out\][\s\S]*?beforeSignOut\(\)[\s\S]*?clerk\.signOut\(/);
  assert.match(account, /accountButton\.classList\.add\("is-signed-in"\)/);
  assert.match(css, /\.clerk-sign-out-page::before,/);
  assert.match(css, /\.clerk-username-page::before \{/);
  assert.match(css, /linear-gradient\(90deg, var\(--aether\), var\(--aether-violet\), var\(--aether-pink\)\)/);
  assert.match(css, /font-size: clamp\(1\.65rem, 4vw, 2\.1rem\);/);
  assert.match(css, /#account-button:not\(\.is-signed-in\)/);
  assert.match(css, /#account-button::before[\s\S]*mask-image:/);
  assert.match(css, /#leaderboards-button::before[\s\S]*mask-image:/);
  assert.match(appScript, /state\?\.phase === "result" && Boolean\(state\.newBestRound\)/);
  assert.match(css, /\.stat-display\.is-highest-round::after/);
  assert.match(css, /content: "✦";/);
  assert.doesNotMatch(css, /content: "New high";/);
  assert.doesNotMatch(appScript, /result-milestone-banner/);
  assert.match(css, /\.account-button::after[\s\S]*content: "›";/);
  assert.match(css, /\.account-button:not\(:disabled\):hover/);
  assert.match(css, /@media \(max-width: 35rem\)[\s\S]*?\.account-button \{\s*width: 100%;/);
  assert.match(css, /@media \(max-width: 35rem\)[\s\S]*?\.account-button \{[\s\S]*?font-size: 0\.72rem;/);
  assert.match(css, /font-size: clamp\(0\.64rem, 2\.7vw, 0\.78rem\);/);
  assert.match(
    css,
    /@media \(max-width: 35rem\)[\s\S]*?\.account-controls \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    css,
    /@media \(max-width: 35rem\)[\s\S]*?\.round-timing \{[\s\S]*?grid-template-columns: auto minmax\(1rem, 1fr\) auto;[\s\S]*?width: calc\(100% - 0\.375rem\);/,
  );
  assert.match(css, /\.round-timing::after \{[\s\S]*?height: 1px;[\s\S]*?rgb\(156 181 223 \/ 16%\)/);
  assert.match(css, /\.round-timing \.next-round \{[\s\S]*?justify-self: end;/);
  assert.match(
    css,
    /@media \(max-width: 35rem\)[\s\S]*?\.player-stats \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: wrap;/,
  );
  assert.match(
    css,
    /@media \(max-width: 35rem\)[\s\S]*?\.stat-display \{[\s\S]*?min-width: max-content;[\s\S]*?flex: 1 1 auto;/,
  );
  assert.match(
    css,
    /\.account-button \{[\s\S]*?display: inline-flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;/,
  );
  assert.doesNotMatch(account, /setStatus\("Progress synced"\)/);
  assert.doesNotMatch(`${html}\n${account}\n${workerConfig}`, /sk_(?:test|live)_/);
});

test("mobile community statistics center each row and allow long labels to wrap", async () => {
  const css = await readProjectFile("styles.css");

  assert.match(
    css,
    /@media \(max-width: 35rem\)[\s\S]*?\.community-stat \{\s*justify-content: center;/,
  );
  assert.match(
    css,
    /\.community-stat > span \{\s*min-width: 0;\s*overflow-wrap: anywhere;/,
  );
  assert.match(
    css,
    /@media \(max-width: 35rem\)[\s\S]*?\.community-stat strong \{\s*min-width: 0;/,
  );
});

test("hover highlights are limited to precise pointers", async () => {
  const css = await readProjectFile("styles.css");

  assert.match(
    css,
    /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.button:hover,\s*\.card-button:hover,\s*\.order-choice:hover/,
  );
});

test("avatar portraits stay clipped behind an opaque circular border", async () => {
  const css = await readProjectFile("styles.css");

  assert.match(
    css,
    /\.zombie-avatar \{[\s\S]*?overflow: hidden;[\s\S]*?border: 2px solid #[0-9a-f]{6};[\s\S]*?border-radius: 50%;[\s\S]*?background-clip: padding-box;/i,
  );
});

test("profile customisation keeps horizontal pickers inside narrow mobile dialogs", async () => {
  const css = await readProjectFile("styles.css");

  assert.match(css, /\.profile-editor-dialog form \{[\s\S]*?min-width: 0;[\s\S]*?overflow-x: hidden;/);
  assert.match(css, /\.profile-choice-field \{[\s\S]*?min-width: 0;/);
  assert.match(css, /\.avatar-picker \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;/);
  assert.match(css, /\.theme-picker \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;/);
  assert.match(css, /@media \(max-width: 35rem\)[\s\S]*?\.public-profile-header \{[\s\S]*?minmax\(0, 1fr\)/);
});

test("profile customisation keeps its scrollbars present", async () => {
  const [html, css, app] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("styles.css"),
    readProjectFile("js/app.js"),
  ]);

  assert.match(css, /\.profile-editor-dialog form \{[\s\S]*?overflow-y: scroll;[\s\S]*?scrollbar-gutter: stable;/);
  assert.match(css, /\.avatar-picker \{[\s\S]*?overflow-x: scroll;[\s\S]*?scrollbar-gutter: stable;/);
  assert.match(css, /\.theme-picker \{[\s\S]*?overflow-x: scroll;[\s\S]*?scrollbar-gutter: stable;/);
  assert.equal((html.match(/data-profile-scrollbar/g) || []).length, 2);
  assert.match(css, /\.profile-scrollbar span \{[\s\S]*?background: rgb\(103 232 255 \/ 60%\);/);
  assert.match(app, /function initialiseProfileScrollbars\(\)[\s\S]*?picker\.addEventListener\("scroll", update/);
});

test("player stat pills expose dismissible explainers", async () => {
  const [html, css, app] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("styles.css"),
    readProjectFile("js/app.js"),
  ]);

  assert.equal((html.match(/data-stat-explainer="/g) || []).length, 3);
  assert.match(html, /id="player-stat-explainer"[^>]*role="status"[^>]*hidden/);
  assert.match(
    app,
    /Your current survival run\. It advances after each solve and ends if you miss a day or choose the wrong map\./,
  );
  assert.match(app, /recordNotice\.textContent = "This is your highest round!"/);
  assert.doesNotMatch(app, /unless you use a Revive/);
  assert.match(app, /Points earned in each puzzle are added to Score, which never decreases or resets\./);
  assert.match(app, /The total number of Daily Undead puzzles you’ve solved\./);
  assert.match(app, /migrateStoredRoundNumbering\(localStorage, \{/);
  assert.match(app, /versionKey: roundNumberingStorageKey,[\s\S]*streakCount = loadStreak\(\);/);
  assert.match(app, /if \(wasOpen\) return;/);
  assert.match(app, /if \(!playerStats\.contains\(event\.target\)\) closeStatExplainer\(\)/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(css, /\.player-stat-explainer \{[\s\S]*?position: absolute;[\s\S]*?width: 100%;/);
  assert.match(css, /\.stat-display \{[\s\S]*?border: 1px solid rgb\(247 200 92 \/ 30%\);/);
  assert.match(css, /\.stat-display\.subdued-stat \{[\s\S]*?border-color: rgb\(74 142 181 \/ 30%\);/);
  assert.match(css, /\.stat-display\.subdued-stat strong \{[\s\S]*?background: linear-gradient\(145deg, #233a59, #172841\);/);
  assert.match(css, /\.stat-display\.subdued-stat\[aria-expanded="true"\] \{[\s\S]*?border-color: rgb\(103 232 255 \/ 62%\);/);
  assert.match(css, /\.stat-display\.subdued-stat\.is-highest-round\[aria-expanded="true"\] \{[\s\S]*?border-color: rgb\(247 200 92 \/ 78%\);/);
  assert.match(app, /isHighestRound[\s\S]*?\? "record"[\s\S]*?"score" \? "reward" : "aether"/);
  assert.match(css, /\.player-stat-explainer\[data-theme="aether"\] > strong \{[\s\S]*?color: var\(--aether\);/);
  assert.match(css, /\.stat-explainer-record \{[\s\S]*?color: var\(--essence\);/);
  assert.match(css, /\.stat-explainer-record::before \{[\s\S]*?content: "✦";/);
});

test("player stat pills show Zombies-style floating progression rewards", async () => {
  const [css, app] = await Promise.all([
    readProjectFile("styles.css"),
    readProjectFile("js/app.js"),
  ]);

  assert.match(app, /reward\.className = `stat-reward-pop is-\$\{theme\}`/);
  assert.match(app, /reward\.textContent = `\+\$\{progressNumberFormatter\.format\(amount\)\}`/);
  assert.match(app, /reward\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(app, /animateStat\(scoreLabel, points, "reward"\)/);
  assert.match(app, /animateStat\(solvesLabel, 1, "aether"\)/);
  assert.match(app, /const roundTheme = streakCount > previousBestRound \? "record" : "aether"/);
  assert.match(css, /\.stat-reward-pop \{[\s\S]*?animation: stat-reward-float 1\.15s/);
  assert.match(app, /window\.setTimeout\(finish, 1400\)/);
  assert.match(css, /\.stat-reward-pop\.is-record::before \{[\s\S]*?content: "✦";/);
  assert.match(css, /@keyframes stat-reward-float \{/);
  assert.match(css, /\.stat-display\.subdued-stat\.is-earned \{\s*animation-name: stat-earned-aether;/);
});

test("stat rewards stay attached to their header pills", async () => {
  const [html, css, app] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("styles.css"),
    readProjectFile("js/app.js"),
  ]);

  assert.doesNotMatch(html, /id="reward-hud"/);
  assert.doesNotMatch(app, /showViewportReward|reward-hud-item/);
  assert.doesNotMatch(css, /\.reward-hud|reward-hud-arrival/);
});

test("the progression update auto-opens for two days and remains in leaderboards for four", async () => {
  const [html, css, app] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("styles.css"),
    readProjectFile("js/app.js"),
  ]);

  assert.match(html, /id="progression-update-button"[^>]*hidden/);
  assert.match(html, /id="leaderboards-dialog"[\s\S]*?id="progression-update-button"/);
  assert.doesNotMatch(html, /class="header-meta"[\s\S]*?id="progression-update-button"[\s\S]*?<\/header>/);
  assert.match(html, /id="progression-update-dialog"/);
  assert.match(
    html,
    /name="daily-undead-progression-launch-at" content="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"/,
  );
  assert.match(html, /<h2>A simpler scoring system<\/h2>/);
  assert.match(html, /It never decreases, resets or gets spent, so every successful puzzle moves you forward\./);
  assert.match(html, /Failing ends your current Round, but not your career progress\./);
  assert.match(html, /Your Score is our best estimate from the history available\./);
  assert.match(html, /leaderboard positions closely match the original standings\./);
  assert.match(html, /Nobody’s Score has been reset\./);
  assert.match(app, /getProgressionUpdateVisibility/);
  assert.match(app, /if \(!visibility\.showReminder\) return;/);
  assert.match(app, /if \(visibility\.autoOpen && !document\.querySelector\("dialog\[open\]"\)\)/);
  assert.match(app, /getCurrentTime\(\)\.getTime\(\)/);
  assert.match(app, /function hasEstablishedProgress\(\)/);
  assert.match(app, /updateState\.autoShown = true;/);
  assert.match(app, /progressionUpdateButton\.addEventListener\("click", openProgressionUpdate\)/);
  assert.match(css, /\.progression-update-button \{/);
  assert.match(css, /\.progression-update-dialog \.progression-update-benefit \{/);
  assert.match(css, /\.progression-estimate-note \{/);
});

test("survivor profiles always expose a labelled favourite memory section", async () => {
  const [account, demo, css] = await Promise.all([
    readProjectFile("js/account.js"),
    readProjectFile("js/social-demo.js"),
    readProjectFile("styles.css"),
  ]);

  assert.match(account, /No favourite memory shared yet\./);
  assert.match(demo, /No favourite memory shared yet\./);
  assert.match(css, /\.public-profile-bio::before[\s\S]*?content: "FAVOURITE MEMORY"/);
  assert.match(account, /stats\.append\([\s\S]*?makeProfileStat\("Score"[\s\S]*?makeProfileStat\("Puzzle Solves"[\s\S]*?makeProfileStat\("Current Round"[\s\S]*?makeProfileStat\("Highest Round"/);
  assert.match(account, /const content = \[header, bio, stats, favourites\]/);
  assert.doesNotMatch(account, /makeStatGroup|"Career"|"Survival"/);
  assert.doesNotMatch(account, /public-profile-identity-line/);
  assert.match(css, /\.public-profile-overview \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(max-width: 35rem\)[\s\S]*?\.public-profile-overview \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.doesNotMatch(css, /\.public-profile-stat\.is-primary/);
  assert.doesNotMatch(account, /public-profile-stat\$\{primary/);
  assert.match(css, /\.public-profile-favourite \{/);
});

test("Double Points uses the Score reward yellow", async () => {
  const [app, css] = await Promise.all([
    readProjectFile("js/app.js"),
    readProjectFile("styles.css"),
  ]);

  assert.match(app, /"Double Points!"/);
  assert.match(css, /--essence: #f7c85c;/);
  assert.match(css, /--perfect: var\(--essence\);/);
  assert.match(css, /\.result-banner\.perfect \{[\s\S]*?color: var\(--perfect\);/);
});

test("the clue count stays editable until a map is confirmed", async () => {
  const app = await readProjectFile("js/app.js");

  assert.match(app, /id="back-to-clues"[^>]*>Back to clues<\/button>/);
  assert.match(app, /setState\(\{ phase: "clues", selectedGameId: null, selectedMapId: null \}\)/);
  assert.match(app, /setState\(\{ phase: "game", lockedClues: null \}\)/);
  assert.match(
    app.match(/function renderMapSelection\(\)[\s\S]*?\n}\n/)[0],
    /lockedClues: state\.cluesRevealed/,
  );
  assert.doesNotMatch(app, /phase: "clue-review"/);
});

test("the guessing screen uses hard clues and the ordering bonus uses full clues", async () => {
  const app = await readProjectFile("js/app.js");
  const clueCard = app.match(/function createClueCard\(step, index\) \{[\s\S]*?\n\}/)[0];
  const bonus = app.match(/function renderBonus\(\) \{[\s\S]*?\n\}/)[0];

  assert.match(clueCard, /textContent = step\.hardClue/);
  assert.match(bonus, /escapeHtml\(step\.clue\)/);
  assert.doesNotMatch(bonus, /step\.hardClue/);
});

test("community statistics are placed near the bottom and contain no frontend credentials", async () => {
  const [html, app, workerConfig] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("js/app.js"),
    readProjectFile("worker/wrangler.jsonc"),
  ]);

  assert.match(
    html,
    /<\/main>[\s\S]*class="community-stats"[\s\S]*class="site-footer"/,
  );
  assert.match(html, /id="community-players-today"/);
  assert.match(html, /id="community-games-total"/);
  assert.match(html, /id="community-yesterday-solved"/);
  assert.match(app, /recordCommunityAttempt\(isCorrect\)/);
  assert.doesNotMatch(`${html}\n${app}`, /(?:api[_-]?token|account[_-]?token|database[_-]?id)/i);
  assert.match(workerConfig, /"binding": "DB"/);
});
