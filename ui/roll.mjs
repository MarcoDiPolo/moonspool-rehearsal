export const cabinet = "https://marcodipolo.github.io/moonspool-cabinet/";
export const moonrise = "ASQBAAIABAAFAAgACQAQABEA";
export const pitches = ["A3", "C4", "D4", "E4", "G4"];
export const midi = [57, 60, 62, 64, 67];

export function readRoll(input) {
  let token = String(input).trim();
  if (token.includes("://")) {
    const url = new URL(token);
    if (url.origin + url.pathname !== cabinet || url.username || url.password || url.search) {
      throw new Error("Use a Moonspool Cabinet share link or paste its roll code.");
    }
    token = url.hash;
  }
  token = token.replace(/^#/, "");
  if (!/^[\w-]{24}$/.test(token)) throw new Error("A roll code contains exactly 24 characters.");
  const bytes = Uint8Array.from(atob(token.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
  const masks = Array.from(bytes.subarray(2));
  if (bytes[0] !== 1) throw new Error("This stand reads Moonspool Cabinet version 1 rolls.");
  if (bytes[1] > 90 || masks.some(mask => mask > 31)) throw new Error("This roll contains an invalid tempo or note.");
  return {token, bpm: 60 + bytes[1], masks};
}

export function notes(mask) {
  return pitches.filter((_, index) => mask & (1 << index));
}
