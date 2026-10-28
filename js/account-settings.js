import { browserStorage } from "./browser-storage.js?v=20261028-2";
export async function requestEmailChange(auth, email, currentEmail, redirectUrl) {
  const nextEmail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) throw new Error("Enter a valid email address.");
  if (nextEmail === currentEmail.toLowerCase()) throw new Error("Enter a different email address.");
  const result = await auth.updateUser({ email: nextEmail }, { emailRedirectTo: redirectUrl });
  if (result.error) throw result.error;
  return nextEmail;
}

export async function verifyEmailChange(auth, email, code, expectedEmail) {
  const token = String(code || "").replace(/\s/g, "");
  if (!/^(?:\d{6}|\d{8})$/.test(token)) throw new Error("Enter the verification code from your email.");
  const result = await auth.verifyOtp({ email, token, type: "email_change" });
  if (result.error) throw result.error;
  // Secure email changes may require confirmation from both inboxes. A 200
  // response to the first code has no session and does not complete the change.
  return Boolean(result.data?.user?.email?.toLowerCase() === expectedEmail.toLowerCase());
}

export function clearDeletedAccountStorage(storage, userIds = []) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  keys.filter((key) => key?.startsWith("the-daily-undead:account-pending:")
    ? userIds.some((id) => key === `the-daily-undead:account-pending:${id}`)
    : key?.startsWith("the-daily-undead:") || key?.startsWith("dead-drop:"))
    .forEach((key) => storage.removeItem(key));
}

export function initialiseAccountSettings({ documentObject, clerk, userIds, requestDelete, beforeDelete, afterDeleteFailure }) {
  const emailDialog = documentObject.querySelector("#account-email-dialog");
  const emailForm = documentObject.querySelector("#account-email-form");
  const codeForm = documentObject.querySelector("#account-email-code-form");
  const feedback = documentObject.querySelector("[data-email-feedback]");
  const emailCopy = documentObject.querySelector("[data-email-verification-copy]");
  const deleteDialog = documentObject.querySelector("#account-delete-dialog");
  const deleteForm = documentObject.querySelector("#account-delete-form");
  const deleteError = documentObject.querySelector("[data-delete-error]");
  let pendingEmail = "";
  let resendAfter = 0;
  const redirectUrl = `${window.location.origin}${window.location.pathname}`;
  const open = (dialog) => dialog?.showModal();
  const close = (dialog) => dialog?.close();
  const showPending = () => {
    emailForm.hidden = true;
    codeForm.hidden = false;
    emailCopy.textContent = `Check ${pendingEmail} and your current inbox. Open the confirmation links in the emails. If they include codes, you can enter those below instead. Confirm both emails when asked. Your progress stays with your account.`;
    codeForm.elements.recipient.replaceChildren();
    [pendingEmail, clerk.user.primaryEmailAddress.emailAddress].forEach((email) => {
      const option = documentObject.createElement("option");
      option.value = email;
      option.textContent = email;
      codeForm.elements.recipient.append(option);
    });
    codeForm.elements.code.value = "";
  };
  const openEmail = () => {
    if (clerk.kind !== "supabase") return clerk.openUserProfile({ initialPage: "account" });
    close(documentObject.querySelector("#account-details-dialog"));
    emailForm.reset();
    codeForm.reset();
    pendingEmail = clerk.user.pendingEmail || pendingEmail;
    feedback.textContent = "";
    emailForm.hidden = false;
    codeForm.hidden = true;
    if (pendingEmail) showPending();
    open(emailDialog);
  };
  documentObject.querySelectorAll("[data-change-email]").forEach((button) => button.addEventListener("click", openEmail));
  emailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = emailForm.querySelector('button[type="submit"]');
    button.disabled = true;
    feedback.textContent = "";
    try {
      pendingEmail = await requestEmailChange(clerk.client.auth, emailForm.elements.email.value, clerk.user.primaryEmailAddress.emailAddress, redirectUrl);
      resendAfter = Date.now() + 60_000;
      showPending();
    } catch (error) { feedback.textContent = error.message; }
    finally { button.disabled = false; }
  });
  codeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = codeForm.querySelector('button[type="submit"]');
    button.disabled = true;
    feedback.textContent = "";
    try {
      const complete = await verifyEmailChange(clerk.client.auth, codeForm.elements.recipient.value, codeForm.elements.code.value, pendingEmail);
      if (complete) {
        pendingEmail = "";
        codeForm.hidden = true;
        feedback.textContent = "Email updated. Use your new email next time you sign in.";
        documentObject.querySelector("[data-account-profile-email]").textContent = clerk.user.primaryEmailAddress.emailAddress;
      } else {
        feedback.textContent = "Code accepted. Now enter the code sent to your other email address.";
        codeForm.elements.recipient.selectedIndex = codeForm.elements.recipient.selectedIndex === 0 ? 1 : 0;
        codeForm.elements.code.value = "";
        codeForm.elements.code.focus();
      }
    } catch (error) { feedback.textContent = error.message; }
    finally { button.disabled = false; }
  });
  documentObject.querySelector("[data-email-resend]")?.addEventListener("click", async (event) => {
    if (Date.now() < resendAfter) {
      feedback.textContent = "Please wait a minute before requesting new codes.";
      return;
    }
    event.target.disabled = true;
    try {
      const result = await clerk.client.auth.updateUser({ email: pendingEmail }, { emailRedirectTo: redirectUrl });
      if (result.error) throw result.error;
      resendAfter = Date.now() + 60_000;
      feedback.textContent = "New confirmation emails sent. Use the latest emails.";
      showPending();
    } catch (error) { feedback.textContent = error.message; }
    finally { event.target.disabled = false; }
  });
  documentObject.querySelector("[data-email-edit]")?.addEventListener("click", () => {
    emailForm.hidden = false;
    codeForm.hidden = true;
    feedback.textContent = "";
  });
  clerk.addListener(({ user }) => {
    if (!pendingEmail || user?.primaryEmailAddress?.emailAddress?.toLowerCase() !== pendingEmail.toLowerCase()) return;
    pendingEmail = "";
    emailForm.hidden = true;
    codeForm.hidden = true;
    feedback.textContent = "Email updated. Use your new email next time you sign in.";
    documentObject.querySelector("[data-account-profile-email]").textContent = user.primaryEmailAddress.emailAddress;
  });
  documentObject.querySelectorAll("[data-delete-account]").forEach((button) => {
    button.hidden = clerk.kind !== "supabase";
    button.addEventListener("click", () => {
      close(documentObject.querySelector("#account-details-dialog"));
      deleteForm.reset();
      deleteError.textContent = "";
      open(deleteDialog);
    });
  });
  deleteForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (deleteForm.elements.confirmation.value !== "DELETE") {
      deleteError.textContent = "Type DELETE to confirm account deletion.";
      return;
    }
    const buttons = [...deleteDialog.querySelectorAll("button")];
    buttons.forEach((button) => { button.disabled = true; });
    deleteError.textContent = "";
    let deleted = false;
    const preventClose = (event) => event.preventDefault();
    deleteDialog.addEventListener("cancel", preventClose);
    try {
      beforeDelete();
      const result = await requestDelete();
      if (result.deleted !== true) throw new Error("Could not confirm deletion. Please try again.");
      deleted = true;
      try { clearDeletedAccountStorage(browserStorage, userIds); } catch { /* Storage may be disabled. */ }
      try { await clerk.signOut(); } catch { /* The auth user may already be gone. */ }
      clerk.forgetDeletedSession?.();
      deleteForm.hidden = true;
      deleteError.textContent = result.authDeletionPending
        ? "Your account and progress have been removed. Sign-in removal is queued and will finish automatically."
        : "Your account has been deleted.";
      const done = documentObject.createElement("button");
      done.type = "button";
      done.className = "button";
      done.textContent = "Return to game";
      done.addEventListener("click", () => window.location.reload());
      deleteDialog.append(done);
    } catch (error) {
      afterDeleteFailure();
      deleteError.textContent = error.message;
    } finally {
      if (!deleted) {
        buttons.forEach((button) => { button.disabled = false; });
        deleteDialog.removeEventListener("cancel", preventClose);
      }
    }
  });
}
