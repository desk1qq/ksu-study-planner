"use strict";

const DAY_MS = 86400000;

function calendarDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;

  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return NaN;
  }

  return date.getTime() / DAY_MS;
}

function todayDay() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return calendarDay(`${year}-${month}-${day}`);
}

function dateString(day) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function parseTaskInput(value) {
  const lines = value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const firstLine = lines[0] || "";
  const listType = /^\d+[.)]\s+/.test(firstLine)
    ? "ordered"
    : /^[-–—]\s+/.test(firstLine)
      ? "unordered"
      : "plain";

  const tasks = lines
    .map(line => {
      if (listType === "ordered") return line.replace(/^\d+[.)]\s*/, "");
      if (listType === "unordered") return line.replace(/^[-–—]\s*/, "");
      return line;
    })
    .filter(Boolean);

  return { tasks, listType };
}

function parseEditableTaskInput(value, currentListType) {
  if (currentListType === "checklist") return parseTaskInput(value);

  const parsed = parseTaskInput(value);
  if (parsed.listType !== "plain") return parsed;

  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines.at(-1).trim()) lines.pop();

  return { tasks: lines, listType: "plain" };
}

function formatTaskInput(tasks, listType) {
  if (listType === "ordered") {
    return tasks.map((task, index) => `${index + 1}. ${task}`).join("\n");
  }

  if (listType === "unordered") {
    return tasks.map(task => `- ${task}`).join("\n");
  }

  return tasks.join("\n");
}

function continueTaskList(event) {
  if (event.key !== "Enter" || event.shiftKey) return;

  const input = event.currentTarget;
  const textBeforeCursor = input.value.slice(0, input.selectionStart);
  const currentLine = textBeforeCursor.split(/\r?\n/).at(-1);
  const numbered = currentLine.match(/^\s*(\d+)[.)]\s+/);
  const bulleted = currentLine.match(/^\s*[-–—]\s+/);

  if (!numbered && !bulleted) return;

  event.preventDefault();
  const prefix = numbered ? `${Number(numbered[1]) + 1}. ` : "- ";
  input.setRangeText(`\n${prefix}`, input.selectionStart, input.selectionEnd, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function studyDaysBetween(startDay, endDay, weekdays = [0, 1, 2, 3, 4, 5, 6]) {
  const allowedWeekdays = new Set(weekdays);
  return Array.from({ length: Math.max(0, endDay - startDay) }, (_, index) => startDay + index)
    .filter(day => allowedWeekdays.has(new Date(day * DAY_MS).getUTCDay()));
}

function distributeTasks(tasks, startDay, endDay, listType, weekdays) {
  const studyDays = studyDaysBetween(startDay, endDay, weekdays);
  if (!studyDays.length) return [];

  const baseCount = Math.floor(tasks.length / studyDays.length);
  const extraCount = tasks.length % studyDays.length;
  let taskOffset = 0;

  return Array.from(
    { length: Math.min(studyDays.length, tasks.length) },
    (_, index) => {
      const count = baseCount + (index < extraCount ? 1 : 0);
      const day = {
        date: dateString(studyDays[index]),
        tasks: tasks.slice(taskOffset, taskOffset + count),
        listType
      };
      taskOffset += count;
      return day;
    }
  );
}
