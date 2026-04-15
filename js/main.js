//
// Entry point: orchestrates API, storage, and UI modules.
//

import {
  fetchAthkar,
  fetchCalendar,
  fetchImage,
  fetchPrayerTimes,
  fetchTranslation,
  fetchVerse,
  getRandomVerseNumber
} from "./api.js";
import { getCache, getSettings, saveSettings, setCache } from "./storage.js";
import {
  confirmTopSiteRemoval,
  hideAthkar,
  hidePrayerTimes,
  hideTranslation,
  initializeUI,
  renderAthkar,
  renderBackgroundImage,
  renderCalendar,
  renderDates,
  renderFavorites,
  renderPrayerTimes,
  renderSearchBar,
  renderTopSites,
  renderTranslation,
  renderVerse,
  setAudioState,
  setCalendarLoading,
  setFavoriteState,
  setReloadState,
  showFavoriteToast,
  showUpdateModal,
  showUpdateToast
} from "./ui.js";

const HOUR_MS = 60 * 60 * 1000;
const OFFLINE_IMAGE = "assets/offline-image.jpg";
const EXTENSION_URL = "https://chrome.google.com/webstore/detail/quran-in-new-tab/hggkcijghhpkdjeokpfgbhnpecliiijg";
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HIJRI_MONTH_KEYS = [
  "Muharram",
  "Safar",
  "Rabi__al_awwal",
  "Rabi__al_thani",
  "Jumada_al_ula",
  "Jumada_al_akhirah",
  "Rajab",
  "Sha_ban",
  "Ramadan",
  "Shawwal",
  "Dhu_al_Qa_dah",
  "Dhu_al_Hijjah"
];

const state = {
  settings: null,
  cache: {},
  currentVerse: null,
  audioUrl: "",
  audio: null,
  athkar: []
};

document.addEventListener("DOMContentLoaded", () => {
  initialize().catch((error) => {
    console.error("Failed to initialize extension:", error);
    void renderBackgroundImage(OFFLINE_IMAGE);
    setReloadState(false);
  });
});

async function initialize() {
  initializeUI({
    onReload: () => {
      void handleReload();
    },
    onOpenOptions: openOptionPage,
    onRemoveTopSite: (url) => {
      void handleTopSiteRemoval(url);
    },
    onRemoveFavorite: (index) => {
      void handleFavoriteRemoval(index);
    },
    onUpdateExtension: () => chrome.runtime.reload(),
    onToggleFavorite: () => {
      void toggleFavorite();
    },
    onToggleAudio: () => {
      void toggleAudio();
    }
  });

  const [settings, cache] = await Promise.all([getSettings(), getCache()]);
  state.settings = settings;
  state.cache = cache || {};

  applySettingsToStaticUI();
  renderFavorites(state.settings.favorite_verses || []);
  showPendingUpdateMessage();

  await renderCachedContent();
  await loadTopSites();
  await loadAthkar();

  chrome.runtime.onUpdateAvailable.addListener(() => {
    showUpdateToast();
  });

  // Cached data is shown first; network refresh runs in the background.
  void refreshContent({ force: false });
}

// Applies static visibility/configuration settings that do not require network data.
function applySettingsToStaticUI() {
  if (state.settings.show_search !== false) {
    renderSearchBar();
  }

  if (state.settings.show_date !== false) {
    renderDates(new Date(), moment(), HIJRI_MONTH_KEYS);
  }

  if (!state.settings.show_translation || !state.settings.translation_identifier) {
    hideTranslation();
  }

  if (state.settings.show_prayer_times === false) {
    hidePrayerTimes();
  }

  if (state.settings.show_athkar === false) {
    hideAthkar();
  }
}

// Renders cached content immediately for fast first paint.
async function renderCachedContent() {
  const favorites = state.settings.favorite_verses || [];

  if (state.cache.image?.src) {
    await renderBackgroundImage(state.cache.image.src);
  }

  if (state.cache.verse?.data) {
    state.currentVerse = state.cache.verse.data;
    state.audioUrl = state.cache.verse.audio || "";
    state.audio = null;
    renderVerse(state.currentVerse, {
      extensionUrl: EXTENSION_URL,
      isFavorite: isFavorite(state.currentVerse, favorites)
    });
    setAudioState({ mode: "play" });

    if (state.settings.show_translation && state.settings.translation_identifier) {
      renderTranslation(state.cache.verse.translation || null);
    }
  }

  if (isCurrentMonthCalendar(state.cache.calendar)) {
    const weekdays = getCalendarWeekdays();
    renderCalendar({
      data: state.cache.calendar.data,
      weekdays,
      currentHijriMonths: state.cache.calendar.hijriMonths || []
    });
  } else {
    setCalendarLoading(true);
  }

  if (state.settings.show_prayer_times !== false && isCurrentPrayerMonth(state.cache.prayerTimesCalendar)) {
    renderPrayerTimesFromCalendar(state.cache.prayerTimesCalendar.calendar);
  }

  setReloadState(false);
}

// Refreshes stale or force-refreshed content without blocking initial cached render.
async function refreshContent({ force }) {
  if (!navigator.onLine) {
    handleOfflineFallback();
    return;
  }

  const shouldRefreshEveryTab = Boolean(state.settings.should_refresh);
  const shouldRefreshImage = force || shouldRefreshEveryTab || !isFreshTimedCache(state.cache.image);
  const shouldRefreshVerse = force || shouldRefreshEveryTab || !isFreshTimedCache(state.cache.verse);
  const shouldRefreshCalendar = force || !isCurrentMonthCalendar(state.cache.calendar);
  const shouldRefreshPrayerTimes =
    state.settings.show_prayer_times !== false &&
    (force || !isCurrentPrayerMonth(state.cache.prayerTimesCalendar));

  const tasks = [];
  if (shouldRefreshImage) {
    tasks.push(refreshImage());
  }
  if (shouldRefreshVerse) {
    tasks.push(refreshVerseAndTranslation());
  }
  if (shouldRefreshCalendar) {
    tasks.push(refreshCalendarData());
  }
  if (shouldRefreshPrayerTimes) {
    tasks.push(refreshPrayerTimesData());
  }

  if (!tasks.length) {
    return;
  }

  setReloadState(true);
  await Promise.allSettled(tasks);
  setReloadState(false);
}

// Fetches and caches the background image according to user preferences.
async function refreshImage() {
  try {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * devicePixelRatio);
    const height = Math.round(window.innerHeight * devicePixelRatio);
    const imageUrl = await fetchImage({
      type: state.settings.background_image_type,
      option: state.settings.background_image_type_options,
      width,
      height
    });

    await renderBackgroundImage(imageUrl, OFFLINE_IMAGE);
    const imageCache = {
      src: imageUrl,
      timeout: Date.now() + HOUR_MS
    };
    await setCache("image", imageCache);
    state.cache.image = imageCache;
  } catch (error) {
    console.error("Image refresh failed:", error);
    if (!state.cache.image?.src) {
      await renderBackgroundImage(OFFLINE_IMAGE);
    }
  }
}

// Fetches a random verse (plus optional translation), then updates cache and UI.
async function refreshVerseAndTranslation() {
  try {
    const verseNumber = getRandomVerseNumber();
    const versePayload = await fetchVerse({
      verseNumber,
      recitation: state.settings.recitation || "ar.alafasy"
    });

    let translation = null;
    if (state.settings.show_translation && state.settings.translation_identifier) {
      translation = await fetchTranslation({
        verseNumber,
        translationIdentifier: state.settings.translation_identifier
      });
    }

    state.currentVerse = versePayload.verse;
    state.audioUrl = versePayload.audio || "";
    state.audio = null;

    const favorites = state.settings.favorite_verses || [];
    renderVerse(state.currentVerse, {
      extensionUrl: EXTENSION_URL,
      isFavorite: isFavorite(state.currentVerse, favorites)
    });
    setAudioState({ mode: "play" });

    if (translation) {
      renderTranslation(translation);
    } else {
      hideTranslation();
    }

    const verseCache = {
      data: versePayload.verse,
      audio: versePayload.audio || "",
      translation,
      timeout: Date.now() + HOUR_MS
    };
    await setCache("verse", verseCache);
    state.cache.verse = verseCache;
  } catch (error) {
    console.error("Verse refresh failed:", error);
    if (!state.currentVerse) {
      state.currentVerse = getDefaultVerse();
      renderVerse(state.currentVerse, {
        extensionUrl: EXTENSION_URL,
        isFavorite: isFavorite(state.currentVerse, state.settings.favorite_verses || [])
      });
      hideTranslation();
      setAudioState({ mode: "error", errorMessage: "Can't connect." });
    }
  }
}

// Retrieves and renders the Gregorian/Hijri calendar for the current month.
async function refreshCalendarData() {
  setCalendarLoading(true);
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const calendarData = await fetchCalendar({ month, year });
    const hijriMonths = extractHijriMonths(calendarData);
    const weekdays = getCalendarWeekdays();

    renderCalendar({
      data: calendarData,
      weekdays,
      currentHijriMonths: hijriMonths
    });

    const calendarCache = {
      date: now.toISOString(),
      data: calendarData,
      hijriMonths
    };
    await setCache("calendar", calendarCache);
    state.cache.calendar = calendarCache;
  } catch (error) {
    console.error("Calendar refresh failed:", error);
    setCalendarLoading(false);
  }
}

// Retrieves prayer times for the current location and month.
async function refreshPrayerTimesData() {
  try {
    const position = await getCurrentPosition();
    const now = new Date();
    const prayerTimesCalendar = await fetchPrayerTimes({
      longitude: position.coords.longitude,
      latitude: position.coords.latitude,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      method: Number(state.settings.prayer_times_method || 0)
    });

    const cachePayload = {
      month: now.getMonth(),
      year: now.getFullYear(),
      calendar: prayerTimesCalendar
    };
    await setCache("prayerTimesCalendar", cachePayload);
    state.cache.prayerTimesCalendar = cachePayload;
    renderPrayerTimesFromCalendar(prayerTimesCalendar);
  } catch (error) {
    console.error("Prayer times refresh failed:", error);
  }
}

function renderPrayerTimesFromCalendar(calendar) {
  if (!Array.isArray(calendar)) {
    return;
  }

  const today = new Date();
  const todayMoment = moment();
  const todayData = calendar.find((dateData) => Number.parseInt(dateData?.date?.gregorian?.day, 10) === today.getDate());
  if (!todayData?.timings) {
    return;
  }

  const fajr = formatPrayerTime(todayData.timings.Fajr);
  const dhuhr = formatPrayerTime(todayData.timings.Dhuhr);
  const asr = formatPrayerTime(todayData.timings.Asr);
  const maghrib = formatPrayerTime(todayData.timings.Maghrib);
  const isha = formatPrayerTime(todayData.timings.Isha);

  const prayers = [
    { key: "fajr", time: fajr },
    { key: "dhuhr", time: dhuhr },
    { key: "asr", time: asr },
    { key: "maghrib", time: maghrib },
    { key: "isha", time: isha }
  ];
  const format = getPrayerTimeFormat();
  let nextPrayerText = "";

  for (const prayer of prayers) {
    const prayerMoment = moment(prayer.time, format)
      .year(todayMoment.year())
      .month(todayMoment.month())
      .date(todayMoment.date());
    if (todayMoment.isBefore(prayerMoment)) {
      nextPrayerText = `${chrome.i18n.getMessage(prayer.key)} ${todayMoment.to(prayerMoment)}`;
      break;
    }
  }

  renderPrayerTimes({ fajr, dhuhr, asr, maghrib, isha, nextPrayerText });
}

async function loadTopSites() {
  if (state.settings.show_top_sites === false) {
    renderTopSites([]);
    return;
  }

  try {
    const topSites = await getTopSites();
    const removedTopSites = state.settings.removed_top_sites || [];
    const visibleTopSites = topSites.filter((site) => !removedTopSites.includes(site.url));
    renderTopSites(visibleTopSites);
  } catch (error) {
    console.error("Failed to load top sites:", error);
  }
}

async function loadAthkar() {
  if (state.settings.show_athkar === false) {
    hideAthkar();
    return;
  }

  try {
    if (!state.athkar.length) {
      state.athkar = await fetchAthkar();
    }

    if (!state.athkar.length) {
      return;
    }

    const randomIndex = Math.floor(Math.random() * state.athkar.length);
    renderAthkar(state.athkar[randomIndex]);
  } catch (error) {
    console.error("Failed to load athkar:", error);
  }
}

async function handleReload() {
  await refreshContent({ force: true });
  await loadAthkar();
}

async function handleTopSiteRemoval(url) {
  if (!url) {
    return;
  }

  const shouldRemove = await confirmTopSiteRemoval();
  if (!shouldRemove) {
    return;
  }

  const removed = new Set(state.settings.removed_top_sites || []);
  removed.add(url);
  const removedTopSites = Array.from(removed);
  await persistSettings({ removed_top_sites: removedTopSites });
  await loadTopSites();
}

async function handleFavoriteRemoval(index) {
  const favorites = [...(state.settings.favorite_verses || [])];
  if (!Number.isInteger(index) || index < 0 || index >= favorites.length) {
    return;
  }

  const [removedVerse] = favorites.splice(index, 1);
  await persistSettings({ favorite_verses: favorites });
  renderFavorites(favorites);

  if (
    state.currentVerse &&
    removedVerse &&
    state.currentVerse.surah.number === removedVerse.surah.number &&
    state.currentVerse.numberInSurah === removedVerse.numberInSurah
  ) {
    setFavoriteState(false);
  }
}

async function toggleFavorite() {
  if (!state.currentVerse) {
    return;
  }

  const favorites = [...(state.settings.favorite_verses || [])];
  const verseIndex = favorites.findIndex(
    (verse) =>
      verse.surah.number === state.currentVerse.surah.number &&
      verse.numberInSurah === state.currentVerse.numberInSurah
  );

  let action = "added";
  if (verseIndex === -1) {
    favorites.push(state.currentVerse);
    setFavoriteState(true);
  } else {
    favorites.splice(verseIndex, 1);
    action = "removed";
    setFavoriteState(false);
  }

  await persistSettings({ favorite_verses: favorites });
  renderFavorites(favorites);
  showFavoriteToast(action);
}

async function toggleAudio() {
  if (!state.audioUrl) {
    setAudioState({ mode: "error", errorMessage: "Can't connect." });
    return;
  }

  if (!state.audio) {
    state.audio = new Audio(state.audioUrl);
    state.audio.onended = () => setAudioState({ mode: "play" });
    state.audio.onerror = () => setAudioState({ mode: "error", errorMessage: "Can't connect." });
  }

  if (state.audio.paused) {
    try {
      setAudioState({ mode: "loading" });
      await state.audio.play();
      setAudioState({ mode: "pause" });
    } catch (error) {
      console.error("Audio playback failed:", error);
      setAudioState({ mode: "error", errorMessage: "Can't connect." });
    }
    return;
  }

  state.audio.pause();
  setAudioState({ mode: "play" });
}

function openOptionPage() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
    return;
  }

  window.open(chrome.runtime.getURL("options.html"));
}

function handleOfflineFallback() {
  if (!state.cache.image?.src) {
    void renderBackgroundImage(OFFLINE_IMAGE);
  }

  if (!state.currentVerse) {
    state.currentVerse = getDefaultVerse();
    renderVerse(state.currentVerse, {
      extensionUrl: EXTENSION_URL,
      isFavorite: isFavorite(state.currentVerse, state.settings.favorite_verses || [])
    });
  }

  hideTranslation();
  setReloadState(false);
}

function showPendingUpdateMessage() {
  const update = state.settings.last_update;
  if (!update || update.shown || !update.message) {
    return;
  }

  showUpdateModal(update.message);
  void persistSettings({
    last_update: {
      ...update,
      shown: true
    }
  });
}

function persistSettings(patch) {
  state.settings = {
    ...state.settings,
    ...patch
  };
  return saveSettings(patch);
}

function getTopSites() {
  return new Promise((resolve, reject) => {
    chrome.topSites.get((topSites) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      resolve(topSites || []);
    });
  });
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not available."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      maximumAge: 10 * 60 * 1000,
      timeout: 15000
    });
  });
}

function getCalendarWeekdays() {
  const weekdays = [...WEEKDAYS];
  if (state.settings.calendar_start_day === "Sunday") {
    weekdays.unshift(weekdays.pop());
  }
  return weekdays;
}

function extractHijriMonths(calendarData) {
  const months = [];
  for (const dateData of calendarData) {
    const monthIndex = Number.parseInt(dateData?.hijri?.month?.number, 10) - 1;
    const monthKey = HIJRI_MONTH_KEYS[monthIndex];
    if (monthKey && !months.includes(monthKey)) {
      months.push(monthKey);
    }
  }
  return months;
}

function formatPrayerTime(time) {
  const normalizedTime = String(time || "").split(" ")[0];
  return moment(normalizedTime, "HH:mm").format(getPrayerTimeFormat());
}

function getPrayerTimeFormat() {
  return Number(state.settings.prayer_times_format) === 12 ? "hh:mm A" : "HH:mm";
}

function isFreshTimedCache(cacheEntry) {
  return Boolean(cacheEntry?.timeout) && Date.now() <= cacheEntry.timeout;
}

function isCurrentMonthCalendar(calendarCache) {
  if (!calendarCache?.date || !calendarCache?.data?.length) {
    return false;
  }

  const cachedDate = new Date(calendarCache.date);
  const now = new Date();
  return cachedDate.getMonth() === now.getMonth() && cachedDate.getFullYear() === now.getFullYear();
}

function isCurrentPrayerMonth(prayerCache) {
  if (!prayerCache?.calendar?.length) {
    return false;
  }

  const now = new Date();
  const isSameMonth = Number(prayerCache.month) === now.getMonth();
  const isSameYear =
    prayerCache.year === undefined ? true : Number(prayerCache.year) === now.getFullYear();
  return isSameMonth && isSameYear;
}

function isFavorite(verse, favorites) {
  return (favorites || []).some(
    (favoriteVerse) =>
      favoriteVerse.surah.number === verse.surah.number &&
      favoriteVerse.numberInSurah === verse.numberInSurah
  );
}

function getDefaultVerse() {
  return {
    edition: {
      englishName: "Simple",
      format: "text",
      identifier: "quran-simple",
      language: "ar",
      name: "Simple",
      type: "quran"
    },
    hizbQuarter: 201,
    juz: 26,
    manzil: 6,
    number: 4523,
    numberInSurah: 13,
    page: 503,
    ruku: 439,
    sajda: false,
    surah: {
      englishName: "Al-Ahqaf",
      englishNameTranslation: "The Dunes",
      name: "سورة الأحقاف",
      number: 46,
      numberOfAyahs: 35,
      revelationType: "Meccan"
    },
    text: "إِنَّ الَّذِينَ قَالُوا رَبُّنَا اللَّهُ ثُمَّ اسْتَقَامُوا فَلَا خَوْفٌ عَلَيْهِمْ وَلَا هُمْ يَحْزَنُونَ"
  };
}
