import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

const theme = new URLSearchParams(window.location.search).get("theme");
if (theme === "dark" || theme === "light") {
  document.documentElement.dataset.theme = theme;
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
