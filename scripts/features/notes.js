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
let actionStatusTimer = null;
let draggedNote = null;
let noteWasDragged = false;

function hideNoteToast() {
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  noteToast.classList.remove("is-visible");
  toastHideTimer = setTimeout(() => {
    noteToast.hidden = true;
    toastUndoAction = null;
  }, 180);
}

function showNoteToast(message, undoAction, actionLabel = "Отменить", hideClose = false) {
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  noteToastMessage.textContent = message;
  toastUndoAction = undoAction;
  noteToastUndo.hidden = typeof undoAction !== "function";
  noteToastUndo.textContent = actionLabel;
  noteToastClose.hidden = hideClose;
  noteToast.hidden = false;
  requestAnimationFrame(() => noteToast.classList.add("is-visible"));
  toastTimer = setTimeout(hideNoteToast, TOAST_DURATION_MS);
}

function showTemporaryActionStatus(message, duration = 2000) {
  clearTimeout(actionStatusTimer);
  noteActionStatus.textContent = message;
  actionStatusTimer = setTimeout(() => {
    if (noteActionStatus.textContent === message) noteActionStatus.textContent = "";
  }, duration);
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
  let generatedId = false;
  const entries = savedPlans.flatMap(plan => plan.days.map(day => {
    if (!day.id) {
      day.id = crypto.randomUUID();
      generatedId = true;
    }
    return { plan, day };
  }));
  if (generatedId) persist();
  return entries;
}

function noteWeekdayOrder(plan, day) {
  const value = calendarDay(day.date);
  const weekday = Number.isFinite(value)
    ? new Date(value * DAY_MS).getUTCDay()
    : Array.isArray(plan.weekdays) && plan.weekdays.length
      ? plan.weekdays[0]
      : -1;
  if (weekday < 0) return 7;
  return (weekday + 6) % 7;
}

function orderNotesAfterCreation() {
  const activeEntries = noteEntries()
    .filter(({ day }) => noteState(day) === "active")
    .map((entry, index) => ({ ...entry, index }));

  activeEntries
    .sort((left, right) => (
      noteWeekdayOrder(left.plan, left.day) - noteWeekdayOrder(right.plan, right.day) ||
      (Number.isFinite(left.day.displayOrder) ? left.day.displayOrder : left.index) -
        (Number.isFinite(right.day.displayOrder) ? right.day.displayOrder : right.index)
    ))
    .forEach(({ day }, index) => {
      day.displayOrder = index;
    });

  weekdayOrderInitialized = true;
}

function prepareNoteOrder(entries) {
  if (!entries.length) return;

  if (!weekdayOrderInitialized) {
    entries
      .map((entry, index) => ({ ...entry, index }))
      .sort((left, right) => (
        noteWeekdayOrder(left.plan, left.day) - noteWeekdayOrder(right.plan, right.day) ||
        left.index - right.index
      ))
      .forEach(({ day }, index) => {
        day.displayOrder = index;
      });
    weekdayOrderInitialized = true;
    persist();
    return;
  }

  let nextOrder = entries.reduce((maximum, { day }) => (
    Number.isFinite(day.displayOrder) ? Math.max(maximum, day.displayOrder + 1) : maximum
  ), 0);
  let changed = false;
  for (const { day } of entries) {
    if (Number.isFinite(day.displayOrder)) continue;
    day.displayOrder = nextOrder++;
    changed = true;
  }
  if (changed) persist();
}

function sortNotesByDisplayOrder(entries) {
  return entries.sort((left, right) => left.day.displayOrder - right.day.displayOrder);
}

function animateNoteMovement(cards, previousPositions) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const card of cards) {
    const previous = previousPositions.get(card);
    if (!previous) continue;
    const current = card.getBoundingClientRect();
    const deltaX = previous.left - current.left;
    const deltaY = previous.top - current.top;
    if (!deltaX && !deltaY) continue;
    card.animate(
      [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }],
      { duration: 220, easing: "cubic-bezier(.2, .8, .2, 1)" }
    );
  }
}

function reorderDraggedNote(targetCard, event) {
  if (!draggedNote || draggedNote === targetCard || draggedNote.dataset.group !== targetCard.dataset.group) return;
  const cards = [...planContainer.querySelectorAll(`.day[data-group="${targetCard.dataset.group}"]`)];
  const previousPositions = new Map(cards.map(card => [card, card.getBoundingClientRect()]));
  const bounds = targetCard.getBoundingClientRect();
  const sameRow = event.clientY >= bounds.top && event.clientY <= bounds.bottom;
  const insertBefore = sameRow
    ? event.clientX < bounds.left + bounds.width / 2
    : event.clientY < bounds.top + bounds.height / 2;
  targetCard.parentElement.insertBefore(draggedNote, insertBefore ? targetCard : targetCard.nextSibling);
  animateNoteMovement(cards, previousPositions);
}

function saveVisibleNoteOrder() {
  const entriesById = new Map(noteEntries().map(entry => [entry.day.id, entry]));
  [...planContainer.querySelectorAll(".day")].forEach((card, index) => {
    const entry = entriesById.get(card.dataset.noteId);
    if (entry) entry.day.displayOrder = index;
  });
  persist();
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

function dayWord(value) {
  const absolute = Math.abs(value);
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "дней";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

function examCountdown(value, preparationDate) {
  const examDay = calendarDay(value);
  if (!Number.isFinite(examDay)) return "";
  const preparationDay = calendarDay(preparationDate);
  const startDay = Number.isFinite(preparationDay) ? preparationDay : todayDay();
  const remaining = examDay - startDay;
  if (remaining > 0) return `До экзамена осталось: ${remaining} ${dayWord(remaining)}`;
  if (remaining === 0) return "Экзамен сегодня";
  return `Экзамен прошёл ${Math.abs(remaining)} ${dayWord(remaining)} назад`;
}

function weekdayName(dayNumber) {
  return ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"][dayNumber] || "";
}

function noteWeekday(plan, day) {
  const calendarDate = calendarDay(day.date);
  if (Number.isFinite(calendarDate)) {
    return weekdayName(new Date(calendarDate * DAY_MS).getUTCDay());
  }

  if (!Array.isArray(plan.weekdays)) return "";
  return plan.weekdays.map(weekdayName).filter(Boolean).join(", ");
}

function dateForWeekday(currentDate, targetWeekday) {
  const currentDay = calendarDay(currentDate);
  if (Number.isFinite(currentDay)) {
    const currentWeekday = new Date(currentDay * DAY_MS).getUTCDay();
    const monday = currentDay - ((currentWeekday + 6) % 7);
    return dateString(monday + ((targetWeekday + 6) % 7));
  }

  const startDay = todayDay();
  const startWeekday = new Date(startDay * DAY_MS).getUTCDay();
  const daysAhead = (targetWeekday - startWeekday + 7) % 7;
  return dateString(startDay + daysAhead);
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
  const allEntries = noteEntries();
  prepareNoteOrder(allEntries);
  const entries = sortNotesByDisplayOrder(
    allEntries.filter(({ day }) => noteState(day) === currentNotesView)
  );
  summary.textContent = currentNotesView === "trash"
    ? `Заметок: ${entries.length}. Можно восстановить или удалить навсегда.`
    : `Заметок: ${entries.length}. Наведите на создание учебной заметки, чтобы открыть её.`;
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
    restore: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>'
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

  function openCard() {
    openNoteEditor(plan, day, card);
  }

  card.dataset.group = group;
  card.dataset.noteId = day.id;
  if (suppressCardEntryAnimation) card.classList.add("skip-entry-animation");
  card.tabIndex = 0;
  card.draggable = currentNotesView === "active";
  card.setAttribute("aria-label", `${name || "Заметка"}. Открыть.`);
  if (card.draggable) card.title = "Перетащите, чтобы изменить порядок";

  if (hasDate && !day.quickNote) {
    card.append(noteElement("h3", "", formatDate(day.date)));
  }

  const weekday = noteWeekday(plan, day);
  if (name || weekday) {
    card.append(noteElement("p", "card-exam", [name, weekday].filter(Boolean).join(" ▪ ")));
  }
  if (hasExamDate) {
    const countdown = noteElement("p", "card-exam-date", examCountdown(examDate, day.date));
    countdown.title = `Дата экзамена: ${formatDate(examDate)}`;
    card.append(countdown);
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
    if (!noteWasDragged && !event.target.closest("button")) openCard();
  });
  card.addEventListener("keydown", event => {
    if (event.target === card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openCard();
    }
  });
  card.addEventListener("dragstart", event => {
    if (!card.draggable) {
      event.preventDefault();
      return;
    }
    draggedNote = card;
    noteWasDragged = true;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", day.id);
    requestAnimationFrame(() => card.classList.add("is-dragging"));
  });
  card.addEventListener("dragover", event => {
    if (!draggedNote || draggedNote.dataset.group !== card.dataset.group) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    reorderDraggedNote(card, event);
  });
  card.addEventListener("drop", event => {
    if (!draggedNote) return;
    event.preventDefault();
    saveVisibleNoteOrder();
    noteActionStatus.textContent = "Порядок заметок сохранён.";
  });
  card.addEventListener("dragend", () => {
    const changed = draggedNote === card;
    card.classList.remove("is-dragging");
    draggedNote = null;
    if (changed) saveVisibleNoteOrder();
    setTimeout(() => {
      noteWasDragged = false;
    }, 0);
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
    if (action === "pin") showTemporaryActionStatus(status);
    else noteActionStatus.textContent = status;
  }
  const next = [...planContainer.querySelectorAll(".day")].find(card => card.dataset.noteId === day.id);
  (next || document.querySelector(`[data-view="${currentNotesView}"]`)).focus({ preventScroll: true });
  return true;
}

function closeNoteEditor(animated = false, onClosed) {
  if (!noteEditor) return;
  closeNotePanel();
  const editor = noteEditor;
  noteEditor = null;
  let finished = false;
  const target = editor.returnTarget;

  function removeEditor() {
    if (finished) return;
    finished = true;
    if (editor.isConnected) {
      editor.close();
      editor.remove();
    }
    if (typeof onClosed === "function") onClosed();
  }

  if (target?.isConnected) target.classList.remove("is-editor-origin");

  if (!animated || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    removeEditor();
    return;
  }

  if (target?.isConnected) {
    const editorRect = editor.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (editorRect.width && editorRect.height && targetRect.width && targetRect.height) {
      const offsetX = targetRect.left + targetRect.width / 2 - (editorRect.left + editorRect.width / 2);
      const offsetY = targetRect.top + targetRect.height / 2 - (editorRect.top + editorRect.height / 2);
      editor.style.setProperty("--note-close-x", `${offsetX}px`);
      editor.style.setProperty("--note-close-y", `${offsetY}px`);
      editor.style.setProperty("--note-close-scale-x", String(targetRect.width / editorRect.width));
      editor.style.setProperty("--note-close-scale-y", String(targetRect.height / editorRect.height));
    }
  }
  editor.classList.add("is-closing");
  editor.addEventListener("animationend", event => {
    if (event.target === editor && event.animationName === "note-close") removeEditor();
  });
  setTimeout(removeEditor, 260);
}

function openNoteEditor(plan, day, originCard) {
  closeNotePanel();
  closeNoteEditor();
  const draft = JSON.parse(JSON.stringify(day));
  const dialog = noteElement("dialog", "note-editor");
  dialog.returnTarget = originCard;
  if (originCard?.isConnected) originCard.classList.add("is-editor-origin");
  noteEditor = dialog;
  dialog.setAttribute("aria-labelledby", "note-editor-title");
  const editorForm = noteElement("form", "note-editor-form");
  editorForm.noValidate = true;
  const isTrashed = noteState(day) === "trash";
  const headingPrefix = isTrashed ? "Заметка в корзине" : "Учебная заметка";
  const heading = noteElement("h2");
  heading.id = "note-editor-title";
  editorForm.append(heading);
  const editorNotice = noteElement("p", "editor-lock-notice");
  editorNotice.setAttribute("role", "status");
  editorNotice.setAttribute("aria-live", "polite");
  editorForm.append(editorNotice);
  let editorNoticeTimer;
  function showEditorNotice(text, action, actionLabel = "") {
    clearTimeout(editorNoticeTimer);
    editorNotice.replaceChildren(noteElement("span", "", text));
    if (typeof action === "function") {
      const actionButton = noteButton(actionLabel, actionLabel, action);
      actionButton.classList.add("editor-notice-action");
      editorNotice.append(actionButton);
    }
    editorNotice.classList.remove("is-visible");
    void editorNotice.offsetWidth;
    editorNotice.classList.add("is-visible");
    editorNoticeTimer = setTimeout(() => editorNotice.classList.remove("is-visible"), 4000);
  }
  function showTrashEditNotice() {
    showEditorNotice("Чтобы внести изменения, восстановите учебную заметку из корзины.");
  }
  editorForm.showNotice = showEditorNotice;
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
  const name = field("Предмет", "text", noteName(plan, day));
  const examDate = field("Дата экзамена (необязательно)", "date", noteExamDate(plan, day));
  let preparationDate = day.date || "";
  const storedPreparationDay = calendarDay(preparationDate);
  let selectedPreparationWeekday = Number.isFinite(storedPreparationDay)
    ? new Date(storedPreparationDay * DAY_MS).getUTCDay()
    : Array.isArray(plan.weekdays) && plan.weekdays.length
      ? plan.weekdays[0]
      : -1;
  const weekdayField = noteElement("div", "editor-weekday-field");
  weekdayField.append(noteElement("span", "editor-weekday-label", "День подготовки (необязательно)"));
  const weekdayOptions = noteElement("div", "editor-weekday-options");
  weekdayOptions.setAttribute("role", "group");
  weekdayOptions.setAttribute("aria-label", "День подготовки");
  const weekdayButtons = [
    [1, "Пн"], [2, "Вт"], [3, "Ср"], [4, "Чт"], [5, "Пт"], [6, "Сб"], [0, "Вс"]
  ].map(([value, label]) => {
    const button = noteButton(label, label, () => {
      if (isTrashed) {
        showTrashEditNotice();
        return;
      }
      const nextPreparationDate = dateForWeekday(preparationDate, value);
      const nextPreparationDay = calendarDay(nextPreparationDate);
      const selectedExamDay = calendarDay(examDate.value);
      if (Number.isFinite(selectedExamDay) && nextPreparationDay >= selectedExamDay) {
        const warning = "День подготовки должен быть раньше даты экзамена. Изменение не сохранено.";
        error.textContent = warning;
        showEditorNotice(warning);
        return;
      }
      selectedPreparationWeekday = value;
      preparationDate = nextPreparationDate;
      error.textContent = "";
      updateWeekdaySelection();
      updateEditorHeading();
      scheduleSave();
    });
    button.classList.add("editor-weekday-option");
    button.dataset.weekday = String(value);
    if (isTrashed) button.setAttribute("aria-disabled", "true");
    weekdayOptions.append(button);
    return button;
  });
  weekdayField.append(weekdayOptions);
  editorForm.append(weekdayField);
  const tasks = field("Текст", "textarea", formatTaskInput(day.tasks, day.listType));
  function updateWeekdaySelection() {
    for (const button of weekdayButtons) {
      const selected = Number(button.dataset.weekday) === selectedPreparationWeekday;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
  }
  function updateEditorHeading() {
    const countdown = examCountdown(examDate.value, preparationDate);
    heading.textContent = countdown ? `${headingPrefix} ▪ ${countdown}` : headingPrefix;
  }
  updateWeekdaySelection();
  updateEditorHeading();
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
  if (isTrashed) {
    editorForm.addEventListener("pointerdown", event => {
      if (event.target.closest(".editor-field input, .editor-field textarea, .editor-weekday-option")) {
        showTrashEditNotice();
      }
    }, true);
    editorForm.addEventListener("keydown", event => {
      if (!event.target.matches(".editor-field input, .editor-field textarea")) return;
      if (["Tab", "Shift", "Escape"].includes(event.key)) return;
      showTrashEditNotice();
    });
  }
  function commit(action) {
    clearTimeout(saveTimer);
    const parsed = parseTaskInput(tasks.value);
    if (!parsed.tasks.length) {
      error.textContent = "Введите текст заметки.";
      return false;
    }
    const selectedExamDay = calendarDay(examDate.value);
    if (examDate.value && !Number.isFinite(selectedExamDay)) {
      error.textContent = "Укажите корректную дату экзамена или оставьте поле пустым.";
      examDate.focus();
      return false;
    }
    const selectedPreparationDay = calendarDay(preparationDate);
    if (preparationDate && !Number.isFinite(selectedPreparationDay)) {
      error.textContent = "Укажите корректный день подготовки или оставьте поле пустым.";
      return false;
    }
    if (Number.isFinite(selectedExamDay) && Number.isFinite(selectedPreparationDay) && selectedPreparationDay >= selectedExamDay) {
      const warning = "День подготовки должен быть раньше даты экзамена. Изменение не сохранено.";
      error.textContent = warning;
      showEditorNotice(warning);
      return false;
    }
    Object.assign(day, draft, { name: name.value.trim(), tasks: parsed.tasks, listType: parsed.listType });
    if (preparationDate) {
      day.date = preparationDate;
      delete day.quickNote;
    } else {
      delete day.date;
      day.quickNote = true;
    }
    plan.examDate = examDate.value;
    plan.weekdays = selectedPreparationWeekday >= 0 ? [selectedPreparationWeekday] : [];
    for (const planDay of plan.days) delete planDay.examDate;
    if (!draft.reminder) delete day.reminder;
    if (action) {
      changeNoteState(plan, day, action);
      return true;
    }
    error.textContent = "";
    persist();
    showTemporaryActionStatus("Изменения сохранены автоматически.", 3000);
    return true;
  }
  let saveTimer;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => commit(), 250);
  }
  if (noteState(day) !== "trash") {
    name.addEventListener("input", scheduleSave);
    examDate.addEventListener("input", () => {
      updateEditorHeading();
      scheduleSave();
    });
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
    closeNoteEditor(true, () => renderPlan({ animateCards: false }));
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
