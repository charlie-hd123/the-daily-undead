import { browserStorage } from "./browser-storage.js?v=20261031-9";
import {
  accountMemoryStorageKey,
  archivePendingProgress,
  clearPendingProgress,
  createAccountMutationQueue,
  describeAccountSave,
  forgetRememberedAccount,
  readPendingProgress,
  readRememberedAccount,
  pendingMatchesCloud,
  pendingCoveredByCloud,
  recommendedAccountSave,
  rememberAccount,
  writePendingProgress,
} from "./account-session.js?v=20261031-9";
import { isPuzzleSessionComplete } from "./daily-challenge-core.js?v=20261031-9";
import { initialiseAccountSettings } from "./account-settings.js?v=20261031-9";

function hasSupabaseConfiguration(documentObject = document) {
  const read = (name) => documentObject
    .querySelector(`meta[name="${name}"]`)
    ?.content?.trim() || "";
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(read("daily-undead-supabase-url"))
    && read("daily-undead-supabase-publishable-key").startsWith("sb_publishable_");
}

function withTimeout(promise, timeoutMs, message) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => globalThis.clearTimeout(timeout));
}

export async function requestJson(
  authClient,
  apiUrl,
  path,
  options = {},
  { fetchImpl = globalThis.fetch, timeoutMs = 8_000, timeoutMessage = "Account sync took too long. Your cloud save is safe." } = {},
) {
  const token = await authClient.session?.getToken();
  if (!token) throw new Error("Please sign in again.");

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let result;
  try {
    response = await fetchImpl(new URL(path, apiUrl), {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    result = await response.json().catch(() => ({}));
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
  if (!response.ok) {
    const error = new Error(result.error || `Account request failed (${response.status}).`);
    error.status = response.status;
    error.result = result;
    throw error;
  }
  return result;
}

export function confirmAccountResultSubmission(controller) {
  if (!controller?.resultSubmissionRequiresSignIn) return true;
  controller.requestResultSignIn?.();
  return false;
}

export async function replaySavedAccountResult({
  dailyState,
  puzzleDate,
  sendMapResult,
  sendBonusResult,
  sendWordResult,
  sendBloodResult,
}) {
  if (dailyState?.dayStateVersion === 1 && dailyState.dateKey === puzzleDate) {
    const officialType = dailyState.officialType;
    const session = dailyState.sessions?.[officialType];
    if (!dailyState.officialCompleted || !isPuzzleSessionComplete(officialType, session)) return null;
    if (officialType === 'blood') {
      const result = await sendBloodResult?.({ puzzleDate, puzzleId: session.key, attempts: session.attempts, rulesVersion: session.rulesVersion ?? 1 });
      return result?.progress || null;
    }
    if (officialType === "word") {
      const wordResult = await sendWordResult({
        puzzleDate,
        puzzleId: session.key,
        guesses: Array.isArray(session.guesses) ? session.guesses : [],
        misses: Number(session.wrongGuesses || 0),
        success: Boolean(session.success),
      });
      return wordResult?.progress || null;
    }
    dailyState = session;
  }
  if (
    dailyState?.phase !== "result" ||
    typeof dailyState.selectedMapId !== "string" ||
    !Number.isInteger(dailyState.lockedClues)
  ) {
    return null;
  }

  const mapResult = await sendMapResult({
    puzzleDate,
    puzzleId: dailyState.puzzleKey,
    selectedMapId: dailyState.selectedMapId,
    cluesUsed: dailyState.lockedClues,
  });
  let progress = mapResult?.progress || null;

  if (dailyState.bonusComplete || dailyState.bonusFailed) {
    const bonusResult = await sendBonusResult({
      puzzleDate,
      bonusOrder: Array.isArray(dailyState.bonusOrder) ? dailyState.bonusOrder : [],
    });
    progress = bonusResult?.progress || progress;
  }

  return progress;
}

const avatarOptions = [
  ["richtofen", "Edward Richtofen"], ["dempsey", "Tank Dempsey"],
  ["takeo", "Takeo Masaki"], ["nikolai", "Nikolai Belinski"],
  ["samantha", "Samantha Maxis", { type: "round", value: 5 }],
  ["dr-maxis", "Dr. Ludwig Maxis", { type: "round", value: 5 }],
  ["misty", "Misty", { type: "round", value: 15 }],
  ["stuhlinger", "Samuel Stuhlinger", { type: "round", value: 15 }],
  ["marlton", "Marlton Johnson", { type: "round", value: 15 }],
  ["russman", "Russman", { type: "round", value: 15 }],
  ["tedd", "T.E.D.D.", { type: "maps", value: 20 }],
  ["brutus", "Brutus", { type: "maps", value: 50 }],
  ["dr-monty", "Dr. Monty", { type: "maps", value: 100 }],
  ["shadowman", "The Shadowman", { type: "round", value: 30 }],
  ["scarlett", "Scarlett Rhodes", { type: "maps", value: 25 }],
  ["diego", "Diego Necalli", { type: "maps", value: 25 }],
  ["bruno", "Bruno Delacroix", { type: "maps", value: 25 }],
  ["stanton", "Stanton Shaw", { type: "maps", value: 25 }],
  ["weaver", "Grigori Weaver", { type: "round", value: 10 }],
  ["grey", "Dr. Elizabeth Grey", { type: "round", value: 10 }],
  ["carver", "Mac Carver", { type: "round", value: 10 }],
  ["maya", "Maya Aguinaldo", { type: "round", value: 10 }],
  ["warden", "The Warden", { type: "round", value: 30 }],
];
const themeOptions = [
  { id: "default", label: "Default", requiredMaps: 0 },
  { id: "afterlife", label: "Toxic", requiredMaps: 50 },
  { id: "outbreak", label: "Cryo", requiredMaps: 100 },
  { id: "hellfire", label: "Napalm", requiredMaps: 250 },
  { id: "blood-moon", label: "Blood", requiredMaps: 500 },
  { id: "dark-aether", label: "Aether", requiredMaps: 1000 },
];

function avatarUnlockLabel(unlock) {
  if (!unlock) return "Available at signup";
  return unlock.type === "round" ? `Reach Round ${unlock.value}` : `Solve ${unlock.value} maps`;
}

function avatarIsUnlocked(unlock, highestRound, mapsSolved) {
  if (!unlock) return true;
  return unlock.type === "round" ? highestRound >= unlock.value : mapsSolved >= unlock.value;
}

function formatJoinedDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(date);
}

function makeAvatar(documentObject, avatarId, className = "") {
  const avatar = documentObject.createElement("span");
  avatar.className = `zombie-avatar ${className}`.trim();
  avatar.dataset.avatar = avatarId || "unselected";
  avatar.setAttribute("aria-hidden", "true");
  return avatar;
}

export async function initialiseAccount({
  apiUrl,
  puzzleDate,
  getLocalSnapshot,
  applyRemoteAccount,
  applyRemoteProgress = () => {},
  readOnlyProgress = false,
  documentObject = document,
}) {
  const accountButton = documentObject.querySelector("#account-button");
  const accountMenuDialog = documentObject.querySelector("#demo-account-dialog");
  const accountDetailsDialog = documentObject.querySelector("#account-details-dialog");
  const accountSecurityDialog = documentObject.querySelector("#account-security-dialog");
  const accountSignOutDialog = documentObject.querySelector("#account-sign-out-dialog");
  const signOutButton = documentObject.querySelector("[data-confirm-sign-out]");
  const signOutError = documentObject.querySelector("[data-sign-out-error]");
  const accessDialog = documentObject.querySelector("#account-access-dialog");
  const sessionExpiredDialog = documentObject.querySelector("#account-session-expired-dialog");
  const sessionLoginButton = documentObject.querySelector("#account-session-login");
  const conflictDialog = documentObject.querySelector("#account-progress-conflict-dialog");
  const conflictDeviceButton = documentObject.querySelector("#account-conflict-device");
  const conflictCloudButton = documentObject.querySelector("#account-conflict-cloud");
  const onboardingDialog = documentObject.querySelector("#account-onboarding-dialog");
  const onboardingForm = documentObject.querySelector("#account-onboarding-form");
  const onboardingError = documentObject.querySelector("#account-onboarding-error");
  const usernameDialog = documentObject.querySelector("#account-username-dialog");
  const usernameForm = documentObject.querySelector("#account-username-form");
  const usernameFeedback = documentObject.querySelector("#account-username-feedback");
  const profileEditorDialog = documentObject.querySelector("#profile-editor-dialog");
  const profileEditorForm = documentObject.querySelector("#profile-editor-form");
  const profileEditorFeedback = documentObject.querySelector("#profile-editor-feedback");
  const publicProfileDialog = documentObject.querySelector("#player-profile-dialog");
  const publicProfileContent = documentObject.querySelector("[data-public-profile-content]");
  const supabaseConfigured = hasSupabaseConfiguration(documentObject);
  let authClient = null;
  let profile = null;
  let saveTimer = null;
  let saveInFlight = false;
  let saveAgain = false;
  let intentionalSignOut = false;
  let deletingAccount = false;
  let signedOutMemory = null;
  const legacyDirtyStorageKey = "the-daily-undead:account-sync-pending";

  async function openPlayerProfile(username) {
    if (!apiUrl || !publicProfileDialog || !publicProfileContent) return;
    publicProfileContent.textContent = "Loading survivor profile…";
    if (typeof publicProfileDialog.showModal === "function" && !publicProfileDialog.open) {
      publicProfileDialog.showModal();
    } else {
      publicProfileDialog.setAttribute("open", "");
    }
    try {
      const response = await fetch(new URL(`/api/profiles/${encodeURIComponent(username)}`, apiUrl), {
        headers: { Accept: "application/json" },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not load this profile.");
      const viewed = result.profile;
      publicProfileDialog.dataset.theme = viewed.themeId;
      const header = documentObject.createElement("header");
      header.className = "public-profile-header";
      const copy = documentObject.createElement("div");
      const kicker = documentObject.createElement("p");
      const heading = documentObject.createElement("h2");
      const joined = documentObject.createElement("p");
      kicker.className = "kicker";
      kicker.textContent = "Survivor profile";
      heading.textContent = viewed.username;
      joined.className = "public-profile-joined";
      joined.textContent = `Joined ${formatJoinedDate(viewed.createdAt)}`;
      copy.append(kicker, heading, joined);
      header.append(makeAvatar(documentObject, viewed.avatarId), copy);

      const makeProfileStat = (label, value) => {
        const box = documentObject.createElement("div");
        box.className = "public-profile-stat";
        const dt = documentObject.createElement("dt");
        const dd = documentObject.createElement("dd");
        dt.textContent = label;
        dd.textContent = new Intl.NumberFormat("en-GB").format(value);
        box.append(dt, dd);
        return box;
      };
      const stats = documentObject.createElement("dl");
      stats.className = "public-profile-overview";
      stats.append(
        makeProfileStat("Score", result.stats.score),
        makeProfileStat("Puzzle Solves", result.stats.solves),
        makeProfileStat("Current Round", Math.max(1, result.stats.currentRound)),
        makeProfileStat("Highest Round", result.stats.bestRound),
      );
      const favourites = documentObject.createElement("dl");
      favourites.className = "public-profile-favourites";
      [["Favourite game", viewed.favouriteGame], ["Favourite map", viewed.favouriteMap]].forEach(([label, value]) => {
        if (!value) return;
        const box = documentObject.createElement("div");
        box.className = "public-profile-favourite";
        const dt = documentObject.createElement("dt");
        const dd = documentObject.createElement("dd");
        dt.textContent = label;
        dd.textContent = value;
        box.append(dt, dd);
        favourites.append(box);
      });
      const content = [header];
      if (viewed.bio) {
        const bio = documentObject.createElement("p");
        bio.className = "public-profile-bio";
        bio.textContent = viewed.bio;
        content.push(bio);
      }
      content.push(favourites, stats);
      if (profile && viewed.username === profile.username) {
        const editLink = documentObject.createElement("button");
        editLink.className = "public-profile-edit-link";
        editLink.type = "button";
        editLink.textContent = "Edit your profile →";
        editLink.addEventListener("click", () => {
          closeDialog(publicProfileDialog);
          openProfileEditor();
        });
        content.push(editLink);
      }
      publicProfileContent.replaceChildren(...content);
    } catch (error) {
      publicProfileContent.textContent = error.message;
    }
  }

  if (!accountButton || !supabaseConfigured || !apiUrl) {
    if (accountButton) accountButton.hidden = true;
    return createUnavailableController({ openPlayerProfile });
  }

  accountButton.hidden = false;
  accountButton.disabled = true;
  accountButton.textContent = "Loading...";

  try {
    authClient = await withTimeout(
      import("./supabase-auth.js?v=20261031-9").then(({ loadSupabaseAuth }) => (
        loadSupabaseAuth(documentObject)
      )),
      5_000,
      "Account sign-in took too long to load.",
    );
  } catch {
    accountButton.disabled = false;
    accountButton.textContent = "Account unavailable";
    return createUnavailableController({ openPlayerProfile });
  }

  const openDialog = (dialog) => {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  };
  const closeDialog = (dialog) => {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  };

  const rememberedAccount = () => readRememberedAccount(browserStorage);
  const persistPendingProgress = (userId, revision) => !readOnlyProgress && writePendingProgress(
    browserStorage,
    {
      userId,
      revision,
      puzzleDate,
      snapshot: getLocalSnapshot(),
    },
  );
  const beginSignIn = () => {
    closeDialog(sessionExpiredDialog);
    authClient.openSignIn({ routing: "hash" });
  };
  const showExpiredSession = () => {
    accountButton.classList.remove("is-signed-in", "has-username");
    accountButton.classList.add("has-expired-session");
    accountButton.disabled = false;
    accountButton.textContent = "Session expired";
    openDialog(sessionExpiredDialog);
  };
  const beforeSignOut = () => {
    intentionalSignOut = true;
    signedOutMemory = rememberedAccount();
    forgetRememberedAccount(browserStorage);
  };
  const afterSignOutFailure = () => {
    intentionalSignOut = false;
    if (signedOutMemory) rememberAccount(browserStorage, signedOutMemory);
    signedOutMemory = null;
  };
  const openSignOutDialog = () => {
    if (signOutError) signOutError.textContent = "";
    if (signOutButton) {
      signOutButton.disabled = false;
      signOutButton.textContent = "Sign out";
    }
    openDialog(accountSignOutDialog);
  };
  const waitForConflictChoice = (pending, cloud) => new Promise((resolve) => {
    const recommended = recommendedAccountSave(pending, cloud);
    for (const [choice, button, label] of [
      ['device', conflictDeviceButton, 'Use this device'],
      ['cloud', conflictCloudButton, 'Use cloud save'],
    ]) {
      if (!button) continue;
      button.classList.toggle('primary', recommended === choice);
      button.textContent = recommended === choice ? `${label} (recommended)` : label;
    }
    const deviceSummary = documentObject.querySelector('[data-conflict-device-summary]');
    const cloudSummary = documentObject.querySelector('[data-conflict-cloud-summary]');
    const accountSummary = documentObject.querySelector('[data-conflict-account-summary]');
    const progress = cloud?.progress || {};
    if (accountSummary) accountSummary.textContent = `Round ${Math.max(1, Number(progress.currentRound || 1))} · Highest Round ${Number(progress.bestRound || 1)} · Score ${Number(progress.score || 0).toLocaleString('en-GB')} · ${Number(progress.solves || 0)} solves`;
    if (deviceSummary) deviceSummary.textContent = describeAccountSave(pending.puzzleDate, pending.snapshot, cloud);
    if (cloudSummary) cloudSummary.textContent = describeAccountSave(pending.puzzleDate, cloud, pending.snapshot);
    const feedback = documentObject.querySelector('[data-conflict-feedback]');
    if (feedback) feedback.textContent = '';
    const choose = (choice) => {
      if (choice === 'cloud' && !archivePendingProgress(browserStorage, pending)) {
        if (feedback) feedback.textContent = 'Could not keep a recovery copy on this device. Your pending save is still safe. Please free some browser storage and try again.';
        return;
      }
      conflictDeviceButton?.removeEventListener('click', chooseDevice);
      conflictCloudButton?.removeEventListener('click', chooseCloud);
      closeDialog(conflictDialog);
      resolve(choice);
    };
    const chooseDevice = () => choose('device');
    const chooseCloud = () => choose('cloud');
    conflictDeviceButton?.addEventListener('click', chooseDevice);
    conflictCloudButton?.addEventListener('click', chooseCloud);
    conflictDialog?.addEventListener('cancel', (event) => event.preventDefault(), { once: true });
    openDialog(conflictDialog);
    const focusTarget = recommended === 'device' ? conflictDeviceButton
      : recommended === 'cloud' ? conflictCloudButton : conflictDialog?.querySelector('h2');
    focusTarget?.focus({ preventScroll: true });
  });

  sessionLoginButton?.addEventListener("click", beginSignIn);
  documentObject.querySelector("[data-close-session-expired]")?.addEventListener(
    "click",
    () => closeDialog(sessionExpiredDialog),
  );

  documentObject.querySelectorAll("[data-close-account-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.closest("dialog")));
  });
  documentObject.querySelector("[data-cancel-sign-out]")?.addEventListener(
    "click",
    () => closeDialog(accountSignOutDialog),
  );
  signOutButton?.addEventListener("click", async () => {
    signOutButton.disabled = true;
    signOutButton.textContent = "Signing out…";
    if (signOutError) signOutError.textContent = "";
    try {
      beforeSignOut();
      await authClient.signOut({
        redirectUrl: `${window.location.origin}${window.location.pathname}`,
      });
    } catch {
      afterSignOutFailure();
      signOutButton.disabled = false;
      signOutButton.textContent = "Sign out";
      if (signOutError) signOutError.textContent = "Could not sign out. Please try again.";
    }
  });
  documentObject.querySelector("#account-create")?.addEventListener("click", () => {
    closeDialog(accessDialog);
    authClient.openSignUp({ routing: "hash" });
  });
  documentObject.querySelector("#account-sign-in")?.addEventListener("click", () => {
    closeDialog(accessDialog);
    authClient.openSignIn({ routing: "hash" });
  });

  if (!authClient.isSignedIn) {
    const remembered = rememberedAccount();
    if (remembered) {
      showExpiredSession();
      accountButton.addEventListener("click", () => openDialog(sessionExpiredDialog));
    } else {
      accountButton.disabled = false;
      accountButton.textContent = "Log in";
      accountButton.addEventListener("click", () => openDialog(accessDialog));
    }
    let wasSignedOut = true;
    authClient.addListener(({ user }) => {
      if (wasSignedOut && user) {
        wasSignedOut = false;
        window.location.reload();
      }
    });
    globalThis.addEventListener?.("storage", (event) => {
      if (event.key !== accountMemoryStorageKey || readRememberedAccount(browserStorage)) return;
      closeDialog(sessionExpiredDialog);
      accountButton.classList.remove("has-expired-session");
      accountButton.textContent = "Log in";
    });
    return createUnavailableController({
      authClient,
      signedIn: false,
      openPlayerProfile,
      openAccountAccess: () => openDialog(accessDialog),
      scheduleSave: remembered
        ? () => persistPendingProgress(remembered.userId, remembered.revision)
        : () => {},
      resultSubmissionRequiresSignIn: Boolean(remembered),
      requestResultSignIn: showExpiredSession,
    });
  }

  accountButton.classList.add("is-signed-in");

  let account;
  try {
    const url = new URL("/api/account", apiUrl);
    url.searchParams.set("date", readOnlyProgress ? new Date().toISOString().slice(0, 10) : puzzleDate);
    account = await requestJson(authClient, apiUrl, `${url.pathname}${url.search}`);
  } catch (error) {
    const remembered = rememberedAccount();
    accountButton.disabled = false;
    accountButton.textContent = "Account sync offline";
    accountButton.addEventListener("click", openSignOutDialog);
    return createUnavailableController({
      authClient,
      signedIn: true,
      openPlayerProfile,
      scheduleSave: remembered
        ? () => persistPendingProgress(remembered.userId, remembered.revision)
        : () => {},
    });
  }

  if (account.needsOnboarding) {
    accountButton.disabled = false;
    accountButton.textContent = "Finish setup";
    accountButton.addEventListener("click", () => openDialog(onboardingDialog));
    openDialog(onboardingDialog);

    onboardingForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = onboardingForm.querySelector('button[type="submit"]');
      const username = onboardingForm.elements.username.value.trim();
      const importLocalProgress = onboardingForm.elements.importLocalProgress.checked;
      submitButton.disabled = true;
      submitButton.textContent = "Finishing setup…";
      submitButton.setAttribute("aria-busy", "true");
      onboardingError.textContent = "";

      try {
        const snapshot = getLocalSnapshot();
        await requestJson(authClient, apiUrl, "/api/account/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            importLocalProgress,
            puzzleDate,
            progress: snapshot.progress,
            dailyState: snapshot.dailyState,
          }),
        });
        window.location.reload();
      } catch (error) {
        onboardingError.textContent = error.message;
        submitButton.disabled = false;
        submitButton.textContent = "Finish setup";
        submitButton.removeAttribute("aria-busy");
      }
    });

    return createUnavailableController({ authClient, signedIn: true, openPlayerProfile });
  }

  profile = account.profile;
  const userId = account.accountId || authClient.user.id;
  const legacyUserId = account.legacyUserId;
  let pendingProgress = readOnlyProgress ? null : readPendingProgress(browserStorage, userId);
  if (!readOnlyProgress && !pendingProgress && legacyUserId && legacyUserId !== userId) {
    const legacyPending = readPendingProgress(browserStorage, legacyUserId);
    if (legacyPending) {
      writePendingProgress(browserStorage, { ...legacyPending, userId });
      clearPendingProgress(browserStorage, legacyUserId);
      pendingProgress = readPendingProgress(browserStorage, userId);
    }
    const remembered = rememberedAccount();
    if (remembered?.userId === legacyUserId) {
      rememberAccount(browserStorage, { ...remembered, userId });
    }
  }
  if (!readOnlyProgress && !pendingProgress) {
    try {
      if (browserStorage.getItem(legacyDirtyStorageKey) === userId) {
        writePendingProgress(browserStorage, {
          userId,
          revision: null,
          puzzleDate,
          snapshot: getLocalSnapshot(),
        });
        browserStorage.removeItem(legacyDirtyStorageKey);
        pendingProgress = readPendingProgress(browserStorage, userId);
      }
    } catch {
      // Legacy pending progress remains local if storage is unavailable.
    }
  }

  if (pendingProgress) {
    let pendingCloud = account;
    if (pendingProgress.puzzleDate !== puzzleDate) {
      // Compare yesterday's queued save with yesterday's cloud puzzle, rather
      // than comparing it with today's fresh board and inventing a conflict.
      try {
        pendingCloud = await requestJson(authClient, apiUrl,
          `/api/account?date=${encodeURIComponent(puzzleDate)}&savedDate=${encodeURIComponent(pendingProgress.puzzleDate)}`);
        account.progress = pendingCloud.progress;
        pendingCloud.dailyState = pendingCloud.pendingDailyState;
      } catch {
        accountButton.disabled = false;
        accountButton.textContent = 'Progress waiting to sync';
        return createUnavailableController({
          authClient, signedIn: true, openPlayerProfile,
          scheduleSave: () => persistPendingProgress(userId, pendingProgress.revision),
        });
      }
    }
    const cloudRevision = Number(account.progress?.revision || 0);
    const revisionsMatch =
      pendingProgress.revision != null && pendingProgress.revision === cloudRevision;
    let useDeviceProgress = revisionsMatch;
    const alreadySynced = pendingMatchesCloud(pendingProgress, pendingCloud);
    const cloudCoversPending = alreadySynced || !revisionsMatch && pendingCoveredByCloud(pendingProgress, pendingCloud);
    if (!revisionsMatch && !cloudCoversPending) {
      useDeviceProgress = await waitForConflictChoice(pendingProgress, pendingCloud) === "device";
    }

    if (useDeviceProgress && !cloudCoversPending) {
      try {
        const saveResult = await requestJson(authClient, apiUrl, "/api/account/save", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            puzzleDate: pendingProgress.puzzleDate,
            progress: pendingProgress.snapshot.progress,
            dailyState: pendingProgress.snapshot.dailyState,
            baseRevision: cloudRevision,
          }),
        });
        account.progress = saveResult.progress;
        if (pendingProgress.puzzleDate === puzzleDate) {
          account.dailyState = pendingProgress.snapshot.dailyState;
        }
        clearPendingProgress(browserStorage, userId);
        pendingProgress = null;
      } catch {
        accountButton.disabled = false;
        accountButton.textContent = "Progress waiting to sync";
        rememberAccount(browserStorage, { userId, revision: cloudRevision });
        return createUnavailableController({
          authClient,
          signedIn: true,
          openPlayerProfile,
          scheduleSave: () => persistPendingProgress(userId, cloudRevision),
        });
      }
    } else {
      if (!alreadySynced) archivePendingProgress(browserStorage, pendingProgress);
      clearPendingProgress(browserStorage, userId);
      pendingProgress = null;
    }
  }

  try {
    const replayedProgress = !readOnlyProgress && await replaySavedAccountResult({
      dailyState: account.dailyState,
      puzzleDate,
      sendMapResult: (payload) => requestJson(authClient, apiUrl, "/api/account/results/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      sendBonusResult: (payload) => requestJson(authClient, apiUrl, "/api/account/results/bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      sendWordResult: (payload) => requestJson(authClient, apiUrl, "/api/account/results/word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      sendBloodResult: (payload) => requestJson(authClient, apiUrl, '/api/account/results/blood', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }),
    });
    if (replayedProgress) account.progress = replayedProgress;
  } catch {
    // The saved daily state remains available for another replay after a refresh.
  }

  applyRemoteAccount(account);
  rememberAccount(browserStorage, {
    userId,
    revision: account.progress?.revision,
  });
  accountButton.disabled = false;
  accountButton.textContent = profile.username;
  accountButton.classList.add("has-username");
  const mapsSolved = Number(account.progress?.solves || 0);
  const highestRound = Number(account.progress?.bestRound || 0);

  if (profileEditorForm) {
    const avatarPicker = profileEditorForm.querySelector("[data-avatar-picker]");
    const themePicker = profileEditorForm.querySelector("[data-theme-picker]");
    avatarPicker?.replaceChildren(...avatarOptions.map(([id, label, unlock]) => {
      const choice = documentObject.createElement("label");
      choice.className = "avatar-choice";
      const locked = !avatarIsUnlocked(unlock, highestRound, mapsSolved);
      const requirement = avatarUnlockLabel(unlock);
      choice.classList.toggle("is-locked", locked);
      choice.dataset.unlockLabel = locked ? requirement : "Unlocked";
      choice.title = locked ? `${label} — ${requirement}` : `${label} — Unlocked`;
      const input = documentObject.createElement("input");
      input.type = "radio";
      input.name = "avatarId";
      input.value = id;
      input.dataset.unlockType = unlock?.type || "signup";
      input.dataset.unlockValue = unlock?.value || 0;
      input.setAttribute("aria-label", locked ? `${label}, locked, ${requirement}, available to preview` : `${label}, unlocked`);
      choice.append(input, makeAvatar(documentObject, id));
      return choice;
    }));
    themePicker?.replaceChildren(...themeOptions.map(({ id, label, requiredMaps }) => {
      const choice = documentObject.createElement("label");
      choice.className = "theme-choice";
      choice.dataset.theme = id;
      const locked = mapsSolved < requiredMaps;
      choice.classList.toggle("is-locked", locked);
      const input = documentObject.createElement("input");
      input.type = "radio";
      input.name = "themeId";
      input.value = id;
      input.dataset.requiredMaps = requiredMaps;
      input.setAttribute("aria-label", locked ? `${label}, unlocks at ${requiredMaps} solves, available to preview` : label);
      const text = documentObject.createElement("span");
      const name = documentObject.createElement("strong");
      const unlock = documentObject.createElement("small");
      unlock.className = "theme-unlock";
      name.textContent = label;
      unlock.textContent = locked ? `🔒 ${requiredMaps} solves` : "";
      unlock.hidden = !locked;
      text.append(name, unlock);
      choice.append(input, text);
      return choice;
    }));
  }

  const updateLockedPreviewState = () => {
    if (!profileEditorForm || !profileEditorFeedback) return;
    const requirements = [];
    const selectedAvatarId = profileEditorForm.querySelector('[name="avatarId"]:checked')?.value;
    const selectedAvatar = avatarOptions.find(([id]) => id === selectedAvatarId);
    if (selectedAvatar && !avatarIsUnlocked(selectedAvatar[2], highestRound, mapsSolved)) {
      requirements.push(`${selectedAvatar[1]}: ${avatarUnlockLabel(selectedAvatar[2])}`);
    }
    const selectedThemeId = profileEditorForm.querySelector('[name="themeId"]:checked')?.value;
    const selectedTheme = themeOptions.find(({ id }) => id === selectedThemeId);
    if (selectedTheme && mapsSolved < selectedTheme.requiredMaps) {
      requirements.push(`${selectedTheme.label}: ${selectedTheme.requiredMaps} solves`);
    }
    const saveButton = profileEditorForm.querySelector('button[type="submit"]');
    if (requirements.length) {
      profileEditorFeedback.classList.remove("account-error", "is-success");
      profileEditorFeedback.classList.add("is-preview-warning");
      profileEditorFeedback.textContent = `Previewing locked content — ${requirements.join(" · ")}. Unlock it before saving.`;
      if (saveButton) saveButton.disabled = true;
      return;
    }
    profileEditorFeedback.classList.remove("account-error", "is-success", "is-preview-warning");
    profileEditorFeedback.textContent = "";
    if (saveButton) saveButton.disabled = false;
  };

  const openProfileEditor = () => {
    if (!profileEditorForm || !profileEditorDialog) return;
    ["favouriteGame", "favouriteMap", "bio"].forEach((field) => {
      profileEditorForm.elements[field].value = profile[field] || "";
    });
    const avatarInput = profileEditorForm.querySelector(`[name="avatarId"][value="${profile.avatarId || "unselected"}"]`);
    const themeInput = profileEditorForm.querySelector(`[name="themeId"][value="${profile.themeId || "default"}"]`);
    if (avatarInput) avatarInput.checked = true;
    if (themeInput) themeInput.checked = true;
    profileEditorDialog.dataset.previewTheme = profile.themeId || "default";
    profileEditorFeedback.textContent = "";
    updateLockedPreviewState();
    globalThis.setTimeout(() => openDialog(profileEditorDialog), 250);
  };

  profileEditorForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = profileEditorForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    profileEditorFeedback.textContent = "";
    try {
      const payload = Object.fromEntries(new FormData(profileEditorForm));
      const selectedAvatar = avatarOptions.find(([id]) => id === payload.avatarId);
      if (selectedAvatar && !avatarIsUnlocked(selectedAvatar[2], highestRound, mapsSolved)) {
        throw new Error(`${selectedAvatar[1]} unlocks when you ${avatarUnlockLabel(selectedAvatar[2]).toLowerCase()}. Preview only for now.`);
      }
      const selectedTheme = themeOptions.find((theme) => theme.id === payload.themeId);
      if (selectedTheme && mapsSolved < selectedTheme.requiredMaps) {
        throw new Error(`${selectedTheme.label} unlocks at ${selectedTheme.requiredMaps} solves. Preview only for now.`);
      }
      const result = await requestJson(authClient, apiUrl, "/api/account/profile", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      Object.assign(profile, result.profile);
      profileEditorFeedback.classList.remove("account-error", "is-preview-warning");
      profileEditorFeedback.classList.add("is-success");
      profileEditorFeedback.textContent = "Profile saved.";
      closeDialog(profileEditorDialog);
    } catch (error) {
      profileEditorFeedback.classList.remove("is-success", "is-preview-warning");
      profileEditorFeedback.classList.add("account-error");
      profileEditorFeedback.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  profileEditorForm?.addEventListener("change", (event) => {
    if (event.target.name === "avatarId") {
      updateLockedPreviewState();
      return;
    }
    if (event.target.name === "themeId") {
      profileEditorDialog.dataset.previewTheme = event.target.value;
      updateLockedPreviewState();
    }
  });

  const openUsernameEditor = () => {
    if (!usernameDialog || !usernameForm || !usernameFeedback) return;
    usernameForm.elements.publicName.value = profile.username;
    usernameFeedback.textContent = "";
    usernameFeedback.classList.remove("account-error", "is-success");
    globalThis.setTimeout(() => openDialog(usernameDialog), 250);
  };

  usernameForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = usernameForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    usernameFeedback.textContent = "";
    usernameFeedback.classList.remove("account-error", "is-success");

    try {
      const result = await requestJson(authClient, apiUrl, "/api/account/username", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameForm.elements.publicName.value.trim() }),
      });
      profile.username = result.username;
      accountButton.textContent = result.username;
      usernameForm.elements.publicName.value = result.username;
      usernameFeedback.classList.add("is-success");
      usernameFeedback.textContent = "Username updated.";
    } catch (error) {
      usernameFeedback.classList.add("account-error");
      usernameFeedback.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  const primaryEmail = () => authClient.user?.primaryEmailAddress?.emailAddress
    || authClient.user?.emailAddresses?.[0]?.emailAddress
    || "Not available";
  initialiseAccountSettings({
    documentObject,
    authClient,
    userIds: [userId, legacyUserId].filter(Boolean),
    requestDelete: () => requestJson(authClient, apiUrl, "/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    }, { timeoutMs: 15_000, timeoutMessage: "Could not confirm deletion. Please retry to check and finish removing your account." }),
    beforeDelete: () => {
      deletingAccount = true;
      intentionalSignOut = true;
      globalThis.clearTimeout(saveTimer);
      saveAgain = false;
    },
    afterDeleteFailure: () => { deletingAccount = false; intentionalSignOut = false; },
  });
  accountMenuDialog?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-account-action]")?.dataset.accountAction;
    if (!action) return;
    closeDialog(accountMenuDialog);
    if (action === "game-profile") {
      openProfileEditor();
    } else if (action === "username") {
      openUsernameEditor();
    } else if (action === "profile") {
      const username = accountDetailsDialog?.querySelector("[data-account-profile-username]");
      const email = accountDetailsDialog?.querySelector("[data-account-profile-email]");
      const joined = accountDetailsDialog?.querySelector("[data-account-profile-joined]");
      if (username) username.textContent = profile.username;
      if (email) email.textContent = primaryEmail();
      if (joined) joined.textContent = formatJoinedDate(profile.createdAt);
      openDialog(accountDetailsDialog);
    } else if (action === "security") {
      const email = accountSecurityDialog?.querySelector("[data-account-security-email]");
      if (email) email.textContent = primaryEmail();
      openDialog(accountSecurityDialog);
    } else if (action === "sign-out") {
      openSignOutDialog();
    }
  });

  accountButton.addEventListener("click", () => {
    openDialog(accountButton.classList.contains("has-expired-session")
      ? sessionExpiredDialog
      : accountMenuDialog);
  });

  let currentRevision = Number(account.progress?.revision || 1);
  const queueMutation = createAccountMutationQueue();

  async function saveNow() {
    if (readOnlyProgress || deletingAccount) return;
    if (saveInFlight) {
      saveAgain = true;
      return;
    }
    saveInFlight = true;
    return queueMutation(async () => {
      try {
        if (deletingAccount) return;
        const snapshot = structuredClone(getLocalSnapshot());
        const saveResult = await requestJson(authClient, apiUrl, "/api/account/save", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            puzzleDate,
            progress: snapshot.progress,
            dailyState: snapshot.dailyState,
            baseRevision: currentRevision,
          }),
        });
        currentRevision = Number(saveResult.progress?.revision || currentRevision + 1);
        if (deletingAccount) return;
        rememberAccount(browserStorage, { userId, revision: currentRevision });
        if (JSON.stringify(getLocalSnapshot()) === JSON.stringify(snapshot)) {
          applyRemoteProgress(saveResult.progress);
          clearPendingProgress(browserStorage, userId);
        } else {
          // New input arrived during the request. Acknowledge only what was sent.
          persistPendingProgress(userId, currentRevision);
          saveAgain = true;
        }
        accountButton.textContent = profile.username;
      } catch {
        // The pending snapshot remains durable for a later retry.
        accountButton.textContent = "Progress waiting to sync";
      } finally {
        saveInFlight = false;
        if (saveAgain) {
          saveAgain = false;
          scheduleSave();
        }
      }
    });
  }

  function scheduleSave() {
    if (readOnlyProgress || deletingAccount) return;
    persistPendingProgress(userId, currentRevision);
    globalThis.clearTimeout(saveTimer);
    saveTimer = globalThis.setTimeout(saveNow, 350);
  }

  async function recordResult(path, payload) {
    if (readOnlyProgress || deletingAccount) return null;
    return queueMutation(async () => {
      if (deletingAccount) return null;
      try {
        const result = await requestJson(authClient, apiUrl, path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        currentRevision = Math.max(currentRevision, Number(result.progress?.revision || 0));
        if (deletingAccount) return null;
        rememberAccount(browserStorage, { userId, revision: currentRevision });
        applyRemoteProgress(result.progress);
        scheduleSave();
        return result;
      } catch {
        persistPendingProgress(userId, currentRevision);
        accountButton.textContent = 'Progress waiting to sync';
        return null;
      }
    });
  }

  const recordMapResult = (payload) => recordResult('/api/account/results/map', payload);
  const recordBonusResult = (payload) => recordResult('/api/account/results/bonus', payload);
  const recordWordResult = (payload) => recordResult('/api/account/results/word', payload);
  const recordBloodResult = (payload) => recordResult('/api/account/results/blood', payload);

  const controller = {
    available: true,
    signedIn: true,
    canSync: !readOnlyProgress,
    resultSubmissionRequiresSignIn: false,
    openAccountAccess: () => openDialog(accessDialog),
    requestResultSignIn: showExpiredSession,
    profile,
    scheduleSave,
    recordMapResult,
    recordBonusResult,
    recordWordResult,
    recordBloodResult,
    openPlayerProfile,
  };

  let wasSignedIn = true;
  authClient.addListener(({ user }) => {
    if (!wasSignedIn || user) return;
    wasSignedIn = false;
    controller.canSync = false;
    globalThis.clearTimeout(saveTimer);
    saveAgain = false;
    if (!readRememberedAccount(browserStorage)) deletingAccount = true;
    if (!intentionalSignOut && readRememberedAccount(browserStorage)) {
      controller.resultSubmissionRequiresSignIn = true;
      persistPendingProgress(userId, currentRevision);
      showExpiredSession();
    }
  });

  return controller;
}

function createUnavailableController({
  authClient = null,
  signedIn = false,
  openPlayerProfile = async () => {},
  scheduleSave = () => {},
  resultSubmissionRequiresSignIn = false,
  requestResultSignIn = () => {},
  openAccountAccess = () => {},
} = {}) {
  return {
    available: Boolean(authClient),
    signedIn,
    canSync: false,
    resultSubmissionRequiresSignIn,
    openAccountAccess,
    requestResultSignIn,
    profile: null,
    scheduleSave,
    async recordMapResult() { return null; },
    async recordBonusResult() { return null; },
    async recordWordResult() { return null; },
    async recordBloodResult() { return null; },
    openPlayerProfile,
  };
}
