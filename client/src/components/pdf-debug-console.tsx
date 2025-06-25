import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, RefreshCw, ExternalLink } from 'lucide-react';

// PDF.js worker URL - using official CDN
const PDF_WORKER_URL = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

interface PDFDebugConsoleProps {
  documentId?: number;
}

export function PDFDebugConsole({ documentId }: PDFDebugConsoleProps) {
  const [workerStatus, setWorkerStatus] = useState<'checking' | 'valid' | 'invalid' | 'error'>('checking');
  const [urlTests, setUrlTests] = useState<{
    raw: { status: string; url: string };
    pdf: { status: string; url: string };
  }>({
    raw: { status: 'pending', url: '' },
    pdf: { status: 'pending', url: '' }
  });
  const [networkTest, setNetworkTest] = useState<string>('pending');

  useEffect(() => {
    checkPDFWorker();
    if (documentId) {
      testDocumentUrls();
    }
  }, [documentId]);

  const checkPDFWorker = async () => {
    try {
      setWorkerStatus('checking');
      
      // Test if the PDF.js worker is accessible
      const response = await fetch(PDF_WORKER_URL, { method: 'HEAD' });
      setWorkerStatus(response.ok ? 'valid' : 'invalid');
    } catch (error) {
      console.error('Worker check failed:', error);
      setWorkerStatus('error');
    }
  };

  const testDocumentUrls = async () => {
    if (!documentId) return;

    const baseUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const rawUrl = `${baseUrl}/api/documents/${documentId}/raw`;
    const pdfUrl = `${baseUrl}/api/documents/${documentId}/pdf?page=1`;

    // Test raw URL
    try {
      const response = await fetch(rawUrl, { method: 'HEAD' });
      setUrlTests(prev => ({
        ...prev,
        raw: {
          status: response.ok ? 'success' : `error-${response.status}`,
          url: rawUrl
        }
      }));
    } catch (error) {
      setUrlTests(prev => ({
        ...prev,
        raw: {
          status: `error-${error instanceof Error ? error.message : 'Unknown error'}`,
          url: rawUrl
        }
      }));
    }

    // Test PDF page URL
    try {
      const response = await fetch(pdfUrl, { method: 'HEAD' });
      setUrlTests(prev => ({
        ...prev,
        pdf: {
          status: response.ok ? 'success' : `error-${response.status}`,
          url: pdfUrl
        }
      }));
    } catch (error) {
      setUrlTests(prev => ({
        ...prev,
        pdf: {
          status: `error-${error instanceof Error ? error.message : 'Unknown error'}`,
          url: pdfUrl
        }
      }));
    }
  };

  const testNetworkConnectivity = async () => {
    setNetworkTest('testing');
    try {
      // Test multiple PDF.js worker endpoints
      const tests = [
        fetch('https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js', { method: 'HEAD' }),
        fetch('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js', { method: 'HEAD' }),
        fetch('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', { method: 'HEAD' })
      ];

      const results = await Promise.allSettled(tests);
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      
      if (successCount > 0) {
        setNetworkTest('success');
      } else {
        setNetworkTest('failed');
      }
    } catch (error) {
      setNetworkTest('failed');
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'success' || status === 'valid') {
      return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />OK</Badge>;
    } else if (status === 'checking' || status === 'testing' || status === 'pending') {
      return <Badge className="bg-blue-100 text-blue-800"><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Testing</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800"><AlertTriangle className="w-3 h-3 mr-1" />Error</Badge>;
    }
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          PDF Viewer Debug Console
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* PDF Worker Status */}
        <div className="space-y-2">
          <h3 className="font-semibold">PDF.js Worker Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <span>Worker Status:</span>
              {getStatusBadge(workerStatus)}
            </div>
            <div className="flex items-center justify-between">
              <span>Worker Source:</span>
              <span className="text-sm font-mono truncate max-w-[200px]" title={PDF_WORKER_URL}>
                {PDF_WORKER_URL}
              </span>
            </div>
          </div>
          {workerStatus !== 'valid' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
              <p className="text-sm text-yellow-800">
                <strong>Issue:</strong> PDF.js worker is not accessible. This will prevent PDF loading.
              </p>
            </div>
          )}
        </div>

        {/* Document URL Tests */}
        {documentId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Document URL Accessibility</h3>
              <Button size="sm" variant="outline" onClick={testDocumentUrls}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Retest URLs
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Raw PDF URL:</span>
                <div className="flex items-center gap-2">
                  {getStatusBadge(urlTests.raw.status)}
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => window.open(urlTests.raw.url, '_blank')}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span>PDF Page URL:</span>
                <div className="flex items-center gap-2">
                  {getStatusBadge(urlTests.pdf.status)}
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => window.open(urlTests.pdf.url, '_blank')}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Network Connectivity Test */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">CDN Connectivity</h3>
            <Button size="sm" variant="outline" onClick={testNetworkConnectivity}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Test Network
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <span>External CDN Access:</span>
            {getStatusBadge(networkTest)}
          </div>
        </div>

        {/* Console Instructions */}
        <div className="bg-gray-50 border rounded p-4">
          <h4 className="font-semibold mb-2">Browser Console Debug Commands:</h4>
          <div className="space-y-1 text-sm font-mono">
            <div>• Test PDF worker: <code>fetch('{PDF_WORKER_URL}').then(r => console.log(r.status))</code></div>
            <div>• Test PDF load: <code>{`fetch('/api/documents/${documentId}/raw').then(r => console.log(r.status))`}</code></div>
            <div>• Check Network tab for failed requests</div>
            <div>• Look for PDF.js errors in Console tab</div>
          </div>
        </div>

        {/* Quick Fixes */}
        <div className="bg-blue-50 border border-blue-200 rounded p-4">
          <h4 className="font-semibold mb-2">Quick Fixes to Try:</h4>
          <ul className="text-sm space-y-1 list-disc list-inside">
            <li>Refresh the page to reinitialize PDF viewer</li>
            <li>Clear browser cache and reload</li>
            <li>Check if the document file exists on the server</li>
            <li>Verify the document was processed successfully</li>
            <li>Try opening the PDF URL directly in a new tab</li>
            <li>Check Network tab for CORS or 404 errors</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
