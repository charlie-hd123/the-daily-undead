import {
  accountMemoryStorageKey,
  clearPendingProgress,
  forgetRememberedAccount,
  readPendingProgress,
  readRememberedAccount,
  rememberAccount,
  writePendingProgress,
} from "./account-session.js?v=20261001-8";

function getClerkPublishableKey(documentObject = document) {
  return documentObject
    .querySelector('meta[name="daily-undead-clerk-publishable-key"]')
    ?.content?.trim() || null;
}

function getClerkDomain(publishableKey) {
  try {
    const encodedDomain = publishableKey.split("_")[2];
    return atob(encodedDomain).slice(0, -1);
  } catch {
    return null;
  }
}

function withTimeout(promise, timeoutMs, message) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => globalThis.clearTimeout(timeout));
}

function loadScript({ src, publishableKey, timeoutMs = 8_000 }) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = globalThis.setTimeout(() => {
      script.remove();
      reject(new Error("Account sign-in took too long to load."));
    }, timeoutMs);
    const finish = (callback) => (event) => {
      globalThis.clearTimeout(timeout);
      callback(event);
    };
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    if (publishableKey) script.dataset.clerkPublishableKey = publishableKey;
    script.addEventListener("load", finish(resolve), { once: true });
    script.addEventListener(
      "error",
      finish(() => reject(new Error("Account sign-in could not load."))),
      { once: true },
    );
    document.head.append(script);
  });
}

function createClerkAppearance() {
  const bodyFont =
    '"Barlow", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const displayFont = '"Barlow Condensed", "Arial Narrow", Impact, sans-serif';
  const border = "rgb(160 201 255 / 34%)";
  const surface = "linear-gradient(145deg, rgb(21 27 43 / 98%), rgb(8 11 20 / 99%) 72%)";

  return {
    variables: {
      colorPrimary: "#67e8ff",
      colorPrimaryForeground: "#061017",
      colorDanger: "#ff6577",
      colorSuccess: "#6ce7a1",
      colorWarning: "#f7c85c",
      colorNeutral: "#9ca9c0",
      colorForeground: "#f6f7fb",
      colorMutedForeground: "#a8b2c7",
      colorMuted: "#1b2439",
      colorBackground: "#0d111d",
      colorInputForeground: "#f6f7fb",
      colorInput: "#05080f",
      colorShimmer: "#1b2439",
      colorRing: "#67e8ff",
      colorShadow: "#000000",
      colorBorder: border,
      colorModalBackdrop: "rgb(2 4 9 / 84%)",
      fontFamily: bodyFont,
      fontFamilyButtons: displayFont,
      fontSize: "0.875rem",
      fontWeight: {
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 800,
      },
      borderRadius: "0.7rem",
      spacing: "1rem",
    },
    elements: {
      modalBackdrop: {
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      },
      modalContent: {
        border: `1px solid ${border}`,
        borderRadius: "1rem",
        background: surface,
        boxShadow: "0 1.4rem 4rem rgb(0 0 0 / 52%), 0 0 3rem rgb(103 232 255 / 8%)",
        overflow: "hidden",
      },
      modalCloseButton: {
        width: "2.25rem",
        height: "2.25rem",
        border: `1px solid ${border}`,
        borderRadius: "999px",
        backgroundColor: "rgb(255 255 255 / 5%)",
        color: "#c7cfdd",
        '&:hover, &:focus-visible': {
          borderColor: "rgb(103 232 255 / 72%)",
          backgroundColor: "rgb(103 232 255 / 10%)",
          color: "#ffffff",
        },
      },
      cardBox: {
        borderRadius: "1rem",
        boxShadow: "0 1.4rem 4rem rgb(0 0 0 / 46%), 0 0 3rem rgb(103 232 255 / 8%)",
      },
      card: {
        border: `1px solid ${border}`,
        background: surface,
      },
      headerTitle: {
        fontFamily: displayFont,
        fontWeight: 900,
        letterSpacing: "0.025em",
        textTransform: "uppercase",
      },
      formButtonPrimary: {
        minHeight: "3rem",
        border: "0",
        borderRadius: "0.7rem",
        background: "linear-gradient(110deg, #f7c85c 0%, #ffad54 48%, #ff8a48 100%)",
        color: "#171006",
        boxShadow:
          "0 0.8rem 2.2rem rgb(255 138 72 / 16%), inset 0 1px 0 rgb(255 255 255 / 36%) !important",
        fontFamily: displayFont,
        fontSize: "0.9rem",
        fontWeight: 800,
        letterSpacing: "0.045em",
        textTransform: "uppercase",
        '&:hover, &:active': {
          background: "linear-gradient(110deg, #ffe08a 0%, #ffc16b 48%, #ff9c63 100%)",
          color: "#171006",
          boxShadow:
            "0 0.9rem 2.5rem rgb(255 138 72 / 25%), inset 0 1px 0 rgb(255 255 255 / 42%) !important",
        },
        '&:focus-visible': {
          outline: "3px solid #ffffff",
          outlineOffset: "3px",
          boxShadow:
            "0 0.8rem 2.2rem rgb(255 138 72 / 16%), inset 0 1px 0 rgb(255 255 255 / 36%) !important",
        },
      },
      formFieldInput: {
        minHeight: "3rem",
        border: `1px solid ${border}`,
        borderRadius: "0.65rem",
        backgroundColor: "rgb(5 8 15 / 92%)",
        boxShadow: "none",
        '&:focus': {
          borderColor: "#67e8ff",
          boxShadow: "0 0 0 3px rgb(103 232 255 / 16%)",
        },
      },
      formFieldLabel: {
        color: "#f6f7fb",
        fontWeight: 700,
      },
      footer: {
        backgroundColor: "transparent",
      },
      footerActionLink: {
        color: "#67e8ff",
        fontWeight: 700,
      },
      badge: {
        border: "1px solid rgb(103 232 255 / 24%)",
        backgroundColor: "rgb(103 232 255 / 8%)",
        color: "#bdf0fa",
      },
    },
    userProfile: {
      elements: {
        cardBox: {
          width: "min(94vw, 78rem)",
          maxWidth: "78rem",
        },
        card: {
          background: surface,
        },
        navbar: {
          borderRight: `1px solid ${border}`,
          background:
            "radial-gradient(circle at 15% 10%, rgb(103 232 255 / 8%), transparent 17rem), linear-gradient(165deg, rgb(22 28 43 / 99%), rgb(10 13 23 / 99%))",
        },
        navbarButton: {
          minHeight: "3.4rem",
          border: "1px solid transparent",
          borderRadius: "0.7rem",
          color: "#c7cfdd",
          fontWeight: 700,
          '&:hover, &:focus-visible': {
            borderColor: "rgb(103 232 255 / 26%)",
            backgroundColor: "rgb(103 232 255 / 8%)",
            color: "#ffffff",
          },
        },
        navbarButton__active: {
          borderColor: "rgb(103 232 255 / 42%)",
          backgroundColor: "rgb(103 232 255 / 12%)",
          color: "#ffffff",
          boxShadow: "inset 3px 0 0 #67e8ff, 0 0.7rem 1.8rem rgb(0 0 0 / 15%)",
        },
        navbarButtonIcon: {
          color: "#a8b2c7",
        },
        navbarButtonIcon__active: {
          color: "#67e8ff",
        },
        navbarButtonText: {
          fontFamily: bodyFont,
          fontWeight: 700,
        },
        pageScrollBox: {
          background:
            "radial-gradient(circle at 90% 4%, rgb(158 119 255 / 8%), transparent 24rem), rgb(13 17 29 / 96%)",
        },
        profilePage: {
          color: "#f6f7fb",
        },
        profileSection: {
          borderColor: "rgb(160 201 255 / 20%)",
        },
        profileSectionTitleText: {
          fontFamily: displayFont,
          fontSize: "0.95rem",
          fontWeight: 800,
          letterSpacing: "0.035em",
          textTransform: "uppercase",
        },
        profileSectionPrimaryButton: {
          minHeight: "2.65rem",
          padding: "0.55rem 0.85rem",
          border: "1px solid rgb(103 232 255 / 34%)",
          borderRadius: "0.6rem",
          backgroundColor: "rgb(103 232 255 / 8%)",
          color: "#bdf0fa",
          fontFamily: displayFont,
          fontSize: "0.875rem",
          fontWeight: 800,
          letterSpacing: "0.035em",
          textTransform: "uppercase",
          '&:hover, &:focus-visible': {
            borderColor: "rgb(103 232 255 / 72%)",
            backgroundColor: "rgb(103 232 255 / 14%)",
            color: "#ffffff",
          },
        },
        avatarBox: {
          border: "2px solid rgb(103 232 255 / 45%)",
          boxShadow: "0 0 0 4px rgb(103 232 255 / 8%), 0 0.8rem 2rem rgb(158 119 255 / 18%)",
        },
        activeDeviceListItem: {
          borderRadius: "0.75rem",
          '&:hover': {
            backgroundColor: "rgb(103 232 255 / 5%)",
          },
        },
        menuButtonEllipsis: {
          color: "#a8b2c7",
        },
      },
    },
  };
}

async function loadClerk(publishableKey) {
  const domain = getClerkDomain(publishableKey);
  if (!domain) throw new Error("The account service is not configured correctly.");

  await loadScript({ src: `https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js` });
  await loadScript({
    src: `https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,
    publishableKey,
  });
  if (!globalThis.Clerk) throw new Error("Account sign-in could not load.");
  await globalThis.Clerk.load({
    appearance: createClerkAppearance(),
    ui: { ClerkUI: globalThis.__internal_ClerkUICtor },
  });
  return globalThis.Clerk;
}

async function requestJson(clerk, apiUrl, path, options = {}) {
  const token = await clerk.session?.getToken();
  if (!token) throw new Error("Please sign in again.");

  const response = await fetch(new URL(path, apiUrl), {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || `Account request failed (${response.status}).`);
    error.status = response.status;
    error.result = result;
    throw error;
  }
  return result;
}

const avatarOptions = [
  ["richtofen", "Edward Richtofen"], ["dempsey", "Tank Dempsey"],
  ["takeo", "Takeo Masaki"], ["nikolai", "Nikolai Belinski"],
  ["samantha", "Samantha Maxis", { type: "round", value: 5 }],
  ["dr-maxis", "Dr. Ludwig Maxis", { type: "round", value: 5 }],
  ["misty", "Misty", { type: "round", value: 10 }],
  ["stuhlinger", "Samuel Stuhlinger", { type: "round", value: 10 }],
  ["marlton", "Marlton Johnson", { type: "round", value: 10 }],
  ["russman", "Russman", { type: "round", value: 10 }],
  ["tedd", "T.E.D.D.", { type: "maps", value: 20 }],
  ["brutus", "Brutus", { type: "maps", value: 50 }],
  ["dr-monty", "Dr. Monty", { type: "maps", value: 100 }],
  ["shadowman", "The Shadowman", { type: "round", value: 50 }],
  ["scarlett", "Scarlett Rhodes", { type: "maps", value: 25 }],
  ["diego", "Diego Necalli", { type: "maps", value: 25 }],
  ["bruno", "Bruno Delacroix", { type: "maps", value: 25 }],
  ["stanton", "Stanton Shaw", { type: "maps", value: 25 }],
  ["weaver", "Grigori Weaver", { type: "round", value: 15 }],
  ["grey", "Dr. Elizabeth Grey", { type: "round", value: 15 }],
  ["carver", "Mac Carver", { type: "round", value: 15 }],
  ["maya", "Maya Aguinaldo", { type: "round", value: 15 }],
  ["warden", "The Warden", { type: "round", value: 50 }],
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

function createUserProfileOptions(
  clerk,
  {
    openUsernameEditor = null,
    openProfileEditor = null,
    beforeSignOut = null,
    afterSignOutFailure = null,
  } = {},
) {
  const customPages = [];

  const addLaunchPage = (url, label, icon, descriptionText, buttonText, handler) => {
    if (!handler) return;
    customPages.push({
      url,
      label,
      mountIcon: (element) => { element.textContent = icon; },
      unmountIcon: (element) => { element.replaceChildren(); },
      mount: (element) => {
        const heading = document.createElement("h2");
        const description = document.createElement("p");
        const button = document.createElement("button");
        heading.textContent = label;
        description.textContent = descriptionText;
        button.className = "button primary";
        button.type = "button";
        button.textContent = buttonText;
        button.addEventListener("click", handler);
        element.replaceChildren(heading, description, button);
      },
      unmount: (element) => element.replaceChildren(),
    });
  };

  addLaunchPage(
    "game-profile", "Profile", "☣",
    "Choose your zombie identity, favourites, profile theme and favourite memory.",
    "Edit profile", openProfileEditor,
  );
  if (openUsernameEditor) {
    customPages.push({
      url: "change-username",
      label: "Change username",
      mountIcon: (element) => {
        element.textContent = "✎";
      },
      unmountIcon: (element) => {
        element.replaceChildren();
      },
      mount: (element) => {
        const heading = document.createElement("h2");
        const description = document.createElement("p");
        const button = document.createElement("button");

        element.classList.add("clerk-username-page");
        heading.textContent = "Change username";
        description.textContent = "This is the public name shown on leaderboards.";
        button.className = "button primary";
        button.type = "button";
        button.textContent = "Edit username";
        button.dataset.openUsernameEditor = "";

        element.replaceChildren(heading, description, button);
      },
      unmount: (element) => {
        element.classList.remove("clerk-username-page");
        element.replaceChildren();
      },
    });
  }

  customPages.push(
    {
      url: "sign-out",
      label: "Sign out",
      mountIcon: (element) => {
        element.textContent = "↪";
      },
      unmountIcon: (element) => {
        element.replaceChildren();
      },
      mount: (element) => {
        const heading = document.createElement("h2");
        const description = document.createElement("p");
        const button = document.createElement("button");
        const error = document.createElement("p");

        element.classList.add("clerk-sign-out-page");
        heading.textContent = "Sign out";
        description.textContent = "Sign out of The Daily Undead on this device?";
        button.className = "button clerk-sign-out-button";
        button.type = "button";
        button.textContent = "Sign out";
        error.className = "account-error";
        error.setAttribute("role", "alert");

        button.addEventListener("click", async () => {
          button.disabled = true;
          button.textContent = "Signing out…";
          error.textContent = "";
          try {
            beforeSignOut?.();
            await clerk.signOut({
              redirectUrl: `${window.location.origin}${window.location.pathname}`,
            });
          } catch {
            afterSignOutFailure?.();
            button.disabled = false;
            button.textContent = "Sign out";
            error.textContent = "Could not sign out. Please try again.";
          }
        });

        element.replaceChildren(heading, description, button, error);
      },
      unmount: (element) => {
        element.classList.remove("clerk-sign-out-page");
        element.replaceChildren();
      },
    },
  );

  return {
    routing: "hash",
    customPages,
  };
}

export async function initialiseAccount({
  apiUrl,
  puzzleDate,
  getLocalSnapshot,
  applyRemoteAccount,
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
  const publishableKey = getClerkPublishableKey(documentObject);
  let clerk = null;
  let profile = null;
  let saveTimer = null;
  let saveInFlight = false;
  let saveAgain = false;
  let intentionalSignOut = false;
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

      const makeProfileStat = (label, value, primary = false) => {
        const box = documentObject.createElement("div");
        box.className = `public-profile-stat${primary ? " is-primary" : ""}`;
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
        makeProfileStat("Score", result.stats.score, true),
        makeProfileStat("Puzzle Solves", result.stats.solves),
        makeProfileStat("Current Round", Math.max(1, result.stats.currentRound)),
        makeProfileStat("Highest Round", result.stats.bestRound),
      );
      const bio = documentObject.createElement("p");
      bio.className = "public-profile-bio";
      bio.textContent = viewed.bio || "No favourite memory shared yet.";
      bio.classList.toggle("is-empty", !viewed.bio);
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
      const content = [header, bio, stats, favourites];
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

  if (!accountButton || !publishableKey || !apiUrl) {
    if (accountButton) accountButton.hidden = true;
    return createUnavailableController({ openPlayerProfile });
  }

  accountButton.hidden = false;
  accountButton.disabled = true;
  accountButton.textContent = "Loading...";

  try {
    clerk = await withTimeout(
      loadClerk(publishableKey),
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

  const rememberedAccount = () => readRememberedAccount(globalThis.localStorage);
  const persistPendingProgress = (userId, revision) => writePendingProgress(
    globalThis.localStorage,
    {
      userId,
      revision,
      puzzleDate,
      snapshot: getLocalSnapshot(),
    },
  );
  const beginSignIn = () => {
    closeDialog(sessionExpiredDialog);
    clerk.openSignIn({ routing: "hash" });
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
    forgetRememberedAccount(globalThis.localStorage);
  };
  const afterSignOutFailure = () => {
    intentionalSignOut = false;
    if (signedOutMemory) rememberAccount(globalThis.localStorage, signedOutMemory);
    signedOutMemory = null;
  };
  const waitForConflictChoice = () => new Promise((resolve) => {
    const choose = (choice) => {
      closeDialog(conflictDialog);
      resolve(choice);
    };
    conflictDeviceButton?.addEventListener("click", () => choose("device"), { once: true });
    conflictCloudButton?.addEventListener("click", () => choose("cloud"), { once: true });
    openDialog(conflictDialog);
  });

  sessionLoginButton?.addEventListener("click", beginSignIn);
  documentObject.querySelector("[data-close-session-expired]")?.addEventListener(
    "click",
    () => closeDialog(sessionExpiredDialog),
  );

  documentObject.querySelectorAll("[data-close-account-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.closest("dialog")));
  });
  documentObject.querySelector("#account-create")?.addEventListener("click", () => {
    closeDialog(accessDialog);
    clerk.openSignUp({ routing: "hash" });
  });
  documentObject.querySelector("#account-sign-in")?.addEventListener("click", () => {
    closeDialog(accessDialog);
    clerk.openSignIn({ routing: "hash" });
  });

  if (!clerk.isSignedIn) {
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
    clerk.addListener(({ user }) => {
      if (wasSignedOut && user) {
        wasSignedOut = false;
        window.location.reload();
      }
    });
    globalThis.addEventListener?.("storage", (event) => {
      if (event.key !== accountMemoryStorageKey || readRememberedAccount(globalThis.localStorage)) return;
      closeDialog(sessionExpiredDialog);
      accountButton.classList.remove("has-expired-session");
      accountButton.textContent = "Log in";
    });
    return createUnavailableController({
      clerk,
      signedIn: false,
      openPlayerProfile,
      scheduleSave: remembered
        ? () => persistPendingProgress(remembered.userId, remembered.revision)
        : () => {},
    });
  }

  accountButton.classList.add("is-signed-in");

  let account;
  try {
    const url = new URL("/api/account", apiUrl);
    url.searchParams.set("date", puzzleDate);
    account = await requestJson(clerk, apiUrl, `${url.pathname}${url.search}`);
  } catch (error) {
    const remembered = rememberedAccount();
    accountButton.disabled = false;
    accountButton.textContent = "Account sync offline";
    accountButton.addEventListener("click", () =>
      clerk.openUserProfile(createUserProfileOptions(clerk, { beforeSignOut, afterSignOutFailure })),
    );
    return createUnavailableController({
      clerk,
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
      onboardingError.textContent = "";

      try {
        const snapshot = getLocalSnapshot();
        await requestJson(clerk, apiUrl, "/api/account/register", {
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
      }
    });

    return createUnavailableController({ clerk, signedIn: true, openPlayerProfile });
  }

  profile = account.profile;
  const userId = clerk.user.id;
  let pendingProgress = readPendingProgress(globalThis.localStorage, userId);
  if (!pendingProgress) {
    try {
      if (globalThis.localStorage.getItem(legacyDirtyStorageKey) === userId) {
        writePendingProgress(globalThis.localStorage, {
          userId,
          revision: null,
          puzzleDate,
          snapshot: getLocalSnapshot(),
        });
        globalThis.localStorage.removeItem(legacyDirtyStorageKey);
        pendingProgress = readPendingProgress(globalThis.localStorage, userId);
      }
    } catch {
      // Legacy pending progress remains local if storage is unavailable.
    }
  }

  if (pendingProgress) {
    const cloudRevision = Number(account.progress?.revision || 0);
    const revisionsMatch =
      pendingProgress.revision != null && pendingProgress.revision === cloudRevision;
    let useDeviceProgress = revisionsMatch;
    if (!revisionsMatch) {
      useDeviceProgress = await waitForConflictChoice() === "device";
    }

    if (useDeviceProgress) {
      try {
        const saveResult = await requestJson(clerk, apiUrl, "/api/account/save", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            puzzleDate: pendingProgress.puzzleDate,
            progress: pendingProgress.snapshot.progress,
            dailyState: pendingProgress.snapshot.dailyState,
            baseRevision: revisionsMatch ? pendingProgress.revision : null,
          }),
        });
        account.progress = saveResult.progress;
        if (pendingProgress.puzzleDate === puzzleDate) {
          account.dailyState = pendingProgress.snapshot.dailyState;
        }
        clearPendingProgress(globalThis.localStorage, userId);
        pendingProgress = null;
      } catch {
        accountButton.disabled = false;
        accountButton.textContent = "Progress waiting to sync";
        rememberAccount(globalThis.localStorage, { userId, revision: cloudRevision });
        return createUnavailableController({
          clerk,
          signedIn: true,
          openPlayerProfile,
          scheduleSave: () => persistPendingProgress(userId, cloudRevision),
        });
      }
    } else {
      clearPendingProgress(globalThis.localStorage, userId);
      pendingProgress = null;
    }
  }

  applyRemoteAccount(account);
  rememberAccount(globalThis.localStorage, {
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
    clerk.closeUserProfile();
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
      const result = await requestJson(clerk, apiUrl, "/api/account/profile", {
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
    clerk.closeUserProfile();
    usernameForm.elements.publicName.value = profile.username;
    usernameFeedback.textContent = "";
    usernameFeedback.classList.remove("account-error", "is-success");
    globalThis.setTimeout(() => openDialog(usernameDialog), 250);
  };

  documentObject.addEventListener("click", (event) => {
    if (!event.target.closest("[data-open-username-editor]")) return;
    event.preventDefault();
    openUsernameEditor();
  });

  usernameForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = usernameForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    usernameFeedback.textContent = "";
    usernameFeedback.classList.remove("account-error", "is-success");

    try {
      const result = await requestJson(clerk, apiUrl, "/api/account/username", {
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

  const clerkProfileOptions = () => createUserProfileOptions(clerk, {
    openUsernameEditor,
    openProfileEditor,
    beforeSignOut,
    afterSignOutFailure,
  });

  const primaryEmail = () => clerk.user?.primaryEmailAddress?.emailAddress
    || clerk.user?.emailAddresses?.[0]?.emailAddress
    || "Not available";
  const openClerkPage = (initialPage) => {
    closeDialog(accountDetailsDialog);
    closeDialog(accountSecurityDialog);
    clerk.openUserProfile({
      ...clerkProfileOptions(),
      initialPage,
    });
  };

  documentObject.querySelector("[data-open-clerk-profile]")?.addEventListener(
    "click",
    () => openClerkPage("account"),
  );
  documentObject.querySelector("[data-open-clerk-security]")?.addEventListener(
    "click",
    () => openClerkPage("security"),
  );
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
      await clerk.signOut({
        redirectUrl: `${window.location.origin}${window.location.pathname}`,
      });
    } catch {
      afterSignOutFailure();
      signOutButton.disabled = false;
      signOutButton.textContent = "Sign out";
      if (signOutError) signOutError.textContent = "Could not sign out. Please try again.";
    }
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
      if (signOutError) signOutError.textContent = "";
      if (signOutButton) {
        signOutButton.disabled = false;
        signOutButton.textContent = "Sign out";
      }
      openDialog(accountSignOutDialog);
    }
  });

  accountButton.addEventListener("click", () => {
    openDialog(accountButton.classList.contains("has-expired-session")
      ? sessionExpiredDialog
      : accountMenuDialog);
  });

  let currentRevision = Number(account.progress?.revision || 1);

  async function saveNow() {
    if (saveInFlight) {
      saveAgain = true;
      return;
    }
    saveInFlight = true;
    try {
      const snapshot = getLocalSnapshot();
      const saveResult = await requestJson(clerk, apiUrl, "/api/account/save", {
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
      rememberAccount(globalThis.localStorage, { userId, revision: currentRevision });
      clearPendingProgress(globalThis.localStorage, userId);
    } catch (error) {
      // Progress remains stored locally and the next change will retry the sync.
      if (error.status === 409) accountButton.textContent = "Progress waiting to sync";
    } finally {
      saveInFlight = false;
      if (saveAgain) {
        saveAgain = false;
        scheduleSave();
      }
    }
  }

  function scheduleSave() {
    persistPendingProgress(userId, currentRevision);
    globalThis.clearTimeout(saveTimer);
    saveTimer = globalThis.setTimeout(saveNow, 350);
  }

  async function recordMapResult(payload) {
    try {
      const result = await requestJson(clerk, apiUrl, "/api/account/results/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      currentRevision = Math.max(currentRevision, Number(result.progress?.revision || 0));
      rememberAccount(globalThis.localStorage, { userId, revision: currentRevision });
      scheduleSave();
      return result;
    } catch {
      return null;
    }
  }

  async function recordBonusResult(payload) {
    try {
      const result = await requestJson(clerk, apiUrl, "/api/account/results/bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      currentRevision = Math.max(currentRevision, Number(result.progress?.revision || 0));
      rememberAccount(globalThis.localStorage, { userId, revision: currentRevision });
      scheduleSave();
      return result;
    } catch {
      return null;
    }
  }

  const controller = {
    available: true,
    signedIn: true,
    canSync: true,
    profile,
    scheduleSave,
    recordMapResult,
    recordBonusResult,
    openPlayerProfile,
  };

  let wasSignedIn = true;
  clerk.addListener(({ user }) => {
    if (!wasSignedIn || user) return;
    wasSignedIn = false;
    controller.canSync = false;
    if (!intentionalSignOut && readRememberedAccount(globalThis.localStorage)) {
      persistPendingProgress(userId, currentRevision);
      showExpiredSession();
    }
  });

  return controller;
}

function createUnavailableController({
  clerk = null,
  signedIn = false,
  openPlayerProfile = async () => {},
  scheduleSave = () => {},
} = {}) {
  return {
    available: Boolean(clerk),
    signedIn,
    canSync: false,
    profile: null,
    scheduleSave,
    async recordMapResult() { return null; },
    async recordBonusResult() { return null; },
    openPlayerProfile,
  };
}
