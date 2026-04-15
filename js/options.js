//
// Copyright (c) 2023 by Shahed Nasser. All Rights Reserved.
//

const MESSAGE_REGEX = /__MSG_(\w+)__/g;

const DEFAULT_SETTINGS = Object.freeze({
  translation_language: "en",
  show_translation: false,
  recitation: "ar.alafasy",
  show_top_sites: true,
  show_athkar: true,
  show_date: true,
  calendar_start_day: "Monday",
  send_fasting_notification: false,
  show_prayer_times: true,
  prayer_times_method: "0",
  prayer_times_format: "24",
  should_refresh: true,
  show_search: true,
  background_image_type: "default",
  background_image_type_options: "",
  theme_preset: "emerald",
  accent_color: "#2e8b57",
  card_opacity: 78,
  background_dimness: 52,
  verse_font_size: 30,
  show_bismillah: true
});

const TRANSLATION_IDENTIFIERS = Object.freeze({
  en: "en.ahmedali",
  none: "",
  ar: "ar.muyassar",
  az: "az.mammadaliyev",
  bn: "bn.bengali",
  cs: "cs.hrbek",
  de: "de.aburida",
  dv: "dv.divehi",
  es: "es.cortes",
  fa: "fa.ayati",
  fr: "fr.hamidullah",
  ha: "ha.gumi",
  hi: "hi.hindi",
  id: "id.indonesian",
  it: "it.piccardo",
  ja: "ja.japanese",
  ko: "ko.korean",
  ku: "ku.asan",
  ml: "ml.abdulhameed",
  nl: "nl.keyzer",
  no: "no.berg",
  pl: "pl.bielawskiego",
  pt: "pt.elhayek",
  ro: "ro.grigore",
  ru: "ru.kuliev",
  sd: "sd.amroti",
  so: "so.abduh",
  sq: "sq.ahmeti",
  sv: "sv.bernstrom",
  sw: "sw.barwani",
  ta: "ta.tamil",
  tg: "tg.ayati",
  th: "th.thai",
  tr: "tr.ates",
  tt: "tt.nugman",
  ug: "ug.saleh",
  ur: "ur.ahmedali",
  uz: "uz.sodik"
});

document.addEventListener("DOMContentLoaded", initializeOptionsPage);

function initializeOptionsPage() {
  document.documentElement.setAttribute("lang", chrome.i18n.getUILanguage());
  localizeHtmlPage(document.body);

  const elements = getElements();
  if (!elements.saveButton) {
    return;
  }

  let imageFile = "";

  loadSettings(elements, (settings) => {
    applySettingsToForm(settings, elements);
    imageFile = settings.background_image_type === "single_image" ? settings.background_image_type_options || "" : "";
    if (imageFile) {
      setImagePreview(elements.singleImageInput, imageFile);
    }
  });

  wireUiEvents(elements, {
    getImageFile: () => imageFile,
    setImageFile: (value) => {
      imageFile = value || "";
    }
  });
}

function getElements() {
  return {
    translationLanguage: document.querySelector('select[name="translation_language"]'),
    showTranslation: document.querySelector('input[name="show_translation"]'),
    recitation: document.querySelector('select[name="recitation"]'),
    showTopSites: document.querySelector('input[name="show_top_sites"]'),
    showAthkar: document.querySelector('input[name="show_athkar"]'),
    showDate: document.querySelector('input[name="show_date"]'),
    calendarStartDay: document.querySelector('select[name="calendar_start_day"]'),
    sendFastingNotification: document.querySelector('input[name="send_fasting_notification"]'),
    showPrayerTimes: document.getElementById("show_prayer_times"),
    prayerTimesMethod: document.getElementById("prayer_times_method"),
    prayerTimesFormat: document.getElementById("prayer_times_format"),
    shouldRefresh: document.getElementById("should_refresh"),
    showSearch: document.getElementById("show_search"),
    backgroundImageType: document.querySelectorAll('input[name="background_image_type"]'),
    unsplashCollectionInputWrap: document.getElementById("unsplashCollectionInput"),
    unsplashCollection: document.getElementById("collection_id"),
    singleImageInputWrap: document.getElementById("singleImageInput"),
    singleImageInput: document.getElementById("single_image_file"),
    saveButton: document.getElementById("save"),
    alerts: document.querySelector(".alerts"),
    themePreset: document.getElementById("theme_preset"),
    accentColor: document.getElementById("accent_color"),
    cardOpacity: document.getElementById("card_opacity"),
    backgroundDimness: document.getElementById("background_dimness"),
    verseFontSize: document.getElementById("verse_font_size"),
    cardOpacityValue: document.getElementById("card_opacity_value"),
    backgroundDimnessValue: document.getElementById("background_dimness_value"),
    verseFontSizeValue: document.getElementById("verse_font_size_value"),
    showBismillah: document.getElementById("show_bismillah")
  };
}

function loadSettings(elements, onLoaded) {
  chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS), (stored) => {
    const settings = {
      ...DEFAULT_SETTINGS,
      ...stored
    };

    settings.prayer_times_method = String(settings.prayer_times_method ?? DEFAULT_SETTINGS.prayer_times_method);
    settings.prayer_times_format = String(settings.prayer_times_format ?? DEFAULT_SETTINGS.prayer_times_format);
    onLoaded(settings);
  });
}

function applySettingsToForm(settings, elements) {
  elements.showTranslation.checked = Boolean(settings.show_translation);
  elements.translationLanguage.disabled = !settings.show_translation;
  elements.translationLanguage.value = settings.translation_language || DEFAULT_SETTINGS.translation_language;

  elements.recitation.value = settings.recitation || DEFAULT_SETTINGS.recitation;
  elements.showTopSites.checked = settings.show_top_sites !== false;
  elements.showAthkar.checked = settings.show_athkar !== false;
  elements.showDate.checked = settings.show_date !== false;
  elements.calendarStartDay.value = settings.calendar_start_day || DEFAULT_SETTINGS.calendar_start_day;
  elements.sendFastingNotification.checked = Boolean(settings.send_fasting_notification);

  const prayerEnabled = settings.show_prayer_times !== false;
  elements.showPrayerTimes.checked = prayerEnabled;
  togglePrayerFields(prayerEnabled, elements);
  elements.prayerTimesMethod.value = settings.prayer_times_method;
  elements.prayerTimesFormat.value = settings.prayer_times_format;

  elements.shouldRefresh.checked = settings.should_refresh !== false;
  elements.showSearch.checked = settings.show_search !== false;

  elements.themePreset.value = settings.theme_preset || DEFAULT_SETTINGS.theme_preset;
  elements.accentColor.value = normalizeHexColor(settings.accent_color) || DEFAULT_SETTINGS.accent_color;
  elements.cardOpacity.value = clampNumber(settings.card_opacity, 40, 96, DEFAULT_SETTINGS.card_opacity);
  elements.backgroundDimness.value = clampNumber(
    settings.background_dimness,
    25,
    78,
    DEFAULT_SETTINGS.background_dimness
  );
  elements.verseFontSize.value = clampNumber(settings.verse_font_size, 22, 48, DEFAULT_SETTINGS.verse_font_size);
  elements.showBismillah.checked = settings.show_bismillah !== false;

  updateRangeLabel(elements.cardOpacity, elements.cardOpacityValue, "%");
  updateRangeLabel(elements.backgroundDimness, elements.backgroundDimnessValue, "%");
  updateRangeLabel(elements.verseFontSize, elements.verseFontSizeValue, "px");

  const backgroundType = settings.background_image_type || DEFAULT_SETTINGS.background_image_type;
  const selectedRadio = document.querySelector(`input[name="background_image_type"][value="${backgroundType}"]`);
  (selectedRadio || document.querySelector('input[name="background_image_type"][value="default"]')).checked = true;

  if (backgroundType === "unsplash_collection") {
    elements.unsplashCollection.value = settings.background_image_type_options || "";
  }
  toggleBackgroundInput(backgroundType, elements);
}

function wireUiEvents(elements, imageStore) {
  elements.showTranslation.addEventListener("change", (event) => {
    elements.translationLanguage.disabled = !event.target.checked;
  });

  elements.showPrayerTimes.addEventListener("change", (event) => {
    togglePrayerFields(event.target.checked, elements);
  });

  elements.backgroundImageType.forEach((input) => {
    input.addEventListener("change", (event) => {
      toggleBackgroundInput(event.target.value, elements);
    });
  });

  elements.singleImageInput.addEventListener("change", () => {
    const file = elements.singleImageInput.files?.[0];
    if (!file) {
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    imageStore.setImageFile(imageUrl);
    setImagePreview(elements.singleImageInput, imageUrl);
  });

  elements.cardOpacity.addEventListener("input", () => {
    updateRangeLabel(elements.cardOpacity, elements.cardOpacityValue, "%");
  });
  elements.backgroundDimness.addEventListener("input", () => {
    updateRangeLabel(elements.backgroundDimness, elements.backgroundDimnessValue, "%");
  });
  elements.verseFontSize.addEventListener("input", () => {
    updateRangeLabel(elements.verseFontSize, elements.verseFontSizeValue, "px");
  });

  elements.saveButton.addEventListener("click", () => {
    saveSettings(elements, imageStore.getImageFile());
  });
}

function saveSettings(elements, imageFile) {
  setAlert(elements.alerts, "", "clear");

  const translationLanguage = elements.translationLanguage.value;
  const translationIdentifier = TRANSLATION_IDENTIFIERS[translationLanguage];
  if (translationIdentifier === undefined || translationIdentifier === null) {
    setAlert(elements.alerts, chrome.i18n.getMessage("error"), "danger");
    return;
  }

  const backgroundType = document.querySelector('input[name="background_image_type"]:checked')?.value || "default";
  let backgroundOptions = "";

  if (backgroundType === "unsplash_collection") {
    backgroundOptions = elements.unsplashCollection.value.trim();
    if (!backgroundOptions) {
      setAlert(elements.alerts, chrome.i18n.getMessage("unsplash_error"), "danger");
      return;
    }
  }

  if (backgroundType === "single_image") {
    backgroundOptions = imageFile || "";
    if (!backgroundOptions) {
      setAlert(elements.alerts, chrome.i18n.getMessage("file_error"), "danger");
      return;
    }
  }

  const payload = {
    translation_language: translationLanguage,
    translation_identifier: translationIdentifier,
    show_translation: elements.showTranslation.checked,
    recitation: elements.recitation.value,
    show_top_sites: elements.showTopSites.checked,
    show_athkar: elements.showAthkar.checked,
    show_date: elements.showDate.checked,
    calendar_start_day: elements.calendarStartDay.value,
    send_fasting_notification: elements.sendFastingNotification.checked,
    show_prayer_times: elements.showPrayerTimes.checked,
    prayer_times_method: elements.prayerTimesMethod.value,
    prayer_times_format: elements.prayerTimesFormat.value,
    should_refresh: elements.shouldRefresh.checked,
    show_search: elements.showSearch.checked,
    background_image_type: backgroundType,
    background_image_type_options: backgroundOptions,
    theme_preset: elements.themePreset.value,
    accent_color: normalizeHexColor(elements.accentColor.value) || DEFAULT_SETTINGS.accent_color,
    card_opacity: clampNumber(elements.cardOpacity.value, 40, 96, DEFAULT_SETTINGS.card_opacity),
    background_dimness: clampNumber(
      elements.backgroundDimness.value,
      25,
      78,
      DEFAULT_SETTINGS.background_dimness
    ),
    verse_font_size: clampNumber(elements.verseFontSize.value, 22, 48, DEFAULT_SETTINGS.verse_font_size),
    show_bismillah: elements.showBismillah.checked
  };

  chrome.storage.sync.set(payload, () => {
    chrome.storage.local.set(
      {
        image: null,
        verse: null,
        prayerTimesCalendar: null,
        calendar: null
      },
      () => {
        setAlert(elements.alerts, chrome.i18n.getMessage("saved"), "success");
        handleFastingAlarm(elements.sendFastingNotification.checked);
      }
    );
  });
}

function handleFastingAlarm(enabled) {
  if (enabled) {
    chrome.alarms.get("fastingNotification", (alarm) => {
      if (!alarm || alarm.name !== "fastingNotification") {
        chrome.alarms.create("fastingNotification", {
          when: Date.now(),
          periodInMinutes: 1440
        });
      }
    });
    return;
  }

  chrome.alarms.clear("fastingNotification");
}

function togglePrayerFields(enabled, elements) {
  elements.prayerTimesMethod.disabled = !enabled;
  elements.prayerTimesFormat.disabled = !enabled;
}

function toggleBackgroundInput(type, elements) {
  elements.unsplashCollectionInputWrap.classList.add("d-none");
  elements.singleImageInputWrap.classList.add("d-none");

  if (type === "unsplash_collection") {
    elements.unsplashCollectionInputWrap.classList.remove("d-none");
    return;
  }

  if (type === "single_image") {
    elements.singleImageInputWrap.classList.remove("d-none");
  }
}

function setImagePreview(inputElement, url) {
  if (!inputElement) {
    return;
  }

  inputElement.parentElement.querySelector(".background-image-preview")?.remove();
  const preview = document.createElement("img");
  preview.src = url;
  preview.className = "background-image-preview";
  preview.alt = "Selected background image";
  inputElement.after(preview);
}

function updateRangeLabel(rangeInput, labelElement, suffix) {
  if (!rangeInput || !labelElement) {
    return;
  }

  labelElement.textContent = `${rangeInput.value}${suffix}`;
}

function setAlert(container, message, type) {
  if (!container) {
    return;
  }

  if (type === "clear" || !message) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `<div class="alert alert-${type} mt-3">${message}</div>`;
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

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
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
