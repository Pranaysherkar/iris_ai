"use client";

import { useSyncExternalStore } from "react";

export type UiTheme = "light" | "dark";

function getThemeSnapshot(): UiTheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function subscribeTheme(onChange: () => void): () => void {
  const el = document.documentElement;
  const mo = new MutationObserver(onChange);
  mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("storage", onChange);
  return () => {
    mo.disconnect();
    window.removeEventListener("storage", onChange);
  };
}

/** Tracks `document.documentElement[data-theme]` (set by ChatArea theme toggle + localStorage). */
export function useUiTheme(): UiTheme {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => "dark");
}

export function irisLogoSrc(theme: UiTheme): string {
  return theme === "light" ? "/iris_light_mode.gif" : "/iris.gif";
}
