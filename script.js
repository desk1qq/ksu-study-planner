"use strict";

const STORAGE_KEY = "exam-planner-v1";
const DAY_MS = 86400000;
const form = document.getElementById("planner-form");
const nameInput = document.getElementById("exam-name");
const dateInput = document.getElementById("exam-date");
const tasksInput = document.getElementById("tasks");
const message = document.getElementById("message");
const storageMessage = document.getElementById("storage-message");
const planContainer = document.getElementById("plan");
const summary = document.getElementById("plan-summary");
const composer = document.querySelector(".composer");
const composerToggle = document.getElementById("composer-toggle");
let savedPlans = [];

function setComposerExpanded(expanded) {
  composer.classList.toggle("is-collapsed", !expanded);
  composerToggle.setAttribute("aria-expanded", String(expanded));
  if (expanded) nameInput.focus({ preventScroll: true });
}

composerToggle.addEventListener("click", () => setComposerExpanded(true));
composer.addEventListener("mouseenter", () => setComposerExpanded(true));
composer.addEventListener("focusin", () => setComposerExpanded(true));

// UTC используется только как шкала календарных дней, а не местного времени.
function calendarDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return NaN;
  return date.getTime() / DAY_MS;
}

function todayDay() {
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return calendarDay(localDate);
}

function dateString(day) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function parseTaskInput(value) {
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const first = lines[0] || "";
  const listType = /^\d+[.)]\s+/.test(first) ? "ordered" : /^[-–—]\s+/.test(first) ? "unordered" : "plain";
  const tasks = lines.map(line => listType === "ordered"
    ? line.replace(/^\d+[.)]\s*/, "")
    : listType === "unordered" ? line.replace(/^[-–—]\s*/, "") : line
  ).filter(Boolean);
  return { tasks, listType };
}

function formatTaskInput(tasks, listType) {
  if (listType === "ordered") return tasks.map((task, index) => `${index + 1}. ${task}`).join("\n");
  if (listType === "unordered") return tasks.map(task => `- ${task}`).join("\n");
  return tasks.join("\n");
}

function continueTaskList(event) {
  if (event.key !== "Enter" || event.shiftKey) return;
  const input = event.currentTarget;
  const before = input.value.slice(0, input.selectionStart);
  const line = before.split(/\r?\n/).at(-1);
  const numbered = line.match(/^\s*(\d+)[.)]\s+/);
  const bulleted = line.match(/^\s*[-–—]\s+/);
  if (!numbered && !bulleted) return;
  event.preventDefault();
  const prefix = numbered ? `${Number(numbered[1]) + 1}. ` : "- ";
  const start = input.selectionStart;
  input.setRangeText(`\n${prefix}`, start, input.selectionEnd, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

tasksInput.addEventListener("keydown", continueTaskList);

function distribute(tasks, start, end, listType) {
  const days = end - start;
  const base = Math.floor(tasks.length / days);
  const extra = tasks.length % days;
  let offset = 0;
  return Array.from({ length: Math.min(days, tasks.length) }, (_, index) => {
    const count = base + (index < extra ? 1 : 0);
    const entry = { date: dateString(start + index), tasks: tasks.slice(offset, offset + count), listType };
    offset += count;
    return entry;
  });
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      name: nameInput.value, date: dateInput.value, tasks: tasksInput.value, plans: savedPlans
    }));
    storageMessage.textContent = "";
  } catch {
    storageMessage.textContent = "Браузер не разрешил сохранение. План работает, но после закрытия страницы данные могут потеряться.";
  }
}

function renderPlan() {
  closeNotePanel();
  planContainer.replaceChildren();
  renderNoteCollection();
  checkReminders();
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
  }).format(new Date(calendarDay(value) * DAY_MS));
}

form.addEventListener("input", () => {
  message.textContent = "";
  message.className = "";
  persist();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const parsed = parseTaskInput(tasksInput.value);
  const tasks = parsed.tasks;
  const start = todayDay();
  const end = calendarDay(dateInput.value);
  let error = "";
  let invalidInput = null;
  if (!nameInput.value.trim()) {
    error = "Введите название экзамена."; invalidInput = nameInput;
  } else if (!Number.isFinite(end) || end <= start) {
    error = "Укажите дату экзамена позднее сегодняшнего дня."; invalidInput = dateInput;
  } else if (!tasks.length) {
    error = "Добавьте хотя бы одну учебную задачу."; invalidInput = tasksInput;
  }
  message.className = error ? "error" : "";
  if (error) {
    message.textContent = error;
    invalidInput.focus();
    return;
  }
  savedPlans.push({ name: nameInput.value.trim(), examDate: dateInput.value, days: distribute(tasks, start, end, parsed.listType) });
  form.reset();
  document.getElementById("search").value = "";
  currentNotesView = "active";
  renderPlan();
  persist();
  message.textContent = "Задачи добавлены. Можно создать следующий план.";
  setComposerExpanded(false);
});

function validPlan(plan) {
  return plan && typeof plan.name === "string" && Number.isFinite(calendarDay(plan.examDate)) &&
    Array.isArray(plan.days) && plan.days.every(day => day &&
      Number.isFinite(calendarDay(day.date)) && Array.isArray(day.tasks) && day.tasks.every(task => typeof task === "string"));
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || ![data.name, data.date, data.tasks].every(value => typeof value === "string")) throw new Error("Invalid data");
    nameInput.value = data.name;
    dateInput.value = data.date;
    tasksInput.value = data.tasks;
    const plans = Array.isArray(data.plans) ? data.plans : data.plan ? [data.plan] : [];
    savedPlans = plans.filter(validPlan)
      .map(plan => ({ ...plan, days: plan.days.filter(day => day.tasks.length > 0) }))
      .filter(plan => plan.days.length > 0);
    // Старый готовый план переносим в коллекцию, освобождая форму.
    if (!Array.isArray(data.plans) && savedPlans.length) form.reset();
    renderPlan();
    storageMessage.textContent = "Сохранённые планы и черновик восстановлены.";
  } catch {
    storageMessage.textContent = "Не удалось прочитать сохранённые данные. Можно составить новый план.";
  }
}

restore();
renderPlan();
