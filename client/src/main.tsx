import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { Toaster } from "@/components/ui/toaster";

// Configure PDF.js worker ONCE before any PDF operations
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source to the local file
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

createRoot(document.getElementById("root")!).render(
  // Remove StrictMode to prevent double mounting during development
  <div>
    <App />
    <Toaster />
  </div>
);
