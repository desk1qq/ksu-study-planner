"use strict";

const searchInput = document.getElementById("search");
const viewToggle = document.getElementById("view-toggle");
const menuToggle = document.getElementById("menu-toggle");
const noResults = document.getElementById("no-results");
const themeToggle = document.getElementById("theme-toggle");
const themeStatus = document.getElementById("theme-status");

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
  const hidden = document.body.classList.toggle("sidebar-hidden");
  menuToggle.setAttribute("aria-expanded", String(!hidden));
  menuToggle.setAttribute("aria-label", hidden ? "Показать боковую панель" : "Скрыть боковую панель");
});

filterNotes();
