"use strict";

const STORAGE_KEY = "exam-planner-v1";

const form = document.getElementById("planner-form");
const nameInput = document.getElementById("exam-name");
const dateInput = document.getElementById("exam-date");
const tasksInput = document.getElementById("tasks");
const weekdayInputs = [...document.querySelectorAll('input[name="study-weekday"]')];
const message = document.getElementById("message");
const storageMessage = document.getElementById("storage-message");
const planContainer = document.getElementById("plan");
const summary = document.getElementById("plan-summary");
const composer = document.querySelector(".composer");
const composerToggle = document.getElementById("composer-toggle");

let savedPlans = [];
let composerHoverPreview = false;

function selectedWeekdays() {
  return weekdayInputs
    .filter(input => input.checked)
    .map(input => Number(input.value));
}

function restoreWeekdays(weekdays) {
  const selected = new Set(Array.isArray(weekdays) ? weekdays : []);
  weekdayInputs.forEach(input => {
    input.checked = selected.has(Number(input.value));
  });
}

function setComposerExpanded(expanded, { focus = expanded } = {}) {
  if (expanded) {
    composer.style.setProperty("--composer-form-height", `${form.scrollHeight}px`);
  }
  composer.classList.toggle("is-collapsed", !expanded);
  composerToggle.setAttribute("aria-expanded", String(expanded));

  if (expanded && focus) {
    nameInput.focus({ preventScroll: true });
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      name: nameInput.value,
      date: dateInput.value,
      tasks: tasksInput.value,
      weekdays: selectedWeekdays(),
      plans: savedPlans
    }));
    storageMessage.textContent = "";
  } catch {
    storageMessage.textContent = "Не удалось сохранить данные в браузере.";
  }
}

function renderPlan() {
  closeNotePanel();
  planContainer.replaceChildren();
  renderNoteCollection();
  checkReminders();
  document.documentElement.classList.add("notes-ready");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(calendarDay(value) * DAY_MS));
}

function clearComposerAfterSave() {
  form.reset();
  message.textContent = "";
  message.className = "";
  document.getElementById("search").value = "";
  currentNotesView = "active";
  setComposerExpanded(false);
}

function createNote({ strictDate = false } = {}) {
  const parsed = parseTaskInput(tasksInput.value);
  if (!parsed.tasks.length) return false;

  const name = nameInput.value.trim();
  const examDate = dateInput.value;
  const startDay = todayDay();
  const endDay = calendarDay(examDate);
  const weekdays = selectedWeekdays();

  if (strictDate && examDate && (!Number.isFinite(endDay) || endDay <= startDay)) {
    message.className = "error";
    message.textContent = "Укажите будущую дату экзамена или оставьте поле пустым.";
    dateInput.focus();
    return false;
  }

  const hasSchedule = Number.isFinite(endDay) && endDay > startDay;
  if (hasSchedule && !weekdays.length) {
    message.className = "error";
    message.textContent = "Выберите хотя бы один день недели для подготовки.";
    weekdayInputs[0].focus();
    return false;
  }

  const days = hasSchedule
    ? distributeTasks(parsed.tasks, startDay, endDay, parsed.listType, weekdays)
    : [{
        tasks: parsed.tasks,
        listType: parsed.listType,
        quickNote: true
      }];

  if (hasSchedule && !days.length) {
    message.className = "error";
    message.textContent = "До экзамена нет выбранных дней подготовки. Измените дату или дни недели.";
    return false;
  }

  savedPlans.push({ name, examDate: hasSchedule ? examDate : "", weekdays, days });
  clearComposerAfterSave();
  renderPlan();
  persist();
  return true;
}

function validDay(day) {
  if (!day || !Array.isArray(day.tasks)) return false;
  if (!day.tasks.every(task => typeof task === "string")) return false;
  return day.quickNote || Number.isFinite(calendarDay(day.date));
}

function validPlan(plan) {
  return plan &&
    typeof plan.name === "string" &&
    typeof plan.examDate === "string" &&
    Array.isArray(plan.days) &&
    plan.days.every(validDay);
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const data = JSON.parse(raw);
    if (!data || ![data.name, data.date, data.tasks].every(value => typeof value === "string")) {
      throw new Error("Invalid data");
    }

    nameInput.value = data.name;
    dateInput.value = data.date;
    tasksInput.value = data.tasks;
    restoreWeekdays(data.weekdays);

    const plans = Array.isArray(data.plans)
      ? data.plans
      : data.plan
        ? [data.plan]
        : [];

    savedPlans = plans
      .filter(validPlan)
      .map(plan => ({
        ...plan,
        days: plan.days.filter(day => day.tasks.length > 0)
      }))
      .filter(plan => plan.days.length > 0);

    if (!Array.isArray(data.plans) && savedPlans.length) {
      form.reset();
    }

  } catch {
    storageMessage.textContent = "Не удалось прочитать сохранённые данные.";
  }
}

composer.addEventListener("pointerenter", event => {
  if (event.pointerType && event.pointerType !== "mouse") return;
  if (!composer.classList.contains("is-collapsed")) return;

  composerHoverPreview = true;
  setComposerExpanded(true, { focus: false });
});

composer.addEventListener("pointerleave", event => {
  if (event.pointerType && event.pointerType !== "mouse") return;
  if (!composerHoverPreview) return;
  composerHoverPreview = false;
  setComposerExpanded(false, { focus: false });
});

composer.addEventListener("pointerdown", () => {
  composerHoverPreview = false;
});

composerToggle.addEventListener("click", () => {
  composerHoverPreview = false;
  setComposerExpanded(true);
});
tasksInput.addEventListener("keydown", continueTaskList);

form.addEventListener("input", () => {
  message.textContent = "";
  message.className = "";
  persist();
});

form.addEventListener("submit", event => {
  event.preventDefault();

  if (!parseTaskInput(tasksInput.value).tasks.length) {
    message.className = "error";
    message.textContent = "Введите текст заметки.";
    tasksInput.focus();
    return;
  }

  createNote({ strictDate: true });
});

document.addEventListener("pointerdown", event => {
  if (composer.classList.contains("is-collapsed")) return;
  if (composer.contains(event.target)) return;

  if (parseTaskInput(tasksInput.value).tasks.length) {
    createNote();
  } else {
    setComposerExpanded(false);
  }
});

