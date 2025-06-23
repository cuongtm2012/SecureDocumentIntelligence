import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, Download, FileSpreadsheet, FileImage, Loader2, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OCRResult {
  id: string;
  text: string;
  confidence: number;
  filename: string;
  pageCount: number;
  language: string;
  processedAt: Date;
}

interface DocumentExportManagerProps {
  ocrResults: OCRResult[];
  selectedResults: string[];
  onSelectionChange: (selected: string[]) => void;
}

interface ExportJob {
  id: string;
  format: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  downloadUrl?: string;
  error?: string;
}

export function DocumentExportManager({ 
  ocrResults, 
  selectedResults, 
  onSelectionChange 
}: DocumentExportManagerProps) {
  const [exportFormat, setExportFormat] = useState<string>('txt');
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const { toast } = useToast();

  const exportFormats = [
    { value: 'txt', label: 'Plain Text (.txt)', icon: FileText },
    { value: 'pdf', label: 'PDF Document (.pdf)', icon: FileText },
    { value: 'docx', label: 'Word Document (.docx)', icon: FileText },
    { value: 'csv', label: 'CSV Spreadsheet (.csv)', icon: FileSpreadsheet },
    { value: 'json', label: 'JSON Data (.json)', icon: FileText },
  ];

  const handleExport = async () => {
    if (selectedResults.length === 0) {
      toast({
        title: "No documents selected",
        description: "Please select at least one document to export.",
        variant: "destructive",
      });
      return;
    }

    const jobId = `export-${Date.now()}`;
    const newJob: ExportJob = {
      id: jobId,
      format: exportFormat,
      status: 'pending',
      progress: 0,
    };

    setExportJobs(prev => [...prev, newJob]);

    try {
      // Update job status to processing
      setExportJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, status: 'processing' } : job
      ));

      // Simulate export progress
      for (let progress = 0; progress <= 100; progress += 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        setExportJobs(prev => prev.map(job => 
          job.id === jobId ? { ...job, progress } : job
        ));
      }

      // Simulate API call to export documents
      const response = await fetch('/api/documents/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentIds: selectedResults,
          format: exportFormat,
          includeMetadata,
        }),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);

      // Update job as completed
      setExportJobs(prev => prev.map(job => 
        job.id === jobId ? { 
          ...job, 
          status: 'completed', 
          downloadUrl,
          progress: 100 
        } : job
      ));

      // Auto-download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `export-${selectedResults.length}-documents.${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Export completed",
        description: `Successfully exported ${selectedResults.length} documents as ${exportFormat.toUpperCase()}.`,
      });

    } catch (error) {
      setExportJobs(prev => prev.map(job => 
        job.id === jobId ? { 
          ...job, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Export failed' 
        } : job
      ));

      toast({
        title: "Export failed",
        description: "An error occurred while exporting documents.",
        variant: "destructive",
      });
    }
  };

  const handleSelectAll = () => {
    if (selectedResults.length === ocrResults.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(ocrResults.map(result => result.id));
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5 text-blue-600" />
          Document Export Manager
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Export Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Export Format</label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {exportFormats.map((format) => {
                  const Icon = format.icon;
                  return (
                    <SelectItem key={format.value} value={format.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {format.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Options</label>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="includeMetadata"
                checked={includeMetadata}
                onChange={(e) => setIncludeMetadata(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="includeMetadata" className="text-sm">
                Include metadata & confidence scores
              </label>
            </div>
          </div>
        </div>

        <Separator />

        {/* Document Selection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Select Documents</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {selectedResults.length} of {ocrResults.length} selected
              </Badge>
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {selectedResults.length === ocrResults.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2">
            {ocrResults.map((result) => (
              <div
                key={result.id}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedResults.includes(result.id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => {
                  if (selectedResults.includes(result.id)) {
                    onSelectionChange(selectedResults.filter(id => id !== result.id));
                  } else {
                    onSelectionChange([...selectedResults, result.id]);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedResults.includes(result.id)}
                      onChange={() => {}}
                      className="rounded border-gray-300"
                    />
                    <div>
                      <p className="font-medium text-sm">{result.filename}</p>
                      <p className="text-xs text-gray-500">
                        {result.pageCount} pages • {result.language} • {result.confidence}% confidence
                      </p>
                    </div>
                  </div>
                  <Badge variant={result.confidence > 80 ? 'default' : 'secondary'}>
                    {result.confidence}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Export Action */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Export {selectedResults.length} document{selectedResults.length !== 1 ? 's' : ''} as {exportFormat.toUpperCase()}
          </div>
          <Button onClick={handleExport} disabled={selectedResults.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export Documents
          </Button>
        </div>

        {/* Export Jobs Status */}
        {exportJobs.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Export History</h3>
              {exportJobs.slice(-3).reverse().map((job) => (
                <div key={job.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {job.status === 'processing' && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                    {job.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-600" />}
                    {job.status === 'error' && <div className="h-4 w-4 rounded-full bg-red-600" />}
                    <div>
                      <p className="text-sm font-medium">Export to {job.format.toUpperCase()}</p>
                      <p className="text-xs text-gray-500">
                        {job.status === 'processing' && `${job.progress}% complete`}
                        {job.status === 'completed' && 'Ready for download'}
                        {job.status === 'error' && `Error: ${job.error}`}
                      </p>
                    </div>
                  </div>
                  {job.status === 'completed' && job.downloadUrl && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={job.downloadUrl} download>
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
