"use strict";

const searchInput = document.getElementById("search");
const viewToggle = document.getElementById("view-toggle");
const menuToggle = document.getElementById("menu-toggle");
const sidebar = document.getElementById("sidebar");
const noResults = document.getElementById("no-results");
const themeToggle = document.getElementById("theme-toggle");
const themeStatus = document.getElementById("theme-status");
const SIDEBAR_STORAGE_KEY = "exam-planner-sidebar";

function setSidebarCollapsed(collapsed, { save = false } = {}) {
  document.body.classList.remove("sidebar-peek");
  document.body.classList.toggle("sidebar-hidden", collapsed);
  document.documentElement.dataset.sidebarState = collapsed ? "collapsed" : "expanded";
  menuToggle.setAttribute("aria-expanded", String(!collapsed));
  menuToggle.setAttribute("aria-label", collapsed ? "Развернуть боковую панель" : "Свернуть боковую панель");

  if (!save) return;
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // Панель продолжает работать, даже если сохранение настроек запрещено.
  }
}

setSidebarCollapsed(document.documentElement.dataset.sidebarState === "collapsed");

sidebar.addEventListener("pointerenter", event => {
  if (event.pointerType && event.pointerType !== "mouse") return;
  if (!window.matchMedia("(hover: hover) and (min-width: 761px)").matches) return;
  if (document.documentElement.dataset.sidebarState !== "collapsed") return;
  document.body.classList.add("sidebar-peek");
});

sidebar.addEventListener("pointerleave", event => {
  if (event.pointerType && event.pointerType !== "mouse") return;
  document.body.classList.remove("sidebar-peek");
});

function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  const label = dark ? "Включить светлую тему" : "Включить тёмную тему";
  themeToggle.setAttribute("aria-pressed", String(dark));
  themeToggle.setAttribute("aria-label", label);
  themeToggle.title = label;
}

themeToggle.addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  updateThemeButton();
  themeStatus.textContent = "";
  try {
    localStorage.setItem("exam-planner-theme", theme);
  } catch {
    themeStatus.textContent = "Тема изменена. Браузер не разрешил сохранить выбор после закрытия страницы.";
  }
});

updateThemeButton();

function filterNotes() {
  const query = searchInput.value.trim().toLocaleLowerCase("ru-RU");
  const cards = [...planContainer.querySelectorAll(".day")];
  let visible = 0;
  for (const card of cards) {
    const content = [
      card.querySelector("h3"),
      card.querySelector(".card-exam"),
      card.querySelector(".task-content")
    ]
      .filter(Boolean)
      .map(element => element.textContent)
      .join(" ");
    card.hidden = !content.toLocaleLowerCase("ru-RU").includes(query);
    if (!card.hidden) visible += 1;
  }
  noResults.hidden = !query || cards.length === 0 || visible > 0;
  for (const heading of planContainer.querySelectorAll(".note-group-title")) {
    heading.hidden = !cards.some(card => card.dataset.group === heading.dataset.group && !card.hidden);
  }
}

searchInput.addEventListener("input", filterNotes);
new MutationObserver(filterNotes).observe(planContainer, { childList: true });

viewToggle.addEventListener("click", () => {
  const listView = planContainer.classList.toggle("list-view");
  viewToggle.setAttribute("aria-pressed", String(listView));
  viewToggle.setAttribute("aria-label", listView ? "Показать сеткой" : "Показать списком");
});

menuToggle.addEventListener("click", () => {
  setSidebarCollapsed(!document.body.classList.contains("sidebar-hidden"), { save: true });
});

filterNotes();
