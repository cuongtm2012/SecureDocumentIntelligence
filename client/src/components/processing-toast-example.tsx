
import React, { useState } from 'react';
import { ProcessingToast } from './processing-toast';
import { Button } from '@/components/ui/button';

// Example component showing how to use ProcessingToast
export function ProcessingToastExample() {
  const [isAwayFromUpload, setIsAwayFromUpload] = useState(false);
  const [processingFiles] = useState([
    {
      id: '1',
      name: 'document1.pdf',
      status: 'processing' as const,
      progress: 45,
      type: 'pdf' as const,
    },
    {
      id: '2', 
      name: 'very-long-filename-that-needs-truncation.pdf',
      status: 'uploading' as const,
      progress: 78,
      type: 'pdf' as const,
    },
    {
      id: '3',
      name: 'image.jpg',
      status: 'queued' as const,
      type: 'image' as const,
    },
  ]);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Processing Toast Example</h2>
      
      <div className="space-y-4">
        <Button 
          onClick={() => setIsAwayFromUpload(!isAwayFromUpload)}
          variant={isAwayFromUpload ? "destructive" : "default"}
        >
          {isAwayFromUpload ? 'Return to Upload Page' : 'Navigate Away from Upload'}
        </Button>
        
        <div className="text-sm text-gray-600">
          <p>Status: {isAwayFromUpload ? 'Away from upload page' : 'On upload page'}</p>
          <p>Processing files: {processingFiles.length}</p>
        </div>
      </div>

      <ProcessingToast
        processingFiles={processingFiles}
        isAwayFromUploadPage={isAwayFromUpload}
        onDismiss={() => console.log('Toast dismissed')}
        autoHideDuration={0}
      />
    </div>
  );
}
