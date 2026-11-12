// The optional picture on an assigned task: a data URL up to ~2MB. Re-validated on the server — the browser
// check alone is never trusted. Returns { value } (null when there is none) or { error }.
export function readAttachment(formData) {
  const attachment = (formData.get('attachment') || '').toString();
  if (!attachment) return { value: null };
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(attachment)) return { error: 'The image looks invalid — try attaching it again' };
  if (attachment.length > 2 * 1024 * 1024 * 1.37) return { error: 'The image is too large (max 2MB)' };
  return { value: attachment };
}
