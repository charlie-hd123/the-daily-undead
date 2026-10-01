const demoStorageKey = "the-daily-undead:social-demo-v3";
const legacyAvatarIds = {
  scientist: "richtofen", soldier: "dempsey", warrior: "takeo",
  explorer: "nikolai", punk: "misty", hazmat: "carver",
};

const profiles = [
  {
    username: "Richtofen93", avatarId: "unselected", themeId: "default",
    favouriteGame: "", favouriteMap: "", bio: "",
    createdAt: "2026-08-13T00:00:00Z", currentRound: 44, score: 4720, bestRound: 47, solves: 64,
  },
  {
    username: "Dempsey", avatarId: "dempsey", themeId: "afterlife",
    favouriteGame: "World at War", favouriteMap: "Der Riese", bio: "Kick undead ass. Ask questions later.",
    createdAt: "2026-08-18T00:00:00Z", currentRound: 35, score: 3635, bestRound: 38, solves: 55,
  },
  {
    username: "Takeo", avatarId: "takeo", themeId: "outbreak",
    favouriteGame: "Black Ops 3", favouriteMap: "Zetsubou No Shima", bio: "Honour survives beyond death.",
    createdAt: "2026-08-21T00:00:00Z", currentRound: 32, score: 7550, bestRound: 35, solves: 120,
  },
  {
    username: "Misty", avatarId: "misty", themeId: "hellfire",
    favouriteGame: "Black Ops 2", favouriteMap: "Buried", bio: "Still standing. Still shooting.",
    createdAt: "2026-09-02T00:00:00Z", currentRound: 28, score: 18465, bestRound: 31, solves: 280,
  },
  {
    username: "Nikolai", avatarId: "nikolai", themeId: "default",
    favouriteGame: "Black Ops", favouriteMap: "Ascension", bio: "One more round. Then perhaps one more.",
    createdAt: "2026-09-08T00:00:00Z", currentRound: 25, score: 1380, bestRound: 28, solves: 18,
  },
];

function loadState(storage) {
  try {
    const saved = JSON.parse(storage.getItem(demoStorageKey));
    if (saved?.profile?.username) {
      const seed = profiles.find((profile) => profile.username.toLowerCase() === saved.profile.username.toLowerCase());
      const avatarId = legacyAvatarIds[saved.profile.avatarId] || saved.profile.avatarId || "unselected";
      return { profile: { ...(seed || profiles[0]), ...saved.profile, avatarId } };
    }
  } catch {
    // A fresh demo state is fine.
  }
  return { profile: { ...profiles[0] } };
}

function saveState(storage, state) {
  try { storage.setItem(demoStorageKey, JSON.stringify(state)); } catch { /* demo remains in memory */ }
}

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function avatar(documentObject, avatarId, extraClass = "") {
  const element = documentObject.createElement("span");
  element.className = `zombie-avatar ${extraClass}`.trim();
  element.dataset.avatar = avatarId;
  element.setAttribute("aria-hidden", "true");
  return element;
}

function profileByUsername(username, state) {
  return [state.profile, ...profiles.slice(1)].find(
    (profile) => profile.username.toLowerCase() === String(username).toLowerCase(),
  );
}

export function createSocialDemoFetch() {
  return async (input) => {
    const url = new URL(input instanceof URL ? input.href : typeof input === "string" ? input : input.url);
    if (url.pathname !== "/api/leaderboards") return new Response("Not found", { status: 404 });
    const allTime = profiles.map((profile, index) => ({
      username: profile.username,
      avatarId: profile.avatarId,
      themeId: profile.themeId,
      currentRound: profile.currentRound,
      bestRound: profile.bestRound,
      solves: profile.solves,
      score: profile.score,
    }));
    return Response.json({
      date: url.searchParams.get("date"),
      today: {
        playersToday: 5,
        elite: allTime.slice(0, 4).map((entry, index) => ({
          username: entry.username,
          avatarId: entry.avatarId,
          themeId: entry.themeId,
          cluesUsed: Math.min(3, index + 1),
          bonusCorrect: index % 2 === 0,
          points: 100 - index * 20,
        })),
      },
      allTime,
    });
  };
}

export function initialiseSocialDemo({ documentObject = document, storage = localStorage } = {}) {
  const state = loadState(storage);
  const accountButton = documentObject.querySelector("#account-button");
  const accountDialog = documentObject.querySelector("#demo-account-dialog");
  const accountMenuNote = accountDialog.querySelector("[data-account-menu-note]");
  const editorDialog = documentObject.querySelector("#profile-editor-dialog");
  const editorForm = documentObject.querySelector("#profile-editor-form");
  const editorFeedback = documentObject.querySelector("#profile-editor-feedback");
  const publicDialog = documentObject.querySelector("#player-profile-dialog");
  const publicContent = documentObject.querySelector("[data-public-profile-content]");
  const usernameDialog = documentObject.querySelector("#account-username-dialog");
  const usernameForm = documentObject.querySelector("#account-username-form");
  const usernameFeedback = documentObject.querySelector("#account-username-feedback");

  documentObject.querySelectorAll("[data-close-account-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.closest("dialog")));
  });

  accountMenuNote.textContent = "Local demo mode. Clerk manages the standard account pages when signed in normally.";
  ["profile", "security", "sign-out"].forEach((action) => {
    const button = accountDialog.querySelector(`[data-account-action="${action}"]`);
    button.disabled = true;
    const description = button.querySelector("span");
    description.textContent = action === "sign-out" ? "Unavailable in demo mode" : "Managed by Clerk";
  });

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

  const avatarUnlockLabel = (unlock) => !unlock
    ? "Available at signup"
    : unlock.type === "round" ? `Reach Round ${unlock.value}` : `Solve ${unlock.value} maps`;
  const avatarIsUnlocked = (unlock) => !unlock
    || (unlock.type === "round" ? state.profile.bestRound >= unlock.value : state.profile.solves >= unlock.value);

  editorForm.querySelector("[data-avatar-picker]")?.replaceChildren(...avatarOptions.map(([id, name, unlock]) => {
    const label = documentObject.createElement("label");
    label.className = "avatar-choice";
    const locked = !avatarIsUnlocked(unlock);
    const requirement = avatarUnlockLabel(unlock);
    label.classList.toggle("is-locked", locked);
    label.dataset.unlockLabel = locked ? requirement : "Unlocked";
    const input = documentObject.createElement("input");
    input.type = "radio"; input.name = "avatarId"; input.value = id;
    input.setAttribute("aria-label", locked ? `${name}, locked, ${requirement}, available to preview` : `${name}, unlocked`);
    label.title = locked ? `${name} — ${requirement}` : `${name} — Unlocked`;
    label.append(input, avatar(documentObject, id));
    return label;
  }));
  editorForm.querySelector("[data-theme-picker]")?.replaceChildren(...themeOptions.map(({ id, label: themeLabel, requiredMaps }) => {
    const label = documentObject.createElement("label");
    label.className = "theme-choice"; label.dataset.theme = id;
    const locked = state.profile.solves < requiredMaps;
    label.classList.toggle("is-locked", locked);
    const input = documentObject.createElement("input");
    input.type = "radio"; input.name = "themeId"; input.value = id;
    input.dataset.requiredMaps = requiredMaps;
    input.setAttribute("aria-label", locked ? `${themeLabel}, unlocks at ${requiredMaps} solves, available to preview` : themeLabel);
    const text = documentObject.createElement("span");
    const name = documentObject.createElement("strong");
    const unlock = documentObject.createElement("small");
    unlock.className = "theme-unlock";
    name.textContent = themeLabel;
    unlock.textContent = locked ? `🔒 ${requiredMaps} solves` : "";
    unlock.hidden = !locked;
    text.append(name, unlock);
    label.append(input, text);
    return label;
  }));

  function updateLockedPreviewState() {
    const requirements = [];
    const selectedAvatarId = editorForm.querySelector('[name="avatarId"]:checked')?.value;
    const selectedAvatar = avatarOptions.find(([id]) => id === selectedAvatarId);
    if (selectedAvatar && !avatarIsUnlocked(selectedAvatar[2])) {
      requirements.push(`${selectedAvatar[1]}: ${avatarUnlockLabel(selectedAvatar[2])}`);
    }
    const selectedThemeId = editorForm.querySelector('[name="themeId"]:checked')?.value;
    const selectedTheme = themeOptions.find(({ id }) => id === selectedThemeId);
    if (selectedTheme && state.profile.solves < selectedTheme.requiredMaps) {
      requirements.push(`${selectedTheme.label}: ${selectedTheme.requiredMaps} solves`);
    }
    const saveButton = editorForm.querySelector('button[type="submit"]');
    if (requirements.length) {
      editorFeedback.classList.remove("account-error", "is-success");
      editorFeedback.classList.add("is-preview-warning");
      editorFeedback.textContent = `Previewing locked content — ${requirements.join(" · ")}. Unlock it before saving.`;
      if (saveButton) saveButton.disabled = true;
      return;
    }
    editorFeedback.classList.remove("account-error", "is-success", "is-preview-warning");
    editorFeedback.textContent = "";
    if (saveButton) saveButton.disabled = false;
  }

  function openEditor() {
    ["favouriteGame", "favouriteMap", "bio"].forEach((field) => {
      editorForm.elements[field].value = state.profile[field] || "";
    });
    const avatarInput = editorForm.querySelector(`[name="avatarId"][value="${state.profile.avatarId}"]`);
    if (avatarInput) avatarInput.checked = true;
    editorForm.querySelector(`[name="themeId"][value="${state.profile.themeId}"]`).checked = true;
    editorDialog.dataset.previewTheme = state.profile.themeId;
    updateLockedPreviewState();
    openDialog(editorDialog);
  }

  function makeFact(label, value) {
    const item = documentObject.createElement("div");
    item.className = "public-profile-stat";
    const term = documentObject.createElement("dt");
    const description = documentObject.createElement("dd");
    term.textContent = label; description.textContent = value || "—";
    item.append(term, description);
    return item;
  }

  function openPlayerProfile(username) {
    const viewed = profileByUsername(username, state);
    if (!viewed) return;
    publicDialog.dataset.theme = viewed.themeId;
    const header = documentObject.createElement("header");
    header.className = "public-profile-header";
    const copy = documentObject.createElement("div");
    const kicker = documentObject.createElement("p"); kicker.className = "kicker"; kicker.textContent = "Survivor profile";
    const heading = documentObject.createElement("h2"); heading.textContent = viewed.username;
    const identityLine = documentObject.createElement("div"); identityLine.className = "public-profile-identity-line";
    [["Score", viewed.score ?? 0], ["Round", Math.max(1, viewed.currentRound ?? viewed.bestRound - 3)]].forEach(([label, value]) => {
      const indicator = documentObject.createElement("span"); indicator.className = "public-profile-indicator";
      indicator.innerHTML = `${label} <strong>${new Intl.NumberFormat("en-GB").format(value)}</strong>`;
      identityLine.append(indicator);
    });
    const joined = documentObject.createElement("p"); joined.className = "public-profile-joined";
    joined.textContent = `Joined ${new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(viewed.createdAt))}`;
    copy.append(kicker, heading, identityLine, joined); header.append(avatar(documentObject, viewed.avatarId), copy);
    const bio = documentObject.createElement("p");
    bio.className = "public-profile-bio";
    bio.textContent = viewed.bio || "No favourite memory shared yet.";
    bio.classList.toggle("is-empty", !viewed.bio);
    const stats = documentObject.createElement("dl"); stats.className = "public-profile-stats";
    stats.append(makeFact("Puzzle Solves", viewed.solves), makeFact("Highest Round", viewed.bestRound));
    const favourites = documentObject.createElement("dl"); favourites.className = "public-profile-favourites";
    [["Favourite game", viewed.favouriteGame], ["Favourite map", viewed.favouriteMap]].forEach(([label, value]) => favourites.append(makeFact(label, value)));
    const content = [header, bio, stats, favourites];
    if (viewed.username === state.profile.username) {
      const editLink = documentObject.createElement("button");
      editLink.className = "public-profile-edit-link";
      editLink.type = "button";
      editLink.textContent = "Edit your profile →";
      editLink.addEventListener("click", () => {
        closeDialog(publicDialog);
        openEditor();
      });
      content.push(editLink);
    }
    const note = documentObject.createElement("p"); note.className = "demo-mode-note"; note.textContent = "Local demo profile";
    content.push(note);
    publicContent.replaceChildren(...content);
    openDialog(publicDialog);
  }

  editorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(editorForm));
    const selectedAvatar = avatarOptions.find(([id]) => id === payload.avatarId);
    if (selectedAvatar && !avatarIsUnlocked(selectedAvatar[2])) {
      editorFeedback.classList.remove("is-success", "is-preview-warning");
      editorFeedback.classList.add("account-error");
      editorFeedback.textContent = `${selectedAvatar[1]} unlocks when you ${avatarUnlockLabel(selectedAvatar[2]).toLowerCase()}. Preview only for now.`;
      return;
    }
    const selectedTheme = themeOptions.find((theme) => theme.id === payload.themeId);
    if (selectedTheme && state.profile.solves < selectedTheme.requiredMaps) {
      editorFeedback.classList.remove("is-success", "is-preview-warning");
      editorFeedback.classList.add("account-error");
      editorFeedback.textContent = `${selectedTheme.label} unlocks at ${selectedTheme.requiredMaps} solves. Preview only for now.`;
      return;
    }
    Object.assign(state.profile, payload);
    saveState(storage, state);
    accountButton.textContent = state.profile.username;
    editorFeedback.classList.remove("account-error", "is-preview-warning");
    editorFeedback.classList.add("is-success");
    editorFeedback.textContent = "Demo profile saved locally.";
    closeDialog(editorDialog);
  });

  editorForm.addEventListener("change", (event) => {
    if (event.target.name === "avatarId") {
      updateLockedPreviewState();
      return;
    }
    if (event.target.name !== "themeId") return;
    editorDialog.dataset.previewTheme = event.target.value;
    updateLockedPreviewState();
  });

  usernameForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = usernameForm.elements.publicName.value.trim();
    usernameFeedback.classList.remove("account-error", "is-success");
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
      usernameFeedback.classList.add("account-error");
      usernameFeedback.textContent = "Use 3–16 letters, numbers or underscores.";
      return;
    }
    state.profile.username = username;
    accountButton.textContent = username;
    saveState(storage, state);
    usernameFeedback.classList.add("is-success");
    usernameFeedback.textContent = "Demo username updated.";
  });

  accountDialog.addEventListener("click", (event) => {
    const action = event.target.closest("[data-account-action]")?.dataset.accountAction;
    if (action === "game-profile") {
      closeDialog(accountDialog);
      openEditor();
    } else if (action === "username") {
      closeDialog(accountDialog);
      usernameForm.elements.publicName.value = state.profile.username;
      usernameFeedback.textContent = "";
      openDialog(usernameDialog);
    }
  });

  accountButton.hidden = false; accountButton.disabled = false;
  accountButton.textContent = state.profile.username;
  accountButton.classList.add("is-signed-in", "has-username", "is-demo");
  accountButton.addEventListener("click", () => openDialog(accountDialog));

  return {
    available: true, signedIn: true, canSync: false, profile: state.profile,
    scheduleSave() {}, async recordMapResult() { return null; }, async recordBonusResult() { return null; },
    openPlayerProfile,
  };
}
