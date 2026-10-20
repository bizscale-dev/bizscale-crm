// Posts a message to the team's Google Chat space through an incoming webhook
// (GOOGLE_CHAT_WEBHOOK_URL). The admin is @-mentioned with Google Chat's
// <users/ID> syntax. Never throws — callers decide what a failed post means.
const ADMIN_CHAT_USER_ID = process.env.GOOGLE_CHAT_ADMIN_USER_ID || 'puFXFqAAAAE';

export async function notifyAdminOnGoogleChat(text) {
  const url = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  if (!url) return { ok: false, error: 'Google Chat webhook is not configured' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ text: `<users/${ADMIN_CHAT_USER_ID}> ${text}` }),
    });
    if (!res.ok) return { ok: false, error: `Google Chat responded ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
