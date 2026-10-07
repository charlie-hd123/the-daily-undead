import { createClient } from "./vendor/supabase.js";

function readConfig(documentObject) {
  const read = (name) => documentObject
    .querySelector(`meta[name="${name}"]`)
    ?.content?.trim() || "";
  return {
    url: read("daily-undead-supabase-url"),
    publishableKey: read("daily-undead-supabase-publishable-key"),
  };
}

export function hasSupabaseConfiguration(documentObject = document) {
  const config = readConfig(documentObject);
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url)
    && config.publishableKey.startsWith("sb_publishable_");
}

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

export async function loadSupabaseAuth(documentObject = document) {
  const config = readConfig(documentObject);
  if (!hasSupabaseConfiguration(documentObject)) {
    throw new Error("Supabase Auth is not configured correctly.");
  }

  const client = createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
  const initial = await client.auth.getSession();
  if (initial.error) throw initial.error;

  let currentSession = initial.data.session;
  const listeners = new Set();
  const dialog = documentObject.querySelector("#supabase-auth-dialog");
  const form = documentObject.querySelector("#supabase-auth-form");
  const emailStep = documentObject.querySelector("[data-supabase-email-step]");
  const codeStep = documentObject.querySelector("[data-supabase-code-step]");
  const title = documentObject.querySelector("[data-supabase-auth-title]");
  const description = documentObject.querySelector("[data-supabase-auth-description]");
  const error = documentObject.querySelector("[data-supabase-auth-error]");
  const resend = documentObject.querySelector("[data-supabase-auth-resend]");
  let mode = "signin";
  let pendingEmail = "";
  let resendTimer = null;

  const publicUser = () => {
    const user = currentSession?.user;
    if (!user) return null;
    const emailAddress = user.email || "";
    return {
      id: user.id,
      primaryEmailAddress: { emailAddress },
      emailAddresses: emailAddress ? [{ emailAddress }] : [],
      createdAt: user.created_at,
    };
  };

  const showStep = (step) => {
    const requestingCode = step === "email";
    if (emailStep) emailStep.hidden = !requestingCode;
    if (codeStep) codeStep.hidden = requestingCode;
    if (error) error.textContent = "";
    if (!requestingCode) {
      const code = form?.elements?.code;
      if (code) {
        code.value = "";
        globalThis.setTimeout(() => code.focus(), 0);
      }
    }
  };

  const startResendCountdown = () => {
    globalThis.clearInterval(resendTimer);
    let remaining = 60;
    if (resend) {
      resend.disabled = true;
      resend.textContent = `Resend code in ${remaining}s`;
    }
    resendTimer = globalThis.setInterval(() => {
      remaining -= 1;
      if (!resend) return;
      if (remaining <= 0) {
        globalThis.clearInterval(resendTimer);
        resend.disabled = false;
        resend.textContent = "Resend code";
      } else {
        resend.textContent = `Resend code in ${remaining}s`;
      }
    }, 1_000);
  };

  const sendCode = async () => {
    const result = await client.auth.signInWithOtp({
      email: pendingEmail,
      options: { shouldCreateUser: mode === "signup" },
    });
    if (result.error) throw result.error;
    showStep("code");
    startResendCountdown();
  };

  const begin = (nextMode) => {
    mode = nextMode;
    pendingEmail = "";
    if (form) form.reset();
    if (title) title.textContent = mode === "signup" ? "Create account" : "Sign in";
    if (description) {
      description.textContent = mode === "signup"
        ? "Enter your email and we’ll send you a verification code."
        : "Enter the email for your Daily Undead account.";
    }
    showStep("email");
    openDialog(dialog);
  };

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const codeActive = Boolean(codeStep && !codeStep.hidden);
    const submit = (codeActive ? codeStep : emailStep)?.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    if (error) error.textContent = "";
    try {
      if (!codeActive) {
        pendingEmail = String(form.elements.email.value || "").trim().toLowerCase();
        if (!pendingEmail || !form.elements.email.checkValidity()) {
          throw new Error("Enter a valid email address.");
        }
        await sendCode();
      } else {
        const token = String(form.elements.code.value || "").replace(/\s/g, "");
        if (!/^(?:\d{6}|\d{8})$/.test(token)) {
          throw new Error("Enter the verification code from your email.");
        }
        const result = await client.auth.verifyOtp({ email: pendingEmail, token, type: "email" });
        if (result.error) throw result.error;
        currentSession = result.data.session;
        closeDialog(dialog);
        window.location.reload();
      }
    } catch (caught) {
      if (error) {
        error.textContent = caught?.message?.includes("Signups not allowed")
          ? "No account was found for that email."
          : caught?.message || "Authentication failed. Please try again.";
      }
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  resend?.addEventListener("click", async () => {
    if (!pendingEmail || resend.disabled) return;
    resend.disabled = true;
    if (error) error.textContent = "";
    try {
      await sendCode();
    } catch (caught) {
      resend.disabled = false;
      if (error) error.textContent = caught?.message || "Could not resend the code.";
    }
  });

  documentObject.querySelector("[data-supabase-auth-back]")?.addEventListener("click", () => {
    showStep("email");
  });
  documentObject.querySelector("[data-close-supabase-auth]")?.addEventListener("click", () => {
    closeDialog(dialog);
  });

  client.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    const user = publicUser();
    listeners.forEach((listener) => listener({ user }));
  });

  if (currentSession) {
    client.rpc("record_authenticated_visit").then(() => {}, () => {});
  }

  const facade = {
    kind: "supabase",
    client,
    get isSignedIn() { return Boolean(currentSession); },
    get user() { return publicUser(); },
    get session() {
      return currentSession
        ? { getToken: async () => currentSession?.access_token || null }
        : null;
    },
    openSignIn() { begin("signin"); },
    openSignUp() { begin("signup"); },
    openUserProfile() { openDialog(documentObject.querySelector("#account-details-dialog")); },
    closeUserProfile() {},
    addListener(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signOut({ redirectUrl } = {}) {
      const result = await client.auth.signOut({ scope: "local" });
      if (result.error) throw result.error;
      if (redirectUrl) window.location.assign(redirectUrl);
    },
  };
  return facade;
}
