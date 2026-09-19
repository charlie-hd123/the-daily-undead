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

async function loadClerk(publishableKey) {
  const domain = getClerkDomain(publishableKey);
  if (!domain) throw new Error("The account service is not configured correctly.");

  await loadScript({ src: `https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js` });
  await loadScript({
    src: `https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,
    publishableKey,
  });
  if (!globalThis.Clerk) throw new Error("Account sign-in could not load.");
  await globalThis.Clerk.load({ ui: { ClerkUI: globalThis.__internal_ClerkUICtor } });
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
        button.addEventListener("click", openUsernameEditor);

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
  const accountStatus = documentObject.querySelector("#account-status");
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

  const setStatus = (message = "") => {
    if (accountStatus) accountStatus.textContent = message;
  };

  if (!accountButton || !publishableKey || !apiUrl) {
    if (accountButton) accountButton.hidden = true;
    return createUnavailableController();
  }

  accountButton.hidden = false;
  accountButton.disabled = true;
  accountButton.textContent = "Loading account…";

  try {
    clerk = await withTimeout(
      loadClerk(publishableKey),
      5_000,
      "Account sign-in took too long to load.",
    );
  } catch (error) {
    accountButton.disabled = false;
    accountButton.textContent = "Account unavailable";
    setStatus(error.message);
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
    setStatus();
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

  let account;
  try {
    const url = new URL("/api/account", apiUrl);
    url.searchParams.set("date", puzzleDate);
    account = await requestJson(clerk, apiUrl, `${url.pathname}${url.search}`);
  } catch (error) {
    accountButton.disabled = false;
    accountButton.textContent = "Account sync offline";
    setStatus("Progress is saved on this device for now");
    accountButton.addEventListener("click", () =>
      clerk.openUserProfile(createUserProfileOptions(clerk)),
    );
    return createUnavailableController({ clerk, signedIn: true });
  }

  if (account.needsOnboarding) {
    accountButton.disabled = false;
    accountButton.textContent = "Finish account";
    setStatus("Choose a username to sync progress");
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
  setStatus();

  const openUsernameEditor = () => {
    if (!usernameDialog || !usernameForm || !usernameFeedback) return;
    clerk.closeUserProfile();
    usernameForm.elements.publicName.value = profile.username;
    usernameFeedback.textContent = "";
    usernameFeedback.classList.remove("account-error", "is-success");
    globalThis.setTimeout(() => openDialog(usernameDialog), 0);
  };

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
      setStatus();
    } catch {
      setStatus("Saved on this device · sync will retry");
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
    setStatus("Finishing progress sync…");
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
      setStatus("Result saved locally · verification will retry later");
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
      setStatus("Bonus saved locally · verification will retry later");
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
