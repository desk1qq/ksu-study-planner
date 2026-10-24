"use strict";

const NOTES_VIEW_KEY = "exam-planner-current-view";
const NOTES_VIEWS = new Set(["active", "archive", "trash"]);

function restoreNotesView() {
  try {
    const storedView = localStorage.getItem(NOTES_VIEW_KEY);
    return NOTES_VIEWS.has(storedView) ? storedView : "active";
  } catch {
    return "active";
  }
}

function persistNotesView(view) {
  try {
    localStorage.setItem(NOTES_VIEW_KEY, view);
  } catch {
    // Навигация продолжает работать, даже если хранилище недоступно.
  }
}

let currentNotesView = restoreNotesView();
let noteEditor = null;
const deleteConfirm = document.getElementById("delete-confirm");
const deleteConfirmTitle = document.getElementById("delete-confirm-title");
const trashControls = document.getElementById("trash-controls");
const emptyTrashButton = document.getElementById("empty-trash");
const noteToast = document.getElementById("note-toast");
const noteToastMessage = document.getElementById("note-toast-message");
const noteToastUndo = document.getElementById("note-toast-undo");
const noteToastClose = document.getElementById("note-toast-close");
const noteActionStatus = document.getElementById("note-action-status");
const notesSearch = document.getElementById("search");
const notesTitle = document.getElementById("notes-title");
const composerPanel = document.querySelector(".composer");
const trashNavigationButton = document.querySelector('[data-view="trash"]');
const TRASH_RETENTION_MS = 7 * DAY_MS;
const TOAST_DURATION_MS = 4000;
let pendingConfirmation = null;
let toastTimer = null;
let toastHideTimer = null;
let toastUndoAction = null;
let trashPurgeTimer = null;

function hideNoteToast() {
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  noteToast.classList.remove("is-visible");
  toastHideTimer = setTimeout(() => {
    noteToast.hidden = true;
    toastUndoAction = null;
  }, 180);
}

function showNoteToast(message, undoAction) {
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  noteToastMessage.textContent = message;
  toastUndoAction = undoAction;
  noteToastUndo.hidden = typeof undoAction !== "function";
  noteToast.hidden = false;
  requestAnimationFrame(() => noteToast.classList.add("is-visible"));
  toastTimer = setTimeout(hideNoteToast, TOAST_DURATION_MS);
}

noteToastUndo.addEventListener("click", () => {
  const undo = toastUndoAction;
  hideNoteToast();
  if (undo) undo();
});

noteToastClose.addEventListener("click", hideNoteToast);

deleteConfirm.querySelector("form").addEventListener("submit", event => {
  event.preventDefault();
  const confirmed = event.submitter?.value === "delete";
  const action = pendingConfirmation;
  pendingConfirmation = null;
  deleteConfirm.close(confirmed ? "delete" : "cancel");

  if (confirmed && action) {
    action();
  }
});

deleteConfirm.addEventListener("cancel", () => {
  pendingConfirmation = null;
});

function requestConfirmation(text, action) {
  pendingConfirmation = action;
  deleteConfirmTitle.textContent = text;
  deleteConfirm.returnValue = "cancel";
  deleteConfirm.showModal();
}

function requestPermanentDeletion(plan, day) {
  requestConfirmation("Удалить навсегда?", () => deleteNotePermanently(plan, day));
}

function deleteNotePermanently(plan, day) {
  plan.days = plan.days.filter(item => item !== day);
  savedPlans = savedPlans.filter(item => item.days.length);
  closeNoteEditor();
  persist();
  renderPlan();
  noteActionStatus.textContent = "Заметка удалена навсегда.";
  trashNavigationButton.focus({ preventScroll: true });
}

function noteState(day) {
  return day.state === "trash" || day.state === "archive" ? day.state : "active";
}

function noteEntries() {
  return savedPlans.flatMap(plan => plan.days.map(day => {
    if (!day.id) day.id = crypto.randomUUID();
    return { plan, day };
  }));
}

function purgeExpiredTrash(now = Date.now()) {
  let changed = false;

  for (const plan of savedPlans) {
    plan.days = plan.days.filter(day => {
      if (noteState(day) !== "trash") return true;

      const trashedAt = Date.parse(day.trashedAt);
      if (!Number.isFinite(trashedAt)) {
        day.trashedAt = new Date(now).toISOString();
        changed = true;
        return true;
      }

      if (now - trashedAt < TRASH_RETENTION_MS) return true;
      changed = true;
      return false;
    });
  }

  savedPlans = savedPlans.filter(plan => plan.days.length);
  if (changed) persist();
  scheduleNextTrashPurge(now);
}

function scheduleNextTrashPurge(now = Date.now()) {
  clearTimeout(trashPurgeTimer);
  const expirationTimes = savedPlans.flatMap(plan => plan.days
    .filter(day => noteState(day) === "trash")
    .map(day => Date.parse(day.trashedAt) + TRASH_RETENTION_MS)
    .filter(Number.isFinite));

  if (!expirationTimes.length) return;
  const delay = Math.max(0, Math.min(...expirationTimes) - now);
  trashPurgeTimer = setTimeout(() => renderPlan(), delay + 50);
}

function emptyTrash() {
  for (const plan of savedPlans) {
    plan.days = plan.days.filter(day => noteState(day) !== "trash");
  }

  savedPlans = savedPlans.filter(plan => plan.days.length);
  persist();
  renderPlan();
  noteActionStatus.textContent = "Корзина очищена.";
  trashNavigationButton.focus({ preventScroll: true });
}

emptyTrashButton.addEventListener("click", () => {
  requestConfirmation("Очистить корзину?", emptyTrash);
});

function noteName(plan, day) {
  return day.name || plan.name;
}

function noteExamDate(plan, day) {
  return day.examDate || plan.examDate;
}

function formatStudyWeekdays(weekdays) {
  if (!Array.isArray(weekdays) || !weekdays.length) return "";
  const labels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  return weekdays.map(day => labels[day]).filter(Boolean).join(", ");
}

function switchNotesView(view) {
  if (!NOTES_VIEWS.has(view)) return;
  currentNotesView = view;
  document.documentElement.dataset.notesView = view;
  persistNotesView(view);
  notesSearch.value = "";
  noteActionStatus.textContent = "";
  renderPlan();
}

for (const button of document.querySelectorAll("[data-view]")) {
  button.addEventListener("click", () => switchNotesView(button.dataset.view));
}

function renderNoteCollection() {
  purgeExpiredTrash();
  const titles = { active: "МОЙ ПЛАН", archive: "АРХИВ", trash: "КОРЗИНА" };
  notesTitle.textContent = titles[currentNotesView];
  composerPanel.hidden = currentNotesView !== "active";
  trashControls.hidden = currentNotesView !== "trash";
  for (const button of document.querySelectorAll("[data-view]")) {
    const active = button.dataset.view === currentNotesView;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  const entries = noteEntries().filter(({ day }) => noteState(day) === currentNotesView);
  summary.textContent = currentNotesView === "trash"
    ? `Заметок: ${entries.length}. Можно восстановить или удалить навсегда.`
    : `Заметок: ${entries.length}. Нажмите на карточку, чтобы открыть её.`;
  if (!entries.length) {
    const emptyText = currentNotesView === "archive"
      ? "В архиве пока пусто."
      : currentNotesView === "trash"
        ? "Корзина пуста."
        : "Здесь появятся ваши заметки. Создайте план подготовки.";
    planContainer.append(noteElement("p", "empty", emptyText));
    return;
  }
  const groups = currentNotesView === "active"
    ? [
        ["pinned", "Закреплённые", entries.filter(({ day }) => day.pinned)],
        ["other", "Другие", entries.filter(({ day }) => !day.pinned)]
      ]
    : [[currentNotesView, "", entries]];
  for (const [group, label, items] of groups) {
    if (!items.length) continue;
    if (label) {
      const heading = noteElement("h3", "note-group-title", label);
      heading.dataset.group = group;
      planContainer.append(heading);
    }
    for (const { plan, day } of items) {
      planContainer.append(createNoteCard(plan, day, group));
    }
  }
}

function actionIcon(kind) {
  const paths = {
    pin: '<path d="M8 3h8l-1 6 3 4v2H6v-2l3-4-1-6ZM12 15v7"/>',
    archive: '<path d="M4 8h16v13H4zM3 3h18v5H3zM9 12h6"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    restore: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
    edit: '<path d="m4 16 12-12 4 4L8 20H4v-4ZM14 6l4 4"/>'
  };
  const holder = noteElement("span");
  holder.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths[kind] + '</svg>';
  return holder.firstElementChild;
}

function iconAction(label, icon, action) {
  const button = noteButton(label, "", action);
  button.append(actionIcon(icon));
  return button;
}

function taskContainer(day) {
  const listTag = day.listType === "ordered"
    ? "ol"
    : day.listType === "unordered"
      ? "ul"
      : "div";
  const itemTag = day.listType === "plain" || !day.listType ? "p" : "li";
  const list = noteElement(listTag, "task-content");

  for (const task of day.tasks) {
    list.append(noteElement(itemTag, "", task));
  }

  return list;
}

function createNoteCard(plan, day, group) {
  const card = noteElement("article", "day");
  const name = noteName(plan, day);
  const examDate = noteExamDate(plan, day);
  const hasDate = Number.isFinite(calendarDay(day.date));
  const hasExamDate = Number.isFinite(calendarDay(examDate));

  card.dataset.group = group;
  card.dataset.noteId = day.id;
  card.tabIndex = 0;
  card.setAttribute("aria-label", `${name || "Заметка"}. Открыть.`);

  if (hasDate && !day.quickNote) {
    card.append(noteElement("h3", "", formatDate(day.date)));
  }

  const metadata = [];
  if (name) metadata.push(name);
  if (hasExamDate) metadata.push(`Экзамен: ${formatDate(examDate)}`);
  const studyWeekdays = formatStudyWeekdays(plan.weekdays);
  if (studyWeekdays) metadata.push(`Дни: ${studyWeekdays}`);
  if (metadata.length) {
    card.append(noteElement("p", "card-exam", metadata.join(" · ")));
  }

  card.append(taskContainer(day));
  if (noteState(day) !== "trash") {
    attachNoteTools(card, day);
    const pin = iconAction(day.pinned ? "Открепить" : "Закрепить", "pin", () => changeNoteState(plan, day, "pin"));
    pin.classList.add("pin-button");
    pin.setAttribute("aria-pressed", String(!!day.pinned));
    card.append(pin);
  } else {
    card.noteDay = day;
    applyNoteAppearance(card, day);
    card.append(noteElement("div", "note-toolbar"));
  }
  const actions = card.querySelector(".note-toolbar");
  if (noteState(day) === "trash") {
    actions.append(iconAction("Восстановить", "restore", () => changeNoteState(plan, day, "restore")));
    actions.append(iconAction("Удалить навсегда", "trash", () => changeNoteState(plan, day, "delete")));
  } else {
    actions.append(iconAction("Открыть и редактировать", "edit", () => openNoteEditor(plan, day)));
    const archiveLabel = noteState(day) === "archive" ? "Вернуть из архива" : "В архив";
    const archiveAction = noteState(day) === "archive" ? "unarchive" : "archive";
    actions.append(iconAction(
      archiveLabel,
      "archive",
      () => changeNoteState(plan, day, archiveAction)
    ));
    actions.append(iconAction("В корзину", "trash", () => changeNoteState(plan, day, "trash")));
  }
  card.addEventListener("click", event => {
    if (!event.target.closest("button")) openNoteEditor(plan, day);
  });
  card.addEventListener("keydown", event => {
    if (event.target === card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openNoteEditor(plan, day);
    }
  });
  return card;
}

function changeNoteState(plan, day, action) {
  let status = "";
  const previous = {
    state: day.state,
    pinned: day.pinned,
    previousState: day.previousState,
    trashedAt: day.trashedAt
  };
  let canUndo = false;
  if (action === "pin") {
    day.pinned = !day.pinned;
    if (day.pinned) day.state = "active";
    status = day.pinned ? "Заметка закреплена." : "Заметка откреплена.";
  } else if (action === "archive") {
    day.state = "archive";
    day.pinned = false;
    status = "Заметка перемещена в архив.";
    canUndo = true;
  } else if (action === "unarchive") {
    day.state = "active";
    status = "Заметка возвращена из архива.";
    canUndo = true;
  } else if (action === "trash") {
    day.previousState = "active";
    day.state = "trash";
    day.pinned = false;
    day.trashedAt = new Date().toISOString();
    status = "Заметка перемещена в корзину.";
    canUndo = true;
  } else if (action === "restore") {
    day.state = "active";
    delete day.previousState;
    delete day.trashedAt;
    status = "Заметка восстановлена в плане подготовки.";
    canUndo = true;
  } else if (action === "delete") {
    if (noteState(day) !== "trash") return false;
    requestPermanentDeletion(plan, day);
    return false;
  }
  closeNoteEditor();
  persist();
  renderPlan();
  if (canUndo) {
    showNoteToast(status, () => {
      day.state = previous.state;
      day.pinned = previous.pinned;
      if (previous.previousState === undefined) delete day.previousState;
      else day.previousState = previous.previousState;
      if (previous.trashedAt === undefined) delete day.trashedAt;
      else day.trashedAt = previous.trashedAt;
      persist();
      renderPlan();
    });
  } else {
    noteActionStatus.textContent = status;
  }
  const next = [...planContainer.querySelectorAll(".day")].find(card => card.dataset.noteId === day.id);
  (next || document.querySelector(`[data-view="${currentNotesView}"]`)).focus({ preventScroll: true });
  return true;
}

function closeNoteEditor() {
  if (!noteEditor) return;
  closeNotePanel();
  noteEditor.close();
  noteEditor.remove();
  noteEditor = null;
}

function openNoteEditor(plan, day) {
  closeNotePanel();
  closeNoteEditor();
  const draft = JSON.parse(JSON.stringify(day));
  const dialog = noteElement("dialog", "note-editor");
  noteEditor = dialog;
  dialog.setAttribute("aria-labelledby", "note-editor-title");
  const editorForm = noteElement("form", "note-editor-form");
  editorForm.noValidate = true;
  const heading = noteElement("h2", "", noteState(day) === "trash" ? "Заметка в корзине" : "Заметка");
  heading.id = "note-editor-title";
  editorForm.append(heading);
  function field(title, type, value) {
    const label = noteElement("label", "editor-field", title);
    const input = noteElement(type === "textarea" ? "textarea" : "input");
    if (type !== "textarea") input.type = type;
    else {
      input.rows = 12;
      input.className = "note-text";
    }
    input.value = value;
    input.readOnly = noteState(day) === "trash";
    label.append(input);
    editorForm.append(label);
    return input;
  }
  const name = field("Предмет (необязательно)", "text", noteName(plan, day));
  const tasks = field("Текст", "textarea", formatTaskInput(day.tasks, day.listType));
  const error = noteElement("p", "note-error"); error.setAttribute("role", "status");
  editorForm.append(error);
  if (noteState(day) !== "trash") {
    editorForm.noteDraft = true;
    attachNoteTools(editorForm, draft);
    const pin = iconAction(day.pinned ? "Открепить" : "Закрепить", "pin", () => commit("pin"));
    pin.classList.add("editor-pin");
    pin.setAttribute("aria-pressed", String(!!day.pinned));
    editorForm.append(pin);
  }
  function commit(action) {
    clearTimeout(saveTimer);
    const parsed = parseTaskInput(tasks.value);
    if (!parsed.tasks.length) {
      error.textContent = "Введите текст заметки.";
      return false;
    }
    Object.assign(day, draft, { name: name.value.trim(), tasks: parsed.tasks, listType: parsed.listType });
    if (!draft.reminder) delete day.reminder;
    if (action) {
      changeNoteState(plan, day, action);
      return true;
    }
    error.textContent = "";
    persist();
    noteActionStatus.textContent = "Изменения сохранены автоматически.";
    return true;
  }
  let saveTimer;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => commit(), 250);
  }
  if (noteState(day) !== "trash") {
    name.addEventListener("input", scheduleSave);
    tasks.addEventListener("input", scheduleSave);
    tasks.addEventListener("keydown", continueTaskList);
  }
  editorForm.addEventListener("submit", event => event.preventDefault());
  const actions = noteElement("div", "editor-actions");
  if (noteState(day) === "trash") {
    actions.append(noteButton("Восстановить", "Восстановить", () => changeNoteState(plan, day, "restore")));
    actions.append(noteButton("Удалить навсегда", "Удалить навсегда", () => changeNoteState(plan, day, "delete")));
  } else {
    const archiveLabel = noteState(day) === "archive" ? "Вернуть из архива" : "В архив";
    const archiveAction = noteState(day) === "archive" ? "unarchive" : "archive";
    actions.append(iconAction(archiveLabel, "archive", () => commit(archiveAction)));
    actions.append(iconAction("В корзину", "trash", () => { if (commit()) changeNoteState(plan, day, "trash"); }));
  }
  function closeEditor() {
    if (noteState(day) !== "trash" && !commit()) return;
    closeNoteEditor();
    renderPlan();
  }
  actions.append(noteButton("Закрыть", "Закрыть", closeEditor));
  editorForm.append(actions);
  dialog.append(editorForm);
  document.body.append(dialog);
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    closeEditor();
  });
  dialog.showModal();
  name.focus();
}
