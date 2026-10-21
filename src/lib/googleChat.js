// Posts a message to the team's Google Chat space through an incoming webhook
// (GOOGLE_CHAT_WEBHOOK_URL). People are @-mentioned with Google Chat's
// <users/ID> syntax, using the IDs stored in the chat_members table (keyed by
// work email). Never throws — callers decide what a failed post means.

// Chat user IDs for these emails (unknown emails are skipped).
export async function getChatIdsForEmails(db, emails) {
  const wanted = [...new Set((emails || []).map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return [];
  const ph = wanted.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT chat_user_id FROM chat_members WHERE lower(email) IN (${ph})`).all(...wanted);
  return rows.map((r) => r.chat_user_id);
}

export async function postToGoogleChat(text, mentionIds = []) {
  const url = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  if (!url) return { ok: false, error: 'Google Chat webhook is not configured' };
  const mentions = mentionIds.map((id) => `<users/${id}>`).join(' ');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ text: mentions ? `${mentions} ${text}` : text }),
    });
    if (!res.ok) return { ok: false, error: `Google Chat responded ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
