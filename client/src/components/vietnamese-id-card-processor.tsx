
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Separator } from './ui/separator';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  Upload, 
  FileImage, 
  Eye, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  Search,
  Brain,
  Database
} from 'lucide-react';

interface VietOCRResult {
  success: boolean;
  structuredData: {
    id?: string;
    name?: string;
    date_of_birth?: string;
    sex?: string;
    nationality?: string;
    place_of_origin?: string;
    place_of_residence?: string;
    date_of_issue?: string;
    date_of_expiry?: string;
    [key: string]: any;
  };
  confidence: number;
  processingTime: number;
  processingMethod: string;
  fieldsExtracted: number;
  regions?: Array<{
    text: string;
    bbox: [number, number, number, number];
    confidence: number;
  }>;
  error?: string;
}

interface SearchResult {
  id: string;
  score: number;
  text: string;
  structured_data: any;
  image_path: string;
  timestamp: number;
}

export function VietnameseIDCardProcessor() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<VietOCRResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff']
    },
    multiple: false
  });

  const processIDCard = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    
    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + Math.random() * 10;
      });
    }, 500);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/ocr/process-id-card', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setResult(data);
      setProgress(100);
      
    } catch (error) {
      console.error('Processing error:', error);
      setResult({
        success: false,
        error: 'Failed to process ID card',
        structuredData: {},
        confidence: 0,
        processingTime: 0,
        processingMethod: 'error',
        fieldsExtracted: 0
      });
    } finally {
      setIsProcessing(false);
      clearInterval(progressInterval);
    }
  };

  const searchSimilarDocuments = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch('/api/ocr/search-similar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery,
          limit: 5
        }),
      });

      const data = await response.json();
      if (data.success) {
        setSearchResults(data.results);
      } else {
        console.error('Search failed:', data.error);
      }
      
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const downloadResults = () => {
    if (!result) return;

    const data = {
      processingInfo: {
        processingTime: result.processingTime,
        confidence: result.confidence,
        processingMethod: result.processingMethod,
        fieldsExtracted: result.fieldsExtracted,
        timestamp: new Date().toISOString()
      },
      extractedData: result.structuredData,
      regions: result.regions || []
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vietocr-results-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-blue-600" />
            VietOCR + Qdrant Processor
          </CardTitle>
          <CardDescription>
            Advanced Vietnamese ID card processing with AI-powered vector search using VietOCR and Qdrant
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="process" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="process">Process ID Card</TabsTrigger>
              <TabsTrigger value="search">Vector Search</TabsTrigger>
            </TabsList>
            
            <TabsContent value="process" className="space-y-6">
              {/* File Upload */}
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-lg font-medium text-gray-900 mb-2">
                  {file ? file.name : 'Drop Vietnamese ID card image here'}
                </p>
                <p className="text-sm text-gray-500">
                  or click to select • PNG, JPG, JPEG up to 10MB
                </p>
              </div>

              {/* Processing Controls */}
              {file && (
                <div className="flex justify-center">
                  <Button 
                    onClick={processIDCard} 
                    disabled={isProcessing}
                    className="px-8 py-2"
                  >
                    {isProcessing ? (
                      <>
                        <Clock className="w-4 h-4 mr-2 animate-spin" />
                        Processing with VietOCR...
                      </>
                    ) : (
                      <>
                        <FileImage className="w-4 h-4 mr-2" />
                        Process ID Card
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Progress Bar */}
              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={progress} className="w-full" />
                  <p className="text-sm text-center text-gray-600">
                    Running VietOCR analysis and storing in vector database...
                  </p>
                </div>
              )}

              {/* Results */}
              {result && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        {result.success ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-red-600" />
                        )}
                        Processing Results
                      </span>
                      {result.success && (
                        <Button variant="outline" size="sm" onClick={downloadResults}>
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {result.success ? (
                      <div className="space-y-4">
                        {/* Processing Info */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-blue-600">{result.confidence}%</p>
                            <p className="text-sm text-gray-600">Confidence</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-green-600">{result.fieldsExtracted}</p>
                            <p className="text-sm text-gray-600">Fields Found</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-purple-600">{(result.processingTime / 1000).toFixed(1)}s</p>
                            <p className="text-sm text-gray-600">Process Time</p>
                          </div>
                          <div className="text-center">
                            <Badge variant="secondary" className="text-xs">
                              {result.processingMethod}
                            </Badge>
                            <p className="text-sm text-gray-600">Method</p>
                          </div>
                        </div>

                        <Separator />

                        {/* Extracted Data */}
                        <div>
                          <h3 className="text-lg font-semibold mb-3">Extracted Information</h3>
                          <div className="grid gap-3">
                            {Object.entries(result.structuredData).map(([key, value]) => (
                              <div key={key} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                <span className="font-medium capitalize">
                                  {key.replace(/_/g, ' ')}:
                                </span>
                                <span className="text-gray-700">{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Text Regions */}
                        {result.regions && result.regions.length > 0 && (
                          <div>
                            <h3 className="text-lg font-semibold mb-3">Detected Text Regions</h3>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {result.regions.map((region, index) => (
                                <div key={index} className="p-2 bg-blue-50 rounded text-sm">
                                  <div className="font-medium">Region {index + 1}:</div>
                                  <div className="text-gray-700">{region.text}</div>
                                  <div className="text-xs text-gray-500">
                                    Confidence: {region.confidence}%
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {result.error || 'Processing failed. Please try again with a different image.'}
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="search" className="space-y-6">
              {/* Search Interface */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-purple-600" />
                    Vector-Based Document Search
                  </CardTitle>
                  <CardDescription>
                    Search for similar documents using AI-powered semantic similarity
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label htmlFor="search">Search Query</Label>
                      <Input
                        id="search"
                        placeholder="Enter text to search for similar documents..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && searchSimilarDocuments()}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button 
                        onClick={searchSimilarDocuments}
                        disabled={isSearching || !searchQuery.trim()}
                      >
                        {isSearching ? (
                          <>
                            <Clock className="w-4 h-4 mr-2 animate-spin" />
                            Searching...
                          </>
                        ) : (
                          <>
                            <Search className="w-4 h-4 mr-2" />
                            Search
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">Similar Documents Found</h3>
                      <div className="space-y-3">
                        {searchResults.map((result, index) => (
                          <Card key={result.id} className="border-l-4 border-purple-500">
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">
                                    Score: {(result.score * 100).toFixed(1)}%
                                  </Badge>
                                  <span className="text-sm text-gray-500">
                                    {new Date(result.timestamp * 1000).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                              <div className="text-sm text-gray-700 mb-2">
                                {result.text.substring(0, 200)}...
                              </div>
                              {Object.keys(result.structured_data).length > 0 && (
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  {Object.entries(result.structured_data).slice(0, 4).map(([key, value]) => (
                                    <div key={key} className="bg-gray-50 p-1 rounded">
                                      <span className="font-medium">{key}:</span> {value}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
