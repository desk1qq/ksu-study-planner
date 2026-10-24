"use strict";

const NOTE_COLORS = [
  ["default", "По умолчанию"], ["red", "Коралловый"], ["peach", "Персиковый"],
  ["sand", "Песочный"], ["green", "Зелёный"], ["mint", "Мятный"],
  ["blue", "Голубой"], ["purple", "Сиреневый"], ["pink", "Розовый"], ["gray", "Серый"]
];
const NOTE_PATTERNS = [
  ["none", "Без рисунка"],
  ["dots", "Точки"],
  ["lines", "Полосы"],
  ["grid", "Клетка"],
  ["waves", "Волны"]
];
const reminderAlert = document.getElementById("reminder-alert");
let notePanel = null;
let notePanelTrigger = null;

function noteElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function noteButton(label, text, action) {
  const button = noteElement("button", "note-button", text);
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", action);
  return button;
}

function noteIcon(kind) {
  const paths = {
    format: '<path d="m7 17 5-13 5 13M9 12h6M5 21h14"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4 2 2 0 0 1 1-4h3a3 3 0 0 0 3-3c0-4-4-7-9-7Z"/><circle cx="7" cy="10" r=".7"/><circle cx="10" cy="6.5" r=".7"/><circle cx="15" cy="7" r=".7"/>',
    bell: '<path d="M5 17h14l-2-3v-4a5 5 0 0 0-10 0v4l-2 3ZM10 20h4M12 3V2"/>'
  };
  const holder = noteElement("span");
  // Только постоянные SVG из кода; пользовательский текст сюда не попадает.
  holder.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths[kind] + '</svg>';
  return holder.firstElementChild;
}

function closeNotePanel(returnFocus = false) {
  if (!notePanel) return;
  notePanel.remove();
  notePanelTrigger.setAttribute("aria-expanded", "false");
  if (returnFocus && notePanelTrigger.isConnected) notePanelTrigger.focus();
  notePanel = null;
  notePanelTrigger = null;
}

function openNotePanel(trigger, title, build) {
  const same = notePanelTrigger === trigger;
  closeNotePanel();
  if (same) return;
  notePanelTrigger = trigger;
  trigger.setAttribute("aria-expanded", "true");
  notePanel = noteElement("section", "note-popover");
  notePanel.setAttribute("role", "dialog");
  notePanel.setAttribute("aria-label", title);
  const header = noteElement("div", "note-popover-heading");
  header.append(noteElement("strong", "", title), noteButton("Закрыть", "×", () => closeNotePanel(true)));
  notePanel.append(header);
  build(notePanel);
  (trigger.closest("dialog") || document.body).append(notePanel);
  const rect = trigger.getBoundingClientRect();
  const width = notePanel.offsetWidth;
  const height = notePanel.offsetHeight;
  notePanel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
  notePanel.style.top = `${Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - height - 12))}px`;
  notePanel.querySelector("button").focus();
}

document.addEventListener("pointerdown", event => {
  if (notePanel && !notePanel.contains(event.target) && !notePanelTrigger.contains(event.target)) closeNotePanel();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && notePanel) { event.preventDefault(); closeNotePanel(true); }
});
window.addEventListener("resize", () => closeNotePanel());
window.addEventListener("scroll", event => {
  if (notePanel && !notePanel.contains(event.target)) closeNotePanel();
}, true);

function automaticNoteColor(day) {
  const palette = ["sand", "green", "blue", "red", "purple"];
  if (palette.includes(day.autoColor)) return day.autoColor;

  const source = day.id || day.date || day.tasks.join("|");
  let hash = 0;
  for (const character of source) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }
  day.autoColor = palette[Math.abs(hash) % palette.length];
  return day.autoColor;
}

function applyNoteAppearance(card, day) {
  const format = day.format || {};
  const list = card.querySelector(".note-text") || card.querySelector(".task-content");
  list.style.fontSize = format.size === "h1" ? "22px" : format.size === "h2" ? "18px" : "14px";
  list.style.fontWeight = format.bold ? "700" : "400";
  list.style.fontStyle = format.italic ? "italic" : "normal";
  list.style.textDecoration = format.underline ? "underline" : "none";
  const selectedColor = NOTE_COLORS.some(([key]) => key === day.color) ? day.color : "default";
  card.dataset.color = selectedColor === "default" ? automaticNoteColor(day) : selectedColor;
  card.dataset.pattern = NOTE_PATTERNS.some(([key]) => key === day.pattern) ? day.pattern : "none";
}

function saveNoteOptions(card) {
  // В редакторе меняем черновик; запись произойдёт при автосохранении или закрытии.
  if (!card.noteDraft) persist();
}

function buildFormatPanel(panel, card, day) {
  panel.append(noteElement("p", "note-help", "Формат применяется ко всем задачам этой карточки."));
  const row = noteElement("div", "format-options");
  const controls = [];
  const options = [
    ["h1", "Крупный текст", "H1"],
    ["h2", "Средний текст", "H2"],
    ["normal", "Обычный текст", "Aa"],
    ["bold", "Жирный", "B"],
    ["italic", "Курсив", "I"],
    ["underline", "Подчёркнутый", "U"]
  ];
  function refresh() {
    const format = day.format || {};
    for (const [key, button] of controls) {
      const active = ["h1", "h2", "normal"].includes(key) ? (format.size || "normal") === key : !!format[key];
      button.setAttribute("aria-pressed", String(active));
    }
    applyNoteAppearance(card, day);
  }
  for (const [key, label, text] of options) {
    const button = noteButton(label, text, () => {
      day.format = { ...(day.format || {}) };
      if (["h1", "h2", "normal"].includes(key)) day.format.size = key;
      else day.format[key] = !day.format[key];
      refresh(); saveNoteOptions(card);
    });
    button.dataset.format = key;
    controls.push([key, button]);
    row.append(button);
  }
  row.append(noteButton("Убрать форматирование", "Tx", () => {
    day.format = {};
    refresh();
    saveNoteOptions(card);
  }));
  panel.append(row);
  refresh();
}

function buildBackgroundPanel(panel, card, day) {
  for (const [property, options, title] of [["color", NOTE_COLORS, "Цвет"], ["pattern", NOTE_PATTERNS, "Рисунок"]]) {
    panel.append(noteElement("p", "note-help", title));
    const row = noteElement("div", "swatch-options");
    const controls = [];
    for (const [key, label] of options) {
      const button = noteButton(label, "", () => {
        day[property] = key;
        applyNoteAppearance(card, day);
        for (const [value, control] of controls) {
          control.setAttribute("aria-pressed", String(value === key));
        }
        saveNoteOptions(card);
      });
      button.classList.add("swatch");
      button.dataset[property] = key;
      if (key === "default" || key === "none") button.textContent = "∅";
      button.setAttribute("aria-pressed", String((day[property] || options[0][0]) === key));
      controls.push([key, button]);
      row.append(button);
    }
    panel.append(row);
  }
}

function reminderPreset(kind, now = new Date()) {
  const date = new Date(now);
  if (kind === "today") date.setHours(18, 0, 0, 0);
  if (kind === "tomorrow") {
    date.setDate(date.getDate() + 1);
    date.setHours(8, 0, 0, 0);
  }
  if (kind === "week") {
    date.setDate(date.getDate() + ((8 - date.getDay()) % 7 || 7));
    date.setHours(8, 0, 0, 0);
  }
  return date;
}

function buildReminderPanel(panel, card, day) {
  panel.append(noteElement("p", "note-help", "Напоминания сохраняются в приложении."));
  const error = noteElement("p", "note-error"); error.setAttribute("role", "status");
  function save(date) {
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
      error.textContent = "Выберите дату и время в будущем.";
      return;
    }
    day.reminder = date.toISOString();
    saveNoteOptions(card); updateReminderBadge(card, day); checkReminders(); closeNotePanel(true);
  }
  for (const [kind, label, time] of [["tomorrow", "Завтра", "08:00"], ["week", "На следующей неделе", "пн, 08:00"]]) {
    const date = reminderPreset(kind);
    const button = noteButton(label + " " + time, "", () => save(date));
    button.classList.add("reminder-option");
    button.append(noteElement("span", "", label), noteElement("span", "", time));
    button.disabled = date.getTime() <= Date.now();
    panel.append(button);
  }
  const label = noteElement("label", "reminder-custom", "◷  Выбрать дату и время");
  const input = noteElement("input"); input.type = "datetime-local";
  label.append(input); panel.append(label);
  const actions = noteElement("div", "reminder-actions");
  actions.append(noteButton("Сохранить напоминание", "Сохранить", () => save(new Date(input.value))));
  if (day.reminder) actions.append(noteButton("Удалить напоминание", "Удалить", () => {
    delete day.reminder;
    saveNoteOptions(card);
    updateReminderBadge(card, day);
    checkReminders();
    closeNotePanel(true);
  }));
  panel.append(actions, error);
}

function updateReminderBadge(card, day) {
  const badge = card.querySelector(".note-reminder");
  if (!badge || !day) return;
  const stamp = Date.parse(day.reminder);
  badge.hidden = !Number.isFinite(stamp);
  if (!Number.isFinite(stamp)) return;
  const due = stamp <= Date.now();
  badge.classList.toggle("is-due", due);
  badge.textContent = (due ? "Пора повторить · " : "Напомнить · ") + new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  }).format(new Date(stamp));
}

function attachNoteTools(card, day) {
  card.noteDay = day;
  const badge = noteElement("button", "note-reminder"); badge.type = "button";
  badge.addEventListener("click", () => openNotePanel(badge, "Напомнить позже", panel => buildReminderPanel(panel, card, day)));
  card.append(badge);
  const toolbar = noteElement("div", "note-toolbar");
  toolbar.setAttribute("role", "group");
  toolbar.setAttribute("aria-label", "Параметры карточки");

  const tools = [
    ["format", "Параметры форматирования", buildFormatPanel],
    ["palette", "Параметры фона", buildBackgroundPanel],
    ["bell", "Напомнить", buildReminderPanel]
  ];

  for (const [icon, title, build] of tools) {
    const panelTitle = title === "Напомнить" ? "Напомнить позже" : title;
    const button = noteButton(title, "", () => {
      openNotePanel(button, panelTitle, panel => build(panel, card, day));
    });
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.append(noteIcon(icon));
    toolbar.append(button);
  }
  card.append(toolbar);
  applyNoteAppearance(card, day);
  updateReminderBadge(card, day);
}

function checkReminders() {
  const due = [];
  for (const plan of savedPlans) {
    for (const day of plan.days) {
      if (day.state !== "trash" && Date.parse(day.reminder) <= Date.now()) {
        due.push(`${day.name || plan.name}: ${day.tasks.join(", ")}`);
      }
    }
  }
  const text = due.length ? "Пора заняться подготовкой! " + due.join(" · ") : "";
  if (reminderAlert.textContent !== text) reminderAlert.textContent = text;
  reminderAlert.hidden = !due.length;
  for (const card of planContainer.querySelectorAll(".day")) {
    updateReminderBadge(card, card.noteDay);
  }
}

setInterval(checkReminders, 30000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkReminders();
});
