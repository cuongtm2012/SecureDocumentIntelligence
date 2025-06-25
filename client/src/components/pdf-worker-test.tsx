import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { GlobalWorkerOptions } from 'pdfjs-dist';

export function PDFWorkerTest() {
  const [workerStatus, setWorkerStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [workerUrl, setWorkerUrl] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const testWorker = async () => {
    setWorkerStatus('checking');
    setErrorMessage('');

    try {
      // Check if GlobalWorkerOptions is configured
      const configuredUrl = GlobalWorkerOptions.workerSrc;
      setWorkerUrl(configuredUrl);

      if (!configuredUrl) {
        throw new Error('PDF.js worker not configured');
      }

      // Test if the worker URL is accessible
      const response = await fetch(configuredUrl, { method: 'HEAD' });
      
      if (!response.ok) {
        throw new Error(`Worker file not accessible: ${response.status} ${response.statusText}`);
      }

      // Try to initialize a simple PDF.js operation to test worker
      const { getDocument } = await import('pdfjs-dist');
      
      // Create a minimal PDF test (1x1 pixel PDF in base64)
      const testPdfData = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPD4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQo+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmCjAwMDAwMDAwMDkgMDAwMDAgbgowMDAwMDAwMDU4IDAwMDAwIG4KMDAwMDAwMDExNSAwMDAwMCBuCnRyYWlsZXIKPDwKL1NpemUgNAovUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKMTc0CiUlRU9G';
      
      const loadingTask = getDocument(testPdfData);
      const pdf = await loadingTask.promise;
      
      console.log('✅ PDF.js worker test successful, PDF pages:', pdf.numPages);
      setWorkerStatus('success');
      
    } catch (error: any) {
      console.error('❌ PDF.js worker test failed:', error);
      setErrorMessage(error.message || 'Unknown error');
      setWorkerStatus('error');
    }
  };

  useEffect(() => {
    testWorker();
  }, []);

  const getStatusBadge = () => {
    switch (workerStatus) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Working</Badge>;
      case 'checking':
        return <Badge className="bg-blue-100 text-blue-800"><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Testing</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800"><AlertTriangle className="w-3 h-3 mr-1" />Error</Badge>;
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          PDF.js Worker Status
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold text-sm">Worker URL:</h4>
            <p className="text-xs font-mono bg-gray-100 p-2 rounded break-all">
              {workerUrl || 'Not configured'}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-sm">Status:</h4>
            <p className="text-sm">{workerStatus}</p>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <h4 className="font-semibold text-red-800 text-sm">Error Details:</h4>
            <p className="text-red-700 text-xs">{errorMessage}</p>
          </div>
        )}

        {workerStatus === 'success' && (
          <div className="bg-green-50 border border-green-200 rounded p-3">
            <h4 className="font-semibold text-green-800 text-sm">✅ Success!</h4>
            <p className="text-green-700 text-xs">
              PDF.js worker is properly configured and working without CSP violations.
            </p>
          </div>
        )}

        <Button onClick={testWorker} size="sm" variant="outline">
          <RefreshCw className="w-4 h-4 mr-1" />
          Retest Worker
        </Button>
      </CardContent>
    </Card>
  );
}