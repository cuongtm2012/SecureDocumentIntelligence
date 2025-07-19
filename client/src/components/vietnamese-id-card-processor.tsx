
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Upload, CreditCard, CheckCircle, AlertCircle, User, Calendar, MapPin } from 'lucide-react';

interface IDCardData {
  id?: string;
  name?: string;
  date_of_birth?: string;
  sex?: string;
  nationality?: string;
  place_of_origin?: string;
  place_of_residence?: string;
  personal_identification?: string;
  date_of_issue?: string;
  date_of_expiry?: string;
}

interface ProcessingResult {
  success: boolean;
  structuredData: IDCardData;
  confidence: number;
  processingTime: number;
  fieldsExtracted: number;
  error?: string;
}

export function VietnameseIDCardProcessor() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
      setProgress(0);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    },
    maxFiles: 1
  });

  const processIDCard = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setProgress(20);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      setProgress(50);
      
      const response = await fetch('/api/ocr/process-id-card', {
        method: 'POST',
        body: formData,
      });

      setProgress(80);

      const data = await response.json();
      
      setProgress(100);
      setResult(data);
      
    } catch (error) {
      console.error('ID card processing error:', error);
      setResult({
        success: false,
        structuredData: {},
        confidence: 0,
        processingTime: 0,
        fieldsExtracted: 0,
        error: 'Processing failed'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatFieldName = (key: string): string => {
    const fieldNames: Record<string, string> = {
      id: 'ID Number',
      name: 'Full Name',
      date_of_birth: 'Date of Birth',
      sex: 'Gender',
      nationality: 'Nationality',
      place_of_origin: 'Place of Origin',
      place_of_residence: 'Place of Residence',
      personal_identification: 'Personal Identification',
      date_of_issue: 'Date of Issue',
      date_of_expiry: 'Date of Expiry'
    };
    return fieldNames[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getFieldIcon = (key: string) => {
    const iconMap: Record<string, JSX.Element> = {
      id: <CreditCard className="h-4 w-4" />,
      name: <User className="h-4 w-4" />,
      date_of_birth: <Calendar className="h-4 w-4" />,
      date_of_issue: <Calendar className="h-4 w-4" />,
      date_of_expiry: <Calendar className="h-4 w-4" />,
      place_of_origin: <MapPin className="h-4 w-4" />,
      place_of_residence: <MapPin className="h-4 w-4" />
    };
    return iconMap[key] || <CheckCircle className="h-4 w-4" />;
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-6 w-6" />
            Vietnamese ID Card OCR
          </CardTitle>
          <CardDescription>
            Upload a Vietnamese ID card image for automatic data extraction using VietCardOCR
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-primary/50'}
              ${selectedFile ? 'border-green-500 bg-green-50' : ''}`}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            {selectedFile ? (
              <div>
                <p className="text-lg font-medium text-green-600">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">File ready for processing</p>
              </div>
            ) : (
              <div>
                <p className="text-lg font-medium">Drop ID card image here or click to browse</p>
                <p className="text-sm text-gray-500">Supports PNG, JPG, JPEG, WebP</p>
              </div>
            )}
          </div>

          {selectedFile && (
            <div className="mt-4 flex justify-center">
              <Button 
                onClick={processIDCard} 
                disabled={isProcessing}
                className="px-8"
              >
                {isProcessing ? 'Processing...' : 'Process ID Card'}
              </Button>
            </div>
          )}

          {isProcessing && (
            <div className="mt-4">
              <Progress value={progress} className="w-full" />
              <p className="text-center text-sm text-gray-600 mt-2">
                Processing Vietnamese ID card...
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : (
                <AlertCircle className="h-6 w-6 text-red-500" />
              )}
              Processing Results
            </CardTitle>
            <div className="flex gap-2">
              <Badge variant={result.success ? "default" : "destructive"}>
                {result.success ? 'Success' : 'Failed'}
              </Badge>
              {result.success && (
                <>
                  <Badge variant="secondary">
                    {result.confidence}% confidence
                  </Badge>
                  <Badge variant="outline">
                    {result.fieldsExtracted} fields extracted
                  </Badge>
                  <Badge variant="outline">
                    {result.processingTime}ms
                  </Badge>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {result.error && (
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{result.error}</AlertDescription>
              </Alert>
            )}

            {result.success && result.structuredData && Object.keys(result.structuredData).length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Extracted Information</h3>
                <div className="grid gap-3">
                  {Object.entries(result.structuredData)
                    .filter(([_, value]) => value && value.toString().trim())
                    .map(([key, value]) => (
                      <div key={key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="flex-shrink-0 text-gray-500">
                          {getFieldIcon(key)}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {formatFieldName(key)}
                          </div>
                          <div className="text-sm text-gray-600">
                            {value.toString()}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
