import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import SmoothScroll from "./components/SmoothScroll.jsx";
import "lenis/dist/lenis.css";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SmoothScroll><App /></SmoothScroll>
  </React.StrictMode>,
);
