//
// UI layer for all DOM updates and event wiring.
//

const MESSAGE_REGEX = /__MSG_(\w+)__/g;

const renderState = {
  backgroundSrc: "",
  verseKey: "",
  translationKey: "",
  topSitesKey: "",
  prayerKey: "",
  calendarKey: ""
};

const APPEARANCE_PALETTES = Object.freeze({
  emerald: {
    accent: "#2e8b57"
  },
  ocean: {
    accent: "#1f7aa3"
  },
  amber: {
    accent: "#b57f1b"
  },
  rose: {
    accent: "#9a5167"
  },
  slate: {
    accent: "#4f647b"
  }
});

export function initializeUI(handlers = {}) {
  document.documentElement.setAttribute("lang", chrome.i18n.getUILanguage());
  localizeHtmlPage(document.body);
  initializeTooltips();
  initializeToasts();

  document.querySelector(".reload")?.addEventListener("click", () => {
    handlers.onReload?.();
  });

  document.querySelector(".calendar-btn")?.addEventListener("click", () => {
    toggleCalendar(true);
  });

  document.querySelector(".close-calendar")?.addEventListener("click", () => {
    toggleCalendar(false);
  });

  document.querySelector(".favorite-button")?.addEventListener("click", (event) => {
    event.preventDefault();
    handlers.onToggleFavorite?.();
  });

  document.querySelector(".audio-player")?.addEventListener("click", () => {
    handlers.onToggleAudio?.();
  });

  document.body.addEventListener("click", (event) => {
    const target = event.target;
    if (!target) {
      return;
    }

    if (target.closest(".settings-link, .notifications-reminder")) {
      event.preventDefault();
      handlers.onOpenOptions?.();
      return;
    }

    const removeTopSite = target.closest(".top-sites-container .remove");
    if (removeTopSite) {
      event.preventDefault();
      event.stopPropagation();
      const link = removeTopSite.closest("a");
      const url = link?.dataset?.url || link?.href;
      if (url) {
        handlers.onRemoveTopSite?.(url);
      }
      return;
    }

    const removeFavoriteButton = target.closest(".favorite-button-list");
    if (removeFavoriteButton) {
      event.preventDefault();
      const verseItem = removeFavoriteButton.closest(".verse");
      const index = Number(verseItem?.id?.split("_")[1]);
      if (Number.isInteger(index)) {
        handlers.onRemoveFavorite?.(index);
      }
      return;
    }

    if (target.id === "updateExtension") {
      handlers.onUpdateExtension?.();
      return;
    }

    if (target.hasAttribute("data-bs-dismiss")) {
      dismissElements(target.getAttribute("data-bs-dismiss"));
    }
  });
}

export function applyAppearanceSettings(settings = {}) {
  const paletteKey =
    typeof settings.theme_preset === "string" && APPEARANCE_PALETTES[settings.theme_preset]
      ? settings.theme_preset
      : "emerald";
  const palette = APPEARANCE_PALETTES[paletteKey];
  const customAccent = normalizeHexColor(settings.accent_color);
  const accentColor = customAccent || palette.accent;
  const accentRgb = hexToRgb(accentColor) || hexToRgb(palette.accent) || "46, 139, 87";

  document.documentElement.dataset.themePreset = paletteKey;
  document.documentElement.style.setProperty("--accent-color", accentColor);
  document.documentElement.style.setProperty("--accent-rgb", accentRgb);
  document.documentElement.style.setProperty(
    "--card-opacity",
    String(clampNumber(settings.card_opacity, 40, 96, 78) / 100)
  );
  document.documentElement.style.setProperty(
    "--background-dimness",
    String(clampNumber(settings.background_dimness, 25, 78, 52) / 100)
  );
  document.documentElement.style.setProperty(
    "--verse-font-size",
    `${clampNumber(settings.verse_font_size, 22, 48, 30)}px`
  );

  const bismillahElm = document.querySelector(".bismillah");
  if (bismillahElm) {
    bismillahElm.classList.toggle("hide", settings.show_bismillah === false);
  }
}

export function setReloadState(isLoading) {
  const icon = document.querySelector(".reload img");
  const loader = document.querySelector(".reload .loader");
  if (!icon || !loader) {
    return;
  }

  if (isLoading) {
    hideElement(icon);
    showElement(loader);
  } else {
    showElement(icon);
    hideElement(loader);
  }
}

export function setCalendarLoading(isLoading) {
  const loader = document.querySelector(".calendar-table .loader");
  const content = document.querySelector(".calendar-inner-container");
  if (!loader || !content) {
    return;
  }

  if (isLoading) {
    showElement(loader);
    hideElement(content);
  } else {
    hideElement(loader);
    showElement(content);
  }
}

export function toggleCalendar(show) {
  const container = document.querySelector(".calendar-container");
  if (!container) {
    return;
  }

  container.classList.toggle("show", Boolean(show));
}

export function renderDates(dateObj, hijriMoment, hijriMonthKeys) {
  const gregorianElm = document.querySelector(".gregorian-date");
  const hijriElm = document.querySelector(".hijri-date");
  if (!gregorianElm || !hijriElm) {
    return;
  }

  gregorianElm.textContent = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;
  const hijriMonthKey = hijriMonthKeys[hijriMoment.iMonth()];
  const monthLabel = chrome.i18n.getMessage(hijriMonthKey) || hijriMonthKey;
  hijriElm.textContent = `${hijriMoment.iDate()} ${monthLabel} ${hijriMoment.iYear()}`;
}

export function renderBackgroundImage(url, fallback = "assets/offline-image.jpg") {
  if (!url) {
    return Promise.resolve(false);
  }

  if (renderState.backgroundSrc === url) {
    return Promise.resolve(true);
  }

  const backgroundElm = document.querySelector(".background-image");
  if (!backgroundElm) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const preload = new Image();
    preload.onload = () => {
      backgroundElm.src = url;
      backgroundElm.classList.add("show");
      renderState.backgroundSrc = url;
      resolve(true);
    };
    preload.onerror = () => {
      backgroundElm.src = fallback;
      backgroundElm.classList.add("show");
      renderState.backgroundSrc = fallback;
      resolve(false);
    };
    preload.src = url;
  });
}

export function renderVerse(verse, { extensionUrl, isFavorite = false } = {}) {
  if (!verse) {
    return;
  }

  const verseKey = `${verse.surah?.number}:${verse.numberInSurah}:${verse.text}`;
  const verseTextElm = document.querySelector(".verse-text");
  const verseDetailsElm = document.querySelector(".verse-details");
  const verseElm = document.querySelector(".verse");
  if (!verseTextElm || !verseDetailsElm || !verseElm) {
    return;
  }

  if (renderState.verseKey !== verseKey) {
    verseTextElm.textContent = verse.text;
    verseDetailsElm.textContent = `${verse.surah.name}-${verse.numberInSurah}`;
    verseElm.classList.add("show");
    renderState.verseKey = verseKey;
  }

  const shareText = encodeURIComponent(`${verse.text}\n\n${verse.surah.name} - ${verse.numberInSurah}`);
  const encodedExtensionUrl = encodeURIComponent(extensionUrl || "");
  setHref(".twitter-share-button", `https://twitter.com/intent/tweet?text=${shareText}&url=${encodedExtensionUrl}`);
  setHref(
    ".facebook-share-button",
    `https://www.facebook.com/sharer/sharer.php?u=${encodedExtensionUrl}&quote=${shareText}`
  );
  setHref(".whatsapp-share-button", `https://wa.me/?text=${shareText}%0A${encodedExtensionUrl}`);
  setHref(".telegram-share-button", `https://t.me/share/url?url=${encodedExtensionUrl}&text=${shareText}`);
  setFavoriteState(isFavorite);
}

export function renderTranslation(translation) {
  const translationContainer = document.querySelector(".translation-container");
  const translationBody = document.querySelector(".translation-container .body");
  if (!translationContainer || !translationBody) {
    return;
  }

  if (!translation?.text) {
    hideTranslation();
    return;
  }

  const translationKey = `${translation.edition?.identifier || ""}:${translation.text}`;
  if (renderState.translationKey === translationKey) {
    return;
  }

  if (translation.edition?.language === "ar") {
    translationBody.classList.add("ar-translation");
  } else {
    translationBody.classList.remove("ar-translation");
  }

  translationBody.textContent = translation.text;
  showElement(translationContainer);
  renderState.translationKey = translationKey;
}

export function hideTranslation() {
  const translationContainer = document.querySelector(".translation-container");
  if (!translationContainer) {
    return;
  }

  hideElement(translationContainer);
}

export function renderSearchBar() {
  if (document.querySelector(".search-bar")) {
    return;
  }

  const contentContainer = document.querySelector(".content-container");
  if (!contentContainer) {
    return;
  }

  const formElm = document.createElement("form");
  formElm.action = "https://google.com/search";
  formElm.method = "GET";
  formElm.innerHTML = '<input type="search" name="q" placeholder="Search Google..." class="search-bar" />';
  contentContainer.append(formElm);
}

export function renderAthkar(thikr) {
  const container = document.querySelector(".athkar-container");
  const thikrElm = document.querySelector(".athkar-container .thikr");
  if (!container || !thikrElm || !thikr) {
    return;
  }

  thikrElm.innerHTML = `
    <span class="thikr-arabic">${thikr.ar || ""}</span>
    <div class="translations">
      <span class="thikr-translation-title">Translation</span>
      <span class="thikr-english">${thikr.en || ""}</span>
      <span class="thikr-transliteration-title">Transliteration</span>
      <span class="thikr-ar-en">${thikr["ar-en"] || ""}</span>
    </div>
  `;
  showElement(container);
}

export function hideAthkar() {
  const container = document.querySelector(".athkar-container");
  if (!container) {
    return;
  }

  hideElement(container);
}

export function renderPrayerTimes({ fajr, dhuhr, asr, maghrib, isha, nextPrayerText } = {}) {
  const container = document.querySelector(".prayer-times-container");
  const wrapper = document.querySelector(".prayer-times-container .prayer-times-wrapper");
  if (!container || !wrapper) {
    return;
  }

  if (!fajr || !dhuhr || !asr || !maghrib || !isha) {
    hidePrayerTimes();
    return;
  }

  const prayerKey = [fajr, dhuhr, asr, maghrib, isha, nextPrayerText].join("|");
  if (renderState.prayerKey !== prayerKey) {
    wrapper.innerHTML = `
      <div class="prayer-time fajr">${fajr}</div>
      <div class="prayer-time dhuhr">${dhuhr}</div>
      <div class="prayer-time asr">${asr}</div>
      <div class="prayer-time maghrib">${maghrib}</div>
      <div class="prayer-time isha">${isha}</div>
    `;
    renderState.prayerKey = prayerKey;
  }

  container.classList.remove("d-none");
  const nextPrayerElm = document.querySelector(".next-prayer");
  if (nextPrayerElm) {
    nextPrayerElm.textContent = nextPrayerText || "";
  }
}

export function hidePrayerTimes() {
  const container = document.querySelector(".prayer-times-container");
  if (container) {
    container.classList.add("d-none");
  }

  const nextPrayerElm = document.querySelector(".next-prayer");
  if (nextPrayerElm) {
    nextPrayerElm.textContent = "";
  }
}

export function renderTopSites(topSites) {
  const contentContainer = document.querySelector(".content-container");
  if (!contentContainer) {
    return;
  }

  const normalizedSites = Array.isArray(topSites) ? topSites : [];
  const topSitesKey = normalizedSites.map((site) => site.url).join("|");
  if (topSitesKey === renderState.topSitesKey) {
    return;
  }

  contentContainer.querySelector(".top-sites-container")?.remove();
  if (!normalizedSites.length) {
    renderState.topSitesKey = "";
    return;
  }

  const container = document.createElement("div");
  container.classList.add("content", "top-sites-container");
  normalizedSites.forEach((topSite) => {
    const linkElm = document.createElement("a");
    linkElm.href = topSite.url;
    linkElm.dataset.url = topSite.url;
    linkElm.classList.add("shadow");
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(topSite.url)}&sz=64`;
    linkElm.innerHTML = `
      <img src="${faviconUrl}" alt="favicon" />
      ${topSite.title || topSite.url}
      <span class="remove">x</span>
    `;
    container.append(linkElm);
  });

  contentContainer.append(container);
  renderState.topSitesKey = topSitesKey;
}

// Renders the month view calendar with fasting/holiday badges.
export function renderCalendar({ data, weekdays, currentHijriMonths }) {
  const calendarData = Array.isArray(data) ? data : [];
  if (!calendarData.length) {
    return;
  }

  const key = `${calendarData.length}:${calendarData[0].date?.readable || calendarData[0].gregorian?.day}`;
  if (renderState.calendarKey === key) {
    setCalendarLoading(false);
    return;
  }

  const calendarElm = document.querySelector(".calendar");
  const headerElm = document.querySelector(".calendar__header");
  if (!calendarElm || !headerElm) {
    return;
  }

  Array.from(headerElm.children).forEach((child, index) => {
    const weekday = weekdays[index] || "";
    child.textContent = chrome.i18n.getMessage(weekday) || weekday;
  });
  calendarElm.querySelectorAll(".calendar__week").forEach((elm) => elm.remove());

  const weekdayIndex = new Map(weekdays.map((weekday, index) => [weekday, index]));
  const firstDay = calendarData[0];
  const startOffset = weekdayIndex.get(firstDay.gregorian.weekday.en) ?? 0;
  const dayCells = Array.from({ length: startOffset }, () => null).concat(calendarData);
  while (dayCells.length % 7 !== 0) {
    dayCells.push(null);
  }

  const fragment = document.createDocumentFragment();
  const today = new Date();
  for (let weekStart = 0; weekStart < dayCells.length; weekStart += 7) {
    const weekElm = document.createElement("div");
    weekElm.classList.add("calendar__week");
    for (let i = 0; i < 7; i++) {
      const dayData = dayCells[weekStart + i];
      weekElm.append(createCalendarDayElm(dayData, calendarData, today));
    }
    fragment.append(weekElm);
  }

  calendarElm.append(fragment);

  const gregorianMonthElm = document.getElementById("gregorianMonth");
  const hijriMonthElm = document.getElementById("hijriMonth");
  if (gregorianMonthElm) {
    const monthKey = calendarData[0].gregorian.month.en;
    gregorianMonthElm.textContent = chrome.i18n.getMessage(monthKey) || monthKey;
  }

  if (hijriMonthElm) {
    hijriMonthElm.textContent = (currentHijriMonths || [])
      .map((keyName) => chrome.i18n.getMessage(keyName) || keyName)
      .join("/");
  }

  renderState.calendarKey = key;
  setCalendarLoading(false);
}

export function renderFavorites(favorites) {
  const container = document.querySelector(".favorite-verses .favorite-content");
  if (!container) {
    return;
  }

  container.innerHTML = "";
  (favorites || []).forEach((verse, index) => {
    const verseElm = document.createElement("div");
    verseElm.classList.add("verse");
    verseElm.id = `verse_${index}`;

    const verseTextElm = document.createElement("p");
    verseTextElm.classList.add("verse-text");
    verseTextElm.textContent = verse.text;
    verseElm.append(verseTextElm);

    const verseDetailsElm = document.createElement("p");
    verseDetailsElm.classList.add("verse-details");
    verseDetailsElm.textContent = `${verse.surah.name} - ${verse.numberInSurah}`;
    verseElm.append(verseDetailsElm);

    const actionsElm = document.createElement("p");
    actionsElm.classList.add("verse-actions");
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.classList.add("btn", "btn-link", "favorite-button-list", "text-dark");
    removeButton.textContent = "Remove";
    actionsElm.append(removeButton);
    verseElm.append(actionsElm);

    container.append(verseElm);
  });
}

export function setFavoriteState(isFavorite) {
  const favoriteImgElm = document.querySelector(".favorite-button img");
  if (!favoriteImgElm) {
    return;
  }

  favoriteImgElm.src = isFavorite ? "assets/heart-filled.svg" : "assets/heart.svg";
}

export function setAudioState({ mode = "play", errorMessage = "" } = {}) {
  const imgElm = document.querySelector(".audio-player img");
  const errorElm = document.querySelector(".audio-player .error");
  const loaderElm = document.querySelector(".audio-player .loader");
  if (!imgElm || !errorElm || !loaderElm) {
    return;
  }

  hideElement(errorElm);
  switch (mode) {
    case "loading":
      hideElement(imgElm);
      showElement(loaderElm);
      break;
    case "pause":
      imgElm.src = "assets/pause.svg";
      showElement(imgElm);
      hideElement(loaderElm);
      break;
    case "error":
      imgElm.src = "assets/alert-triangle.svg";
      errorElm.textContent = errorMessage || chrome.i18n.getMessage("error");
      showElement(errorElm);
      showElement(imgElm);
      hideElement(loaderElm);
      break;
    default:
      imgElm.src = "assets/play.svg";
      showElement(imgElm);
      hideElement(loaderElm);
  }
}

export function showUpdateToast() {
  const existing = document.querySelector("#updateExtension")?.closest(".position-fixed");
  existing?.remove();

  const toastContainerElm = document.createElement("div");
  toastContainerElm.classList.add("position-fixed", "bottom-0", "end-0", "p-3");
  toastContainerElm.style.zIndex = 11;

  const toastElm = document.createElement("div");
  toastElm.classList.add("toast", "fade", "show", "text-dark");
  toastElm.role = "alert";
  toastElm.setAttribute("aria-live", "assertive");
  toastElm.setAttribute("aria-atomic", "true");
  toastContainerElm.append(toastElm);

  const toastBodyElm = document.createElement("div");
  toastBodyElm.classList.add("toast-body");
  toastElm.append(toastBodyElm);

  const toastBodyContentElm = document.createElement("p");
  toastBodyContentElm.classList.add("fw-bold");
  toastBodyContentElm.textContent =
    "A new update is available. You can update now or wait until your browser reloads";
  toastBodyElm.append(toastBodyContentElm);

  const actionsElm = document.createElement("div");
  actionsElm.classList.add("mt-2", "pt-2", "border-top");
  toastBodyElm.append(actionsElm);

  const updateButtonElm = document.createElement("button");
  updateButtonElm.type = "button";
  updateButtonElm.classList.add("btn", "btn-success", "btn-sm", "me-2");
  updateButtonElm.id = "updateExtension";
  updateButtonElm.textContent = "Update now";
  actionsElm.append(updateButtonElm);

  const closeButtonElm = document.createElement("button");
  closeButtonElm.type = "button";
  closeButtonElm.classList.add("btn", "btn-secondary", "btn-sm");
  closeButtonElm.setAttribute("data-bs-dismiss", ".toast");
  closeButtonElm.textContent = "Close";
  actionsElm.append(closeButtonElm);

  document.body.append(toastContainerElm);
}

export function showFavoriteToast(action) {
  const toastContainerElm = document.createElement("div");
  toastContainerElm.classList.add("position-fixed", "bottom-0", "end-0", "p-3");
  toastContainerElm.style.zIndex = 11;

  const toastElm = document.createElement("div");
  toastElm.classList.add("toast", "fade", "show", "text-dark");
  toastElm.role = "alert";
  toastElm.setAttribute("aria-live", "assertive");
  toastElm.setAttribute("aria-atomic", "true");
  toastContainerElm.append(toastElm);

  const toastBodyElm = document.createElement("div");
  toastBodyElm.classList.add("toast-body", "d-flex", "justify-content-between");
  toastElm.append(toastBodyElm);

  const toastBodyTextElm = document.createElement("p");
  toastBodyTextElm.classList.add("fw-bold", "mb-0");
  toastBodyTextElm.textContent = `Ayah ${action} ${action === "added" ? "to" : "from"} favorites!`;
  toastBodyElm.append(toastBodyTextElm);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.classList.add("btn-close", "text-dark");
  closeBtn.setAttribute("data-bs-dismiss", ".toast");
  closeBtn.setAttribute("aria-label", "Close");
  toastBodyElm.append(closeBtn);

  document.body.append(toastContainerElm);
  setTimeout(() => toastContainerElm.remove(), 2500);
}

export function showUpdateModal(message) {
  if (!message) {
    return;
  }

  if (window.Swal) {
    Swal.fire({ html: message });
    return;
  }

  alert(message);
}

export async function confirmTopSiteRemoval() {
  if (!window.Swal) {
    return window.confirm(chrome.i18n.getMessage("remove_top_site_content"));
  }

  const result = await Swal.fire({
    title: chrome.i18n.getMessage("remove_top_site_title"),
    html: `<div class="text-center">${chrome.i18n.getMessage("remove_top_site_content")}</div>`,
    showConfirmButton: true,
    confirmButtonText: chrome.i18n.getMessage("remove"),
    showCloseButton: true,
    showCancelButton: true,
    cancelButtonText: chrome.i18n.getMessage("cancel"),
    icon: "warning"
  });

  return Boolean(result.isConfirmed);
}

function createCalendarDayElm(dayData, fullCalendarData, today) {
  const dayElm = document.createElement("div");
  dayElm.classList.add("calendar__day", "day");
  if (!dayData) {
    dayElm.classList.add("not-month-day");
    return dayElm;
  }

  const gregorianDay = Number.parseInt(dayData.gregorian.day, 10);
  const monthName = dayData.hijri.month.en;
  const isToday = gregorianDay === today.getDate();
  if (isToday) {
    dayElm.classList.add("today");
  }

  dayElm.innerHTML = `${gregorianDay}<small class="calendar-hijri-date">${dayData.hijri.day}</small>`;
  (dayData.hijri.holidays || []).forEach((holiday) => {
    const badge = document.createElement("span");
    badge.classList.add("badge", "bg-success", "calendar-note");
    badge.textContent = holiday;
    dayElm.append(badge);
  });

  const dayIndex = fullCalendarData.indexOf(dayData);
  const previousHolidays = dayIndex > 0 ? fullCalendarData[dayIndex - 1].hijri.holidays || [] : [];
  const nextHolidays =
    dayIndex < fullCalendarData.length - 1 ? fullCalendarData[dayIndex + 1].hijri.holidays || [] : [];
  if (
    isFastingDay(
      Number.parseInt(dayData.hijri.day, 10),
      dayData.gregorian.weekday.en,
      dayData.hijri.holidays || [],
      previousHolidays,
      nextHolidays,
      monthName
    )
  ) {
    const badge = document.createElement("span");
    badge.classList.add("badge", "bg-danger", "calendar-note");
    badge.textContent = chrome.i18n.getMessage("fasting") || "Fasting";
    dayElm.append(badge);
  }

  return dayElm;
}

function isFastingDay(dayIndex, dayOfWeekName, holidays, dayBeforeHolidays, dayAfterHolidays, monthName) {
  return (
    (dayIndex === 13 && monthName !== "Dhu_al_Hijjah") ||
    dayIndex === 14 ||
    dayIndex === 15 ||
    dayOfWeekName === "Monday" ||
    dayOfWeekName === "Thursday" ||
    holidays.includes("Ashura") ||
    holidays.includes("Arafa") ||
    dayBeforeHolidays.includes("Ashura") ||
    dayAfterHolidays.includes("Ashura") ||
    monthName === "Ramadan"
  );
}

function initializeTooltips() {
  if (!window.bootstrap) {
    return;
  }

  const tooltips = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltips.forEach((tooltipElm) => {
    new bootstrap.Tooltip(tooltipElm);
  });
}

function initializeToasts() {
  if (!window.bootstrap) {
    return;
  }

  const toastElements = Array.from(document.querySelectorAll(".toast:not(.hide)"));
  toastElements.forEach((toastElm) => {
    new bootstrap.Toast(toastElm, { animation: true });
  });
}

function dismissElements(selector) {
  if (!selector) {
    return;
  }

  const elements = document.querySelectorAll(selector);
  elements.forEach((item) => item.classList.remove("show"));
}

function localizeHtmlPage(element) {
  Array.from(element.children).forEach((child) => {
    localizeHtmlPage(child);
    Array.from(child.attributes).forEach((attribute) => {
      attribute.value = attribute.value.replace(MESSAGE_REGEX, localizeString);
    });
    child.innerHTML = child.innerHTML.replace(MESSAGE_REGEX, localizeString);
  });
}

function localizeString(_, key) {
  return key ? chrome.i18n.getMessage(key) : "";
}

function setHref(selector, href) {
  const elm = document.querySelector(selector);
  if (elm) {
    elm.href = href;
  }
}

function hideElement(element) {
  element?.classList.add("hide");
}

function showElement(element) {
  element?.classList.remove("hide");
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeHexColor(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  if (/^#[\da-f]{6}$/.test(normalized)) {
    return normalized;
  }

  if (/^#[\da-f]{3}$/.test(normalized)) {
    const [r, g, b] = normalized.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return "";
}

function hexToRgb(hexValue) {
  const hex = normalizeHexColor(hexValue);
  if (!hex) {
    return "";
  }

  const value = hex.slice(1);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `${red}, ${green}, ${blue}`;
}
