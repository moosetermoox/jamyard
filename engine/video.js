// YouTube URL → embed URL resolver.
//
// Teachers paste a normal YouTube link into a phase's `video` field. The
// runtime turns it into an embeddable URL (https://www.youtube.com/embed/<id>)
// that the host screen drops into an <iframe>. Returns null for anything that
// isn't a recognizable YouTube link, so an unparseable value never renders a
// broken player.

const ID = '([A-Za-z0-9_-]{11})';
const ID_PATTERNS = [
  new RegExp('youtube\\.com\\/watch\\?(?:.*&)?v=' + ID),
  new RegExp('youtu\\.be\\/' + ID),
  new RegExp('youtube\\.com\\/embed\\/' + ID),
  new RegExp('youtube\\.com\\/shorts\\/' + ID),
  new RegExp('youtube\\.com\\/live\\/' + ID)
];

function extractId(url) {
  for (const re of ID_PATTERNS) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

// Parse a YouTube start offset from `t=` / `start=` (e.g. "90" or "1m30s").
function extractStartSeconds(url) {
  const m = url.match(/[?&](?:start|t)=([0-9hms]+)/i);
  if (!m) return null;
  const raw = m[1];
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return n > 0 ? n : null;
  }
  const h = (raw.match(/(\d+)h/) || [])[1] || 0;
  const mi = (raw.match(/(\d+)m/) || [])[1] || 0;
  const s = (raw.match(/(\d+)s/) || [])[1] || 0;
  const total = parseInt(h, 10) * 3600 + parseInt(mi, 10) * 60 + parseInt(s, 10);
  return total > 0 ? total : null;
}

export function resolveVideoEmbed(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const id = extractId(trimmed);
  if (!id) return null;
  let embed = `https://www.youtube.com/embed/${id}`;
  const start = extractStartSeconds(trimmed);
  if (start) embed += `?start=${start}`;
  return embed;
}
