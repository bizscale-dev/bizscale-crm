// Helpers for forms that take several pictures (task proof, report fixes). Pictures travel as image
// data URLs (the browser shrinks them first, see MultiImagePicker) and are stored as a JSON array.
export const MAX_IMAGES = 6;
const MAX_ONE = 2 * 1024 * 1024 * 1.37; // ~2MB of image bytes, in base64
const MAX_TOTAL = 9 * 1024 * 1024; // all pictures of one submission together

/** Checks a list of data URLs. Returns { images } (cleaned array, maybe empty) or { error }. */
export function validateImages(input) {
  if (input == null || input === '') return { images: [] };
  const list = Array.isArray(input) ? input : [input];
  if (list.length > MAX_IMAGES) return { error: `At most ${MAX_IMAGES} pictures` };
  let total = 0;
  for (const img of list) {
    if (typeof img !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(img)) return { error: 'A picture looks invalid — try attaching it again' };
    if (img.length > MAX_ONE) return { error: 'A picture is too large (max 2MB each)' };
    total += img.length;
  }
  if (total > MAX_TOTAL) return { error: 'The pictures are too large together — remove one' };
  return { images: list };
}

/** Parses a stored JSON array of images; anything unreadable gives []. */
export function parseImages(text) {
  if (!text) return [];
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Number of pictures in a stored JSON array, without loading them (for list pages). */
export const IMAGE_COUNT_SQL = (col) => `CASE WHEN ${col} IS NULL OR ${col} = '' THEN 0 ELSE json_array_length(${col}) END`;

/** A data URL as an image HTTP response. */
export function imageResponse(dataUrl) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(dataUrl || '');
  if (!m) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(m[2], 'base64'), {
    headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=86400' },
  });
}

/** URLs of all pictures of a task proof: the first one, then ?i=1.. for the extras. */
export function proofUrls(base, id, hasFirst, extraCount) {
  if (!hasFirst) return [];
  const urls = [`${base}/${id}`];
  for (let i = 1; i <= (extraCount || 0); i++) urls.push(`${base}/${id}?i=${i}`);
  return urls;
}
