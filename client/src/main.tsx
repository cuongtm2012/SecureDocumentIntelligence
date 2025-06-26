import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { Toaster } from "@/components/ui/toaster";

createRoot(document.getElementById("root")!).render(
  // Remove StrictMode to prevent double mounting during development
  <div>
    <App />
    <Toaster />
  </div>
);
