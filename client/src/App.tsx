import React from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/hooks/use-language";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import { SimplePDFViewer } from "@/components/simple-pdf-viewer";

// Wrapper component for SimplePDFViewer with default props
function SimplePDFViewerPage() {
  const handleClose = () => {
    window.history.back();
  };

  const handleTextEdit = (newText: string) => {
    console.log('Text edited:', newText);
  };

  const handleExport = (format: string) => {
    console.log('Export format:', format);
  };

  // This component is meant for testing/demo purposes with sample data
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Simple PDF Viewer Demo</h1>
      <p className="text-gray-600 mb-4">
        This is a demo page. For actual PDF viewing, upload documents through the main dashboard.
      </p>
      <button 
        onClick={() => window.location.href = '/'}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Go to Dashboard
      </button>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/pdf-simple" component={SimplePDFViewerPage} />
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
