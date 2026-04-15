//
// Storage layer wrappers around chrome.storage APIs.
//

const DEFAULT_SETTINGS = Object.freeze({
  show_translation: false,
  translation_language: "en",
  translation_identifier: "en.ahmedali",
  recitation: "ar.alafasy",
  show_top_sites: true,
  show_athkar: true,
  show_date: true,
  calendar_start_day: "Monday",
  removed_top_sites: [],
  show_prayer_times: true,
  prayer_times_method: 0,
  prayer_times_format: 24,
  should_refresh: true,
  show_search: true,
  favorite_verses: [],
  background_image_type: "default",
  background_image_type_options: "",
  theme_preset: "emerald",
  accent_color: "#2e8b57",
  card_opacity: 78,
  background_dimness: 52,
  verse_font_size: 30,
  show_bismillah: true
});

function storageGet(area, keys) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      resolve(result);
    });
  });
}

function storageSet(area, values) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].set(values, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      resolve();
    });
  });
}

function storageRemove(area, keys) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      resolve();
    });
  });
}

function storageClear(area) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].clear(() => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      resolve();
    });
  });
}

export async function getSettings(keys = null) {
  if (keys) {
    return storageGet("sync", keys);
  }

  return storageGet("sync", DEFAULT_SETTINGS);
}

// Persists user settings to chrome.storage.sync.
export async function saveSettings(settings) {
  return storageSet("sync", settings);
}

// Reads cached content from chrome.storage.local.
export async function getCache(keys = null) {
  const cache = await storageGet("local", keys);
  if (typeof keys === "string") {
    return cache[keys];
  }

  return cache;
}

// Writes cached content to chrome.storage.local.
export async function setCache(keyOrValues, value) {
  if (typeof keyOrValues === "string") {
    return storageSet("local", { [keyOrValues]: value });
  }

  return storageSet("local", keyOrValues);
}

// Clears all cache or selected cache keys from chrome.storage.local.
export async function clearCache(keys = null) {
  if (!keys) {
    return storageClear("local");
  }

  return storageRemove("local", keys);
}
