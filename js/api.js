//
// API layer for remote and local data sources.
//

const ALQURAN_API_BASE = "https://api.alquran.cloud/v1";
const ALADHAN_API_BASE = "https://api.aladhan.com/v1";
const DEFAULT_UNSPLASH_COLLECTION_ID = "4331244";

const inflightRequests = new Map();

function runDeduped(key, requestFn) {
  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const request = requestFn().finally(() => inflightRequests.delete(key));
  inflightRequests.set(key, request);
  return request;
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

export function getRandomVerseNumber() {
  return Math.floor(Math.random() * 6236) + 1;
}

// Fetches Quran verse text + recitation URL for a specific ayah number.
export async function fetchVerse({ verseNumber, recitation = "ar.alafasy" } = {}) {
  const selectedVerse = verseNumber || getRandomVerseNumber();
  const requestKey = `verse:${selectedVerse}:${recitation}`;

  return runDeduped(requestKey, async () => {
    try {
      const editionId = encodeURIComponent(recitation);
      const payload = await fetchJson(
        `${ALQURAN_API_BASE}/ayah/${selectedVerse}/editions/quran-uthmani-min,${editionId}`
      );

      let verse = null;
      let audio = "";
      const editions = Array.isArray(payload?.data) ? payload.data : [];
      for (const item of editions) {
        if (item?.audio) {
          audio = item.audio;
          continue;
        }

        if (item?.edition?.type === "quran") {
          verse = item;
        }
      }

      if (!verse) {
        throw new Error("Verse payload does not include Quran text.");
      }

      return { verse, audio, verseNumber: selectedVerse };
    } catch (error) {
      console.error("fetchVerse failed:", error);
      throw error;
    }
  });
}

// Fetches verse translation for a specific ayah and translation identifier.
export async function fetchTranslation({ verseNumber, translationIdentifier } = {}) {
  if (!translationIdentifier) {
    return null;
  }

  const requestKey = `translation:${verseNumber}:${translationIdentifier}`;
  return runDeduped(requestKey, async () => {
    try {
      const identifier = encodeURIComponent(translationIdentifier);
      const payload = await fetchJson(`${ALQURAN_API_BASE}/ayah/${verseNumber}/${identifier}`);
      return payload?.data || null;
    } catch (error) {
      console.error("fetchTranslation failed:", error);
      throw error;
    }
  });
}

// Fetches monthly prayer times calendar for given coordinates.
export async function fetchPrayerTimes({
  latitude,
  longitude,
  month,
  year,
  method = 0
} = {}) {
  const requestKey = `prayer:${latitude}:${longitude}:${month}:${year}:${method}`;
  return runDeduped(requestKey, async () => {
    try {
      const search = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        month: String(month),
        year: String(year),
        method: String(method)
      });
      const payload = await fetchJson(`${ALADHAN_API_BASE}/calendar?${search.toString()}`);
      return Array.isArray(payload?.data) ? payload.data : [];
    } catch (error) {
      console.error("fetchPrayerTimes failed:", error);
      throw error;
    }
  });
}

// Fetches a background image URL from configured source.
export async function fetchImage({
  type = "default",
  option = "",
  width = window.innerWidth,
  height = window.innerHeight
} = {}) {
  if (type === "single_image" && option) {
    return option;
  }

  const collectionId =
    type === "unsplash_collection" && option ? option : DEFAULT_UNSPLASH_COLLECTION_ID;
  const normalizedWidth = Math.max(1, Math.floor(width));
  const normalizedHeight = Math.max(1, Math.floor(height));
  const requestUrl = `https://source.unsplash.com/collection/${collectionId}/${normalizedWidth}x${normalizedHeight}`;
  const requestKey = `image:${requestUrl}`;

  return runDeduped(requestKey, async () => {
    try {
      const response = await fetch(requestUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Image request failed with status ${response.status}.`);
      }

      return response.url;
    } catch (error) {
      console.error("fetchImage failed:", error);
      throw error;
    }
  });
}

// Fetches Gregorian-to-Hijri calendar for a month.
export async function fetchCalendar({ month, year } = {}) {
  const requestKey = `calendar:${month}:${year}`;
  return runDeduped(requestKey, async () => {
    try {
      const payload = await fetchJson(`${ALADHAN_API_BASE}/gToHCalendar/${month}/${year}`);
      return Array.isArray(payload?.data) ? payload.data : [];
    } catch (error) {
      console.error("fetchCalendar failed:", error);
      throw error;
    }
  });
}

// Loads athkar list from bundled JSON file.
export async function fetchAthkar() {
  const requestKey = "athkar";
  return runDeduped(requestKey, async () => {
    try {
      const payload = await fetchJson("/js/json/athkar.json");
      return Array.isArray(payload?.athkar) ? payload.athkar : [];
    } catch (error) {
      console.error("fetchAthkar failed:", error);
      throw error;
    }
  });
}
