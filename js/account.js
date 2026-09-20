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
  if (!response.ok) throw new Error(result.error || `Account request failed (${response.status}).`);
  return result;
}

function createUserProfileOptions(clerk, { openUsernameEditor = null } = {}) {
  const customPages = [];

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
            await clerk.signOut({
              redirectUrl: `${window.location.origin}${window.location.pathname}`,
            });
          } catch {
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
  const accessDialog = documentObject.querySelector("#account-access-dialog");
  const onboardingDialog = documentObject.querySelector("#account-onboarding-dialog");
  const onboardingForm = documentObject.querySelector("#account-onboarding-form");
  const onboardingError = documentObject.querySelector("#account-onboarding-error");
  const usernameDialog = documentObject.querySelector("#account-username-dialog");
  const usernameForm = documentObject.querySelector("#account-username-form");
  const usernameFeedback = documentObject.querySelector("#account-username-feedback");
  const publishableKey = getClerkPublishableKey(documentObject);
  let clerk = null;
  let profile = null;
  let saveTimer = null;
  let saveInFlight = false;
  let saveAgain = false;
  const dirtyStorageKey = "the-daily-undead:account-sync-pending";

  if (!accountButton || !publishableKey || !apiUrl) {
    if (accountButton) accountButton.hidden = true;
    return createUnavailableController();
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
    return createUnavailableController();
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
    accountButton.disabled = false;
    accountButton.textContent = "Log in";
    accountButton.addEventListener("click", () => openDialog(accessDialog));
    let wasSignedOut = true;
    clerk.addListener(({ user }) => {
      if (wasSignedOut && user) {
        wasSignedOut = false;
        window.location.reload();
      }
    });
    return createUnavailableController({ clerk, signedIn: false });
  }

  accountButton.classList.add("is-signed-in");

  let account;
  try {
    const url = new URL("/api/account", apiUrl);
    url.searchParams.set("date", puzzleDate);
    account = await requestJson(clerk, apiUrl, `${url.pathname}${url.search}`);
  } catch (error) {
    accountButton.disabled = false;
    accountButton.textContent = "Account sync offline";
    accountButton.addEventListener("click", () =>
      clerk.openUserProfile(createUserProfileOptions(clerk)),
    );
    return createUnavailableController({ clerk, signedIn: true });
  }

  if (account.needsOnboarding) {
    accountButton.disabled = false;
    accountButton.textContent = "Finish account";
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

    return createUnavailableController({ clerk, signedIn: true });
  }

  profile = account.profile;
  let hasPendingLocalSave = false;
  try {
    hasPendingLocalSave = localStorage.getItem(dirtyStorageKey) === clerk.user?.id;
  } catch {
    hasPendingLocalSave = false;
  }
  if (!hasPendingLocalSave) applyRemoteAccount(account);
  accountButton.disabled = false;
  accountButton.textContent = profile.username;
  accountButton.classList.add("has-username");

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

  accountButton.addEventListener("click", () =>
    clerk.openUserProfile(createUserProfileOptions(clerk, { openUsernameEditor })),
  );

  async function saveNow() {
    if (saveInFlight) {
      saveAgain = true;
      return;
    }
    saveInFlight = true;
    try {
      const snapshot = getLocalSnapshot();
      await requestJson(clerk, apiUrl, "/api/account/save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puzzleDate,
          progress: snapshot.progress,
          dailyState: snapshot.dailyState,
        }),
      });
      try {
        localStorage.removeItem(dirtyStorageKey);
      } catch {
        // The next successful save can still clear the in-memory retry state.
      }
    } catch {
      // Progress remains stored locally and the next change will retry the sync.
    } finally {
      saveInFlight = false;
      if (saveAgain) {
        saveAgain = false;
        scheduleSave();
      }
    }
  }

  function scheduleSave() {
    try {
      localStorage.setItem(dirtyStorageKey, clerk.user.id);
    } catch {
      // Saving still proceeds when local storage is unavailable.
    }
    globalThis.clearTimeout(saveTimer);
    saveTimer = globalThis.setTimeout(saveNow, 350);
  }

  if (hasPendingLocalSave) {
    scheduleSave();
  }

  async function recordMapResult(payload) {
    try {
      return await requestJson(clerk, apiUrl, "/api/account/results/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      return null;
    }
  }

  async function recordBonusResult(payload) {
    try {
      return await requestJson(clerk, apiUrl, "/api/account/results/bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      return null;
    }
  }

  return {
    available: true,
    signedIn: true,
    canSync: true,
    profile,
    scheduleSave,
    recordMapResult,
    recordBonusResult,
  };
}

function createUnavailableController({ clerk = null, signedIn = false } = {}) {
  return {
    available: Boolean(clerk),
    signedIn,
    canSync: false,
    profile: null,
    scheduleSave() {},
    async recordMapResult() { return null; },
    async recordBonusResult() { return null; },
  };
}
