"use strict";

const PROFILE_KEY = "exam-planner-profile";
const profileToggle = document.getElementById("profile-toggle");
const profileMenu = document.getElementById("profile-menu");
const profileName = document.getElementById("profile-name");
const profileSave = document.getElementById("profile-save");
const profileStatus = document.getElementById("profile-status");

function profileInitial(name) {
  return name.trim().charAt(0).toLocaleUpperCase("ru-RU") || "У";
}

function loadProfile() {
  try {
    const name = localStorage.getItem(PROFILE_KEY) || "";
    profileName.value = name;
    profileToggle.textContent = profileInitial(name);
  } catch {
    profileStatus.textContent = "Профиль недоступен в этом браузере.";
  }
}

function setProfileMenu(open) {
  profileMenu.hidden = !open;
  profileToggle.setAttribute("aria-expanded", String(open));
  if (open) profileName.focus();
}

profileToggle.addEventListener("click", event => {
  event.stopPropagation();
  setProfileMenu(profileMenu.hidden);
});

profileSave.addEventListener("click", () => {
  const name = profileName.value.trim();

  try {
    localStorage.setItem(PROFILE_KEY, name);
    profileToggle.textContent = profileInitial(name);
    profileStatus.textContent = name ? `Сохранено: ${name}` : "Используется стандартный профиль.";
  } catch {
    profileStatus.textContent = "Не удалось сохранить имя.";
  }
});

profileMenu.addEventListener("click", event => event.stopPropagation());
document.addEventListener("click", () => setProfileMenu(false));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !profileMenu.hidden) {
    setProfileMenu(false);
    profileToggle.focus();
  }
});

loadProfile();
