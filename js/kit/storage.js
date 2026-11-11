// Safe local storage. It can be missing or throw (private mode, blocked storage, embedded frames),
// so every call is wrapped and the games work without it.
const PREFIX = "llplay:";

export function load(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
