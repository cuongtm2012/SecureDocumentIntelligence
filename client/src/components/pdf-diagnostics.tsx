import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PDFViewer } from './pdf-viewer';
import { 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  FileText, 
  Monitor,
  Wifi
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

export function PDFDiagnostics() {
  const [diagnostics, setDiagnostics] = useState({
    worker: { status: 'checking', message: '' },
    network: { status: 'checking', message: '' },
    pdfjsVersion: '',
    testPdf: { status: 'checking', message: '' }
  });

  const [testPdfUrl, setTestPdfUrl] = useState('');

  useEffect(() => {
    runDiagnostics();
  }, []);

  const runDiagnostics = async () => {
    // Test 1: PDF.js Worker Configuration
    try {
      const workerSrc = pdfjsLib.GlobalWorkerOptions.workerSrc;
      if (workerSrc) {
        setDiagnostics(prev => ({
          ...prev,
          worker: { 
            status: 'success', 
            message: `Worker configured: ${workerSrc}` 
          },
          pdfjsVersion: pdfjsLib.version
        }));
      } else {
        setDiagnostics(prev => ({
          ...prev,
          worker: { 
            status: 'error', 
            message: 'PDF.js worker not configured' 
          }
        }));
      }
    } catch (error) {
      setDiagnostics(prev => ({
        ...prev,
        worker: { 
          status: 'error', 
          message: `Worker error: ${error}` 
        }
      }));
    }

    // Test 2: Network connectivity
    try {
      const response = await fetch('/pdf.worker.min.js', { method: 'HEAD' });
      setDiagnostics(prev => ({
        ...prev,
        network: { 
          status: response.ok ? 'success' : 'error', 
          message: response.ok ? 'Worker file accessible' : 'Worker file not found' 
        }
      }));
    } catch (error) {
      setDiagnostics(prev => ({
        ...prev,
        network: { 
          status: 'error', 
          message: `Network error: ${error}` 
        }
      }));
    }

    // Test 3: Load a simple test PDF
    try {
      const testUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
      const loadingTask = pdfjsLib.getDocument(testUrl);
      const pdf = await loadingTask.promise;
      
      setDiagnostics(prev => ({
        ...prev,
        testPdf: { 
          status: 'success', 
          message: `Test PDF loaded: ${pdf.numPages} pages` 
        }
      }));
      setTestPdfUrl(testUrl);
    } catch (error) {
      setDiagnostics(prev => ({
        ...prev,
        testPdf: { 
          status: 'error', 
          message: `PDF loading failed: ${error}` 
        }
      }));
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-500">OK</Badge>;
      case 'error':
        return <Badge variant="destructive">ERROR</Badge>;
      default:
        return <Badge variant="secondary">CHECKING</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            PDF System Diagnostics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* PDF.js Version */}
          <div className="flex items-center justify-between p-3 border rounded">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>PDF.js Version</span>
            </div>
            <Badge variant="outline">{diagnostics.pdfjsVersion || 'Unknown'}</Badge>
          </div>

          {/* Worker Status */}
          <div className="flex items-center justify-between p-3 border rounded">
            <div className="flex items-center gap-2">
              {getStatusIcon(diagnostics.worker.status)}
              <span>PDF.js Worker</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(diagnostics.worker.status)}
            </div>
          </div>
          {diagnostics.worker.message && (
            <Alert>
              <AlertDescription className="text-sm">
                {diagnostics.worker.message}
              </AlertDescription>
            </Alert>
          )}

          {/* Network Status */}
          <div className="flex items-center justify-between p-3 border rounded">
            <div className="flex items-center gap-2">
              {getStatusIcon(diagnostics.network.status)}
              <span>Network Access</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(diagnostics.network.status)}
            </div>
          </div>
          {diagnostics.network.message && (
            <Alert>
              <AlertDescription className="text-sm">
                {diagnostics.network.message}
              </AlertDescription>
            </Alert>
          )}

          {/* Test PDF */}
          <div className="flex items-center justify-between p-3 border rounded">
            <div className="flex items-center gap-2">
              {getStatusIcon(diagnostics.testPdf.status)}
              <span>Test PDF Loading</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(diagnostics.testPdf.status)}
            </div>
          </div>
          {diagnostics.testPdf.message && (
            <Alert>
              <AlertDescription className="text-sm">
                {diagnostics.testPdf.message}
              </AlertDescription>
            </Alert>
          )}

          <Button onClick={runDiagnostics} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Re-run Diagnostics
          </Button>
        </CardContent>
      </Card>

      {/* PDF Viewer Test */}
      {testPdfUrl && diagnostics.testPdf.status === 'success' && (
        <Card>
          <CardHeader>
            <CardTitle>PDF Viewer Test</CardTitle>
          </CardHeader>
          <CardContent>
            <PDFViewer 
              pdfUrl={testPdfUrl}
              onLoadError={(error) => console.error('PDF Viewer Error:', error)}
              onLoadSuccess={(pdf) => console.log('PDF Viewer Success:', pdf)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
