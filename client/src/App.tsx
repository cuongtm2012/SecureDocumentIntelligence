import React from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/hooks/use-language";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import { PDFViewerDemo } from "@/components/pdf-viewer-demo";
import { PDFDiagnostics } from "@/components/pdf-diagnostics";
import { PDFDebugViewer } from "@/components/pdf-debug-viewer";
import { SimplePDFViewer } from "@/components/simple-pdf-viewer";
import { FixedPDFViewer } from "@/components/fixed-pdf-viewer";
import { PDFTestHub } from "@/components/pdf-test-hub";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/pdf-test" component={PDFTestHub} />
      <Route path="/pdf-demo" component={PDFViewerDemo} />
      <Route path="/pdf-diagnostics" component={PDFDiagnostics} />
      <Route path="/pdf-debug" component={PDFDebugViewer} />
      <Route path="/pdf-simple" component={SimplePDFViewer} />
      <Route path="/pdf-fixed" component={FixedPDFViewer} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
