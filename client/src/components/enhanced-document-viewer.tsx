import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Download, 
  FileText, 
  Brain, 
  Sparkles, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  Copy, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Search,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type { Document } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

interface EnhancedDocumentViewerProps {
  documents: Document[];
}

export function EnhancedDocumentViewer({ documents }: EnhancedDocumentViewerProps) {
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();

  const completedDocuments = documents.filter(doc => doc.processingStatus === 'completed');
  const displayDocument = selectedDocument || completedDocuments[completedDocuments.length - 1];

  const analyzeDocumentMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const response = await apiRequest('POST', `/api/documents/${documentId}/analyze`);
      return response.json();
    },
    onSuccess: (result) => {
      setAnalysisResult(result);
      toast({
        title: "Analysis Complete",
        description: "DeepSeek AI analysis completed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleExport = async (format: 'txt' | 'json') => {
    if (!displayDocument) return;

    try {
      const response = await fetch(`/api/documents/${displayDocument.id}/export?format=${format}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${displayDocument.originalName}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: `Document exported as ${format.toUpperCase()}`,
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      toast({
        title: "Copied",
        description: "Text copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy text to clipboard",
        variant: "destructive",
      });
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "text-green-600 bg-green-50";
    if (confidence >= 0.7) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  const getConfidenceText = (confidence: number) => {
    if (confidence >= 0.9) return "High";
    if (confidence >= 0.7) return "Medium";
    return "Low";
  };

  const getPageData = (text: string) => {
    const pageMarkers = text.split(/---\s*Page\s*\d+\s*---/i);
    return pageMarkers.filter(page => page.trim().length > 0);
  };

  const highlightSearchTerm = (text: string, term: string) => {
    if (!term) return text;
    const regex = new RegExp(`(${term})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
  };

  if (completedDocuments.length === 0) {
    return (
      <Card data-results-section>
        <CardContent className="p-8 text-center">
          <FileText className="mx-auto text-gray-400 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-700 mb-2">No Results Yet</h3>
          <p className="text-gray-500">Upload and process documents to see results here</p>
        </CardContent>
      </Card>
    );
  }

  const pageData = displayDocument?.extractedText ? getPageData(displayDocument.extractedText) : [];
  const totalPages = Math.max(pageData.length, 1);
  const currentPageText = pageData[currentPage - 1] || displayDocument?.extractedText || "";

  return (
    <div data-results-section className="space-y-6">
      {/* Document Selection */}
      {completedDocuments.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Eye size={20} />
              <span>Processed Documents</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completedDocuments.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDocument(doc)}
                  className={`text-left p-4 rounded-lg border transition-colors ${
                    displayDocument?.id === doc.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-2">
                    {doc.mimeType === 'application/pdf' ? (
                      <FileText className="text-red-500" size={16} />
                    ) : (
                      <FileText className="text-blue-500" size={16} />
                    )}
                    <span className="font-medium truncate">{doc.originalName}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-xs">
                      {doc.mimeType === 'application/pdf' ? 'PDF' : 'Image'}
                    </Badge>
                    <Badge className={`text-xs ${getConfidenceColor(doc.confidence)}`}>
                      {getConfidenceText(doc.confidence)} Confidence
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Document Viewer */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                {displayDocument?.mimeType === 'application/pdf' ? (
                  <FileText className="text-red-500" size={24} />
                ) : (
                  <FileText className="text-blue-500" size={24} />
                )}
                <CardTitle>{displayDocument?.originalName}</CardTitle>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant="outline">
                  {displayDocument?.mimeType === 'application/pdf' ? 'PDF Document' : 'Image Document'}
                </Badge>
                <Badge className={`${getConfidenceColor(displayDocument?.confidence || 0)}`}>
                  {Math.round((displayDocument?.confidence || 0) * 100)}% Confidence
                </Badge>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => displayDocument && analyzeDocumentMutation.mutate(displayDocument.id)}
                disabled={analyzeDocumentMutation.isPending}
              >
                {analyzeDocumentMutation.isPending ? (
                  <Clock className="mr-2 animate-spin" size={16} />
                ) : (
                  <Brain className="mr-2" size={16} />
                )}
                AI Analysis
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('txt')}
              >
                <Download className="mr-2" size={16} />
                Export TXT
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('json')}
              >
                <Download className="mr-2" size={16} />
                Export JSON
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="text" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="text">Extracted Text</TabsTrigger>
              <TabsTrigger value="structured">Structured Data</TabsTrigger>
              <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-4">
              {/* Search and Navigation for Multi-page Documents */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Search size={16} className="text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search in document..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="px-3 py-1 border rounded text-sm"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
              )}

              <div className="relative">
                <div className="absolute top-2 right-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(currentPageText)}
                  >
                    {copySuccess ? (
                      <CheckCircle className="mr-2 text-green-500" size={16} />
                    ) : (
                      <Copy className="mr-2" size={16} />
                    )}
                    {copySuccess ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <div
                  className="bg-gray-50 p-6 rounded-lg border max-h-96 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{
                    __html: highlightSearchTerm(currentPageText, searchTerm)
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent value="structured" className="space-y-4">
              {displayDocument?.structuredData ? (
                <div className="bg-gray-50 p-6 rounded-lg">
                  <pre className="text-sm overflow-x-auto">
                    {JSON.stringify(displayDocument.structuredData, null, 2)}
                  </pre>
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No structured data available for this document.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="analysis" className="space-y-4">
              {analysisResult ? (
                <div className="space-y-4">
                  <div className="bg-blue-50 p-6 rounded-lg">
                    <h4 className="font-semibold mb-2 flex items-center">
                      <Sparkles className="mr-2 text-blue-500" size={16} />
                      DeepSeek AI Analysis
                    </h4>
                    <pre className="text-sm whitespace-pre-wrap">
                      {typeof analysisResult === 'string' 
                        ? analysisResult 
                        : JSON.stringify(analysisResult, null, 2)
                      }
                    </pre>
                  </div>
                </div>
              ) : (
                <Alert>
                  <Brain className="h-4 w-4" />
                  <AlertDescription>
                    Click "AI Analysis" to get detailed insights about this document.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}