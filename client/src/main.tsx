import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// React PDF Viewer CSS imports (replacing react-pdf imports)
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

// Configure PDF.js worker to use CDN instead of local file
import { GlobalWorkerOptions } from 'pdfjs-dist';

// Use CDN worker instead of local file to avoid large file in git
GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
