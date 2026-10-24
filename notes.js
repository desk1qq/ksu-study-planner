"use strict";

let currentNotesView = "active";
let noteEditor = null;

function noteState(day) {
  return day.state === "trash" || day.state === "archive" ? day.state : "active";
}

function noteEntries() {
  return savedPlans.flatMap(plan => plan.days.map(day => {
    if (!day.id) day.id = crypto.randomUUID();
    return { plan, day };
  }));
}

function noteName(plan, day) { return day.name || plan.name; }
function noteExamDate(plan, day) { return day.examDate || plan.examDate; }

function switchNotesView(view) {
  currentNotesView = view;
  document.getElementById("search").value = "";
  document.getElementById("note-action-status").textContent = "";
  renderPlan();
}

for (const button of document.querySelectorAll("[data-view]")) {
  button.addEventListener("click", () => switchNotesView(button.dataset.view));
}

function renderNoteCollection() {
  const titles = { active: "МОЙ ПЛАН", archive: "АРХИВ", trash: "КОРЗИНА" };
  document.getElementById("notes-title").textContent = titles[currentNotesView];
  document.querySelector(".composer").hidden = currentNotesView !== "active";
  for (const button of document.querySelectorAll("[data-view]")) {
    const active = button.dataset.view === currentNotesView;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  const entries = noteEntries().filter(({ day }) => noteState(day) === currentNotesView);
  summary.textContent = currentNotesView === "trash"
    ? `Заметок: ${entries.length}. Можно восстановить или удалить навсегда. Автоматического удаления нет.`
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
    ? [["pinned", "Закреплённые", entries.filter(({ day }) => day.pinned)], ["other", "Другие", entries.filter(({ day }) => !day.pinned)]]
    : [[currentNotesView, "", entries]];
  for (const [group, label, items] of groups) {
    if (!items.length) continue;
    if (label) {
      const heading = noteElement("h3", "note-group-title", label);
      heading.dataset.group = group;
      planContainer.append(heading);
    }
    for (const { plan, day } of items) planContainer.append(createNoteCard(plan, day, group));
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
  if (metadata.length) {
    card.append(noteElement("p", "card-exam", metadata.join(" · ")));
  }

  const list = noteElement(day.listType === "ordered" ? "ol" : day.listType === "unordered" ? "ul" : "div", "task-content");
  for (const task of day.tasks) list.append(noteElement(day.listType === "plain" || !day.listType ? "p" : "li", "", task));
  card.append(list);
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
      event.preventDefault(); openNoteEditor(plan, day);
    }
  });
  return card;
}

function changeNoteState(plan, day, action) {
  let status = "";
  if (action === "pin") {
    day.pinned = !day.pinned;
    if (day.pinned) day.state = "active";
    status = day.pinned ? "Заметка закреплена." : "Заметка откреплена.";
  } else if (action === "archive") {
    day.state = "archive"; day.pinned = false; status = "Заметка перемещена в архив.";
  } else if (action === "unarchive") {
    day.state = "active"; status = "Заметка возвращена из архива.";
  } else if (action === "trash") {
    day.previousState = "active"; day.state = "trash"; day.pinned = false; status = "Заметка перемещена в корзину.";
  } else if (action === "restore") {
    day.state = "active";
    delete day.previousState;
    status = "Заметка восстановлена в плане подготовки.";
  } else if (action === "delete") {
    if (noteState(day) !== "trash" || !window.confirm("Удалить эту заметку навсегда? Восстановить её будет нельзя.")) return false;
    plan.days = plan.days.filter(item => item !== day);
    savedPlans = savedPlans.filter(item => item.days.length);
    status = "Заметка удалена навсегда.";
  }
  closeNoteEditor();
  persist(); renderPlan();
  document.getElementById("note-action-status").textContent = status;
  const next = [...planContainer.querySelectorAll(".day")].find(card => card.dataset.noteId === day.id);
  (next || document.querySelector(`[data-view="${currentNotesView}"]`)).focus({ preventScroll: true });
  return true;
}

function closeNoteEditor() {
  if (!noteEditor) return;
  closeNotePanel();
  noteEditor.close(); noteEditor.remove(); noteEditor = null;
}

function openNoteEditor(plan, day) {
  closeNotePanel(); closeNoteEditor();
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
    else { input.rows = 12; input.className = "note-text"; }
    input.value = value;
    input.readOnly = noteState(day) === "trash";
    label.append(input); editorForm.append(label);
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
    if (!parsed.tasks.length) { error.textContent = "Введите текст заметки."; return false; }
    Object.assign(day, draft, { name: name.value.trim(), tasks: parsed.tasks, listType: parsed.listType });
    if (!draft.reminder) delete day.reminder;
    if (action) { changeNoteState(plan, day, action); return true; }
    error.textContent = "";
    persist();
    document.getElementById("note-action-status").textContent = "Изменения сохранены автоматически.";
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
  editorForm.append(actions); dialog.append(editorForm); document.body.append(dialog);
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    closeEditor();
  });
  dialog.showModal(); name.focus();
}
