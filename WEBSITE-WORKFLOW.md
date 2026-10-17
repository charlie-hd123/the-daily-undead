# How to request website changes

Your normal workflow is: **ask for a change → review staging → request publication**. Codex handles the local files, Git branches, checks and deployments.

- **Local** is the workbench on your computer. You do not need to keep a server running or manually copy files.
- **Staging** is the full website with your pending changes and safe test accounts/data. It keeps working when your computer is off.
- **Live** is what real players see. It changes only when you ask to publish.

Staging has separate logins/progress from live. Its numbers and fictional players can differ, but its features use the real application. You can log in with a staging account and test saving, profiles and leaderboards. Test activity stays current automatically.

## 1. Start with the outcome and destination

For a small edit:

> On the marketing page, change the Discord heading to “Think you know the map?”. Put it on staging. Keep the checks focused on the marketing output.

For several related visual changes:

> On staging, make the result button wider, reduce the gap above the footer, and use the same button style on both puzzles. Check the affected screens on mobile and desktop. Keep everything else as it is.

For a functional change:

> Add an option to hide my profile from the leaderboard. Use the real staging account system, keep existing progress safe, and test hiding/showing it and viewing it while signed out. Put it on staging for review.

For a bug:

> On staging, I open Leaderboards, choose All time, and tap a player. Their profile stays blank. It happened on my iPhone. Investigate and fix that flow, then update staging.

A screenshot, page name, exact wording and steps to reproduce are often more helpful than a long diagnosis. Say which behaviour should change and what a successful result looks like.

## 2. Batch small changes before deploying

> Make these five copy changes locally. Show me a short summary, then deploy them together to staging.

You can add more requests after staging is updated:

> Keep all the changes already on staging. Also move the Share button above Save progress, then update staging again.

The workflow already preserves pending changes; you do not need to recite the whole backlog. You can request a summary any time:

> What is on staging that is not live yet? Give me the complete list of pending changes and flag anything that needs more testing.

If you want discussion before changes:

> Suggest two ways to improve the result screen. Explain the trade-offs first; do not edit or deploy yet.

## 3. Review, then publish the complete candidate

Open the normal staging address and try the affected features. For adjustments:

> The new button is too tall on mobile. Reduce its height slightly and update staging. Keep the other pending changes.

When satisfied:

> I’ve reviewed staging. Publish everything currently approved there to live, preserve real player data, and verify the public website.

Codex should identify the approved version, promote all its changes together and report what went live. You do not need to specify files, Git commands or hosting settings.

If one pending feature is not ready, do not ask to publish “everything except that” casually. Say:

> The new leaderboard feature is not ready. Help me separate or disable it cleanly so the other staged changes can be released. Show me the revised staging version before publishing.

## 4. Handle urgent live problems explicitly

> Live players cannot sign in. Prioritise a minimal fix, test it safely, publish it once verified, and make sure the fix is also included in staging without losing its pending work.

Only use this route when live needs an urgent fix. Routine improvements can accumulate on staging.

## Keep usage efficient

- Group related wording/layout changes into one request and one staging deployment.
- Keep the same task for follow-up adjustments to the same feature; start a focused new task for unrelated work. The repository and release status preserve the backlog between tasks.
- Ask for a short summary, relevant screenshots and test results. A short final answer alone does not make the underlying work cheap.
- Ask for focused investigation rather than a whole-site audit when the problem is specific.
- Use the broader checks for gameplay, accounts, scoring or shared layout; let routine scripts handle repeatable checks.
- A useful general prompt is: **“Make this change on staging, preserve all pending work, use checks proportional to the change, and give me a short summary and review link.”**

The default is staging. “Publish staging to live” is the clear instruction to release the accumulated approved work.
