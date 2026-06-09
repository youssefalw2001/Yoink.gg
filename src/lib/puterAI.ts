/**
 * YOINK.GG — Puter.js AI Image Service
 *
 * Zero cost to the developer. Users pay from their own Puter accounts.
 * No API keys, no backend, no servers.
 *
 * Models used:
 *   flux-1.1-pro   — highest quality, king cards + win reveal (~4–8s)
 *   flux-schnell   — fast generation, real-time previews (~1–2s)
 *   flux-2-pro     — banner art, shop backgrounds (~6–10s)
 *
 * Caching: localStorage keyed by wallet+type so each image
 * only generates once per wallet, ever.
 */

declare global {
  interface Window {
    puter: {
      ai: {
        txt2img: (
          prompt: string,
          options?: {
            model?: string;
            width?: number;
            height?: number;
            steps?: number;
            seed?: number;
            disable_safety_checker?: boolean;
            image_url?: string;
          },
        ) => Promise<HTMLImageElement>;
      };
    };
  }
}

/** Check if Puter.js is loaded */
function isPuterReady(): boolean {
  return typeof window !== "undefined" && typeof window.puter !== "undefined";
}

/** Convert Puter's HTMLImageElement to a blob URL we can store/reuse */
async function imgElementToDataUrl(img: HTMLImageElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width  = img.naturalWidth  || img.width  || 512;
    canvas.height = img.naturalHeight || img.height || 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) { reject(new Error("no canvas context")); return; }
    img.crossOrigin = "anonymous";
    if (img.complete) {
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/webp", 0.9));
    } else {
      img.onload  = () => { ctx.drawImage(img, 0, 0); resolve(canvas.toDataURL("image/webp", 0.9)); };
      img.onerror = reject;
    }
  });
}

// ─── Cache ────────────────────────────────────────────────────────────────────
const MEM: Map<string, string> = new Map();
const LS_PREFIX = "yoink_ai_v1_";
const LS_MAX    = 40; // max localStorage entries

function lsGet(key: string): string | null {
  try { return localStorage.getItem(LS_PREFIX + key); } catch { return null; }
}
function lsSet(key: string, val: string): void {
  try {
    // Evict oldest if at capacity
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(LS_PREFIX));
    if (keys.length >= LS_MAX) localStorage.removeItem(keys[0]);
    localStorage.setItem(LS_PREFIX + key, val);
  } catch { /* storage full */ }
}

/** Get from cache (memory → localStorage → null) */
function fromCache(key: string): string | null {
  if (MEM.has(key)) return MEM.get(key)!;
  const stored = lsGet(key);
  if (stored) { MEM.set(key, stored); return stored; }
  return null;
}

/** Save to both caches */
function toCache(key: string, url: string): void {
  MEM.set(key, url);
  lsSet(key, url);
}

// ─── Generation queue — prevents parallel calls for same key ─────────────────
const PENDING: Map<string, Promise<string>> = new Map();

async function generate(
  cacheKey: string,
  prompt:   string,
  model:    string,
  width  = 512,
  height = 512,
): Promise<string> {
  // Return cached immediately
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  // Return in-flight promise if already generating this key
  if (PENDING.has(cacheKey)) return PENDING.get(cacheKey)!;

  if (!isPuterReady()) throw new Error("Puter.js not loaded");

  const p = (async () => {
    const img = await window.puter.ai.txt2img(prompt, {
      model,
      width,
      height,
      disable_safety_checker: true,
    });
    // Try to convert to data URL for caching; fall back to src
    let url: string;
    try {
      url = await imgElementToDataUrl(img);
    } catch {
      url = img.src;
    }
    toCache(cacheKey, url);
    PENDING.delete(cacheKey);
    return url;
  })();

  PENDING.set(cacheKey, p);
  return p;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a unique king portrait for a wallet address.
 * Uses wallet prefix as a seed so the same wallet always gets
 * a visually consistent character.
 * Model: flux-schnell (fast, cheap, good enough for 80×80 avatars)
 */
export async function generateKingPortrait(wallet: string): Promise<string> {
  const short  = wallet === "You" ? "hero" : wallet.slice(0, 8);
  const cacheKey = `king_${short}`;

  // Deterministic style from wallet chars
  const styles = [
    "dark medieval king, glowing purple eyes, phantom aura",
    "battle-scarred warlord, gold crown, blood red cloak",
    "masked phantom king, void black armor, neon gold trim",
    "ancient crypto emperor, obsidian crown, electric blue eyes",
    "rogue bandit king, torn cloak, daggers, gold coins",
  ];
  const styleIdx = wallet === "You"
    ? 0
    : wallet.charCodeAt(0) % styles.length;

  const prompt = `
    ${styles[styleIdx]},
    dramatic portrait, void black background, 
    gold and purple neon lighting, ultra detailed face,
    cinematic, dark fantasy, 8K, square format
  `.trim();

  return generate(cacheKey, prompt, "black-forest-labs/flux-schnell", 512, 512);
}

/**
 * Generate the win reveal hero image.
 * Model: flux-1.1-pro — best quality for this important moment.
 */
export async function generateWinRevealArt(
  solAmount: number,
  isYou: boolean,
): Promise<string> {
  const cacheKey = `win_${isYou ? "you" : "other"}_${Math.round(solAmount)}`;

  const prompt = isYou
    ? `
        victorious degen holding massive glowing gold bag, 
        coins raining from above, dark void background, 
        purple and gold light rays, cinematic triumph, 
        dramatic lighting, ultra detailed, photorealistic, 4K
      `.trim()
    : `
        dark medieval king on throne of gold coins, 
        crown glowing, void background, purple aura, 
        coins piled around, cinematic wide shot, 
        ultra detailed, dark fantasy, 4K
      `.trim();

  return generate(cacheKey, prompt, "black-forest-labs/flux-1.1-pro", 768, 512);
}

/**
 * Generate shop item art for a given item ID.
 * Model: flux-schnell — fast, affordable for shop cards.
 */
export async function generateShopItemArt(itemId: string, itemName: string): Promise<string> {
  const cacheKey = `shop_${itemId}`;

  const PROMPTS: Record<string, string> = {
    display_name:      "gold nameplate with glowing inscription, dark void, fantasy",
    theme_blood:       "blood red crystals and dark liquid, void background, dramatic",
    theme_phantom:     "purple phantom energy swirling, void black, mystical glow",
    crown_animated:    "spinning golden crown, jewels, dark background, luxury",
    flame_blue:        "ice blue flame particles, dark void, magical energy",
    flame_rainbow:     "rainbow flame particles swirling, dark background, vibrant",
    early_warning:     "warning bell glowing gold, dark void, alert energy",
    cooldown_reducer:  "hourglass with lightning, dark background, speed energy",
    timer_freeze:      "frozen time crystal, ice blue, void background, dramatic",
    bag_bomb:          "explosive gold bag, coins flying, dark void, dramatic",
    kings_pass_monthly:"VIP gold card, crown emblem, dark luxury background",
    founding_king_nft: "ultra rare golden crown NFT, jewels, void, 8K ultra detail",
  };

  const prompt = PROMPTS[itemId]
    ?? `${itemName}, dark crypto aesthetic, void black background, gold accents, ultra detailed`;

  return generate(cacheKey, prompt, "black-forest-labs/flux-schnell", 512, 512);
}

/**
 * Generate a hero banner background for the leaderboard / OG image.
 * Model: flux-2-pro — maximum quality for the main marketing image.
 */
export async function generateHeroBannerArt(): Promise<string> {
  const cacheKey = "hero_banner_v2";

  const prompt = `
    YOINK.GG dark medieval crypto game banner, 
    single throne in the center with glowing crown hovering above it,
    gold coins scattered on void black ground,
    purple and gold neon atmospheric lighting,
    dramatic wide shot, cinematic, ultra detailed, 4K, 16:9 aspect ratio
  `.trim();

  return generate(cacheKey, prompt, "black-forest-labs/flux-2-pro", 1280, 720);
}

/** Clear all cached images (useful for debugging) */
export function clearArtCache(): void {
  MEM.clear();
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* */ }
}

/** Check if a specific image is already cached */
export function isArtCached(key: string): boolean {
  return fromCache(key) !== null;
}
