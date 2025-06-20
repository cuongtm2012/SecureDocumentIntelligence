import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Download, FileText, Brain, Sparkles } from "lucide-react";
import type { Document } from "@shared/schema";

interface ProcessingResultsProps {
  documents: Document[];
}

export function ProcessingResults({ documents }: ProcessingResultsProps) {
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const { toast } = useToast();

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

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${displayDocument.originalName}_extracted.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: `Document exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Unable to export document",
        variant: "destructive",
      });
    }
  };

  if (completedDocuments.length === 0) {
    return (
      <Card data-results-section>
        <CardContent className="p-6">
          <div className="text-center py-12">
            <FileText className="mx-auto text-gray-400 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-700 mb-2">No Results Yet</h3>
            <p className="text-sm text-gray-500">Upload and process documents to see extraction results</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-results-section>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold gov-dark">Extraction Results</h2>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={() => analyzeDocumentMutation.mutate(displayDocument.id)}
              disabled={!displayDocument || analyzeDocumentMutation.isPending}
            >
              <Brain className="mr-2" size={16} />
              {analyzeDocumentMutation.isPending ? 'Analyzing...' : 'AI Analysis'}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('txt')}
              disabled={!displayDocument}
            >
              <Download className="mr-2" size={16} />
              Export Text
            </Button>
            <Button
              className="bg-gov-blue hover:bg-blue-700"
              onClick={() => handleExport('json')}
              disabled={!displayDocument}
            >
              <FileText className="mr-2" size={16} />
              Export Structured
            </Button>
          </div>
        </div>

        {displayDocument && (
          <>
            {/* Document Selection */}
            {completedDocuments.length > 1 && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Document:
                </label>
                <select
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={displayDocument.id}
                  onChange={(e) => {
                    const doc = completedDocuments.find(d => d.id === parseInt(e.target.value));
                    setSelectedDocument(doc || null);
                  }}
                >
                  {completedDocuments.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.originalName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Document Preview and Results */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium text-gray-700 mb-3">Source Document</h3>
                <div className="w-full h-48 bg-gray-100 rounded-lg border flex items-center justify-center">
                  <div className="text-center">
                    <FileText className="mx-auto text-gray-400 mb-2" size={32} />
                    <p className="text-sm text-gray-500">{displayDocument.originalName}</p>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-700 mb-3">
                  Extracted Text 
                  {displayDocument.confidence && (
                    <span className="text-sm gov-success ml-2">
                      ({Math.round(displayDocument.confidence * 100)}% confidence)
                    </span>
                  )}
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 h-48 overflow-y-auto text-sm">
                  {displayDocument.extractedText ? (
                    <pre className="whitespace-pre-wrap font-sans">
                      {displayDocument.extractedText}
                    </pre>
                  ) : (
                    <p className="text-gray-500 italic">No text extracted</p>
                  )}
                </div>
              </div>
            </div>

            {/* Structured Data Extraction */}
            {displayDocument.structuredData && (
              <div className="mt-6">
                <h3 className="font-medium text-gray-700 mb-3">Structured Data Fields</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(() => {
                    try {
                      const structured = JSON.parse(displayDocument.structuredData);
                      return Object.entries(structured).map(([key, value]) => (
                        <div key={key} className="bg-blue-50 rounded-lg p-3">
                          <label className="text-sm font-medium text-gray-600 capitalize">
                            {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                          </label>
                          <p className="text-sm text-gray-800">{String(value)}</p>
                        </div>
                      ));
                    } catch {
                      return (
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-sm text-gray-500">No structured data available</p>
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>
            )}

            {/* AI Analysis Results */}
            {analysisResult && (
              <div className="mt-6">
                <div className="flex items-center mb-3">
                  <Sparkles className="mr-2 text-purple-600" size={20} />
                  <h3 className="font-medium text-gray-700">DeepSeek AI Analysis</h3>
                </div>
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4">
                  {(() => {
                    try {
                      const analysis = analysisResult.analysis;
                      if (typeof analysis === 'object') {
                        return (
                          <div className="space-y-4">
                            {analysis.summary && (
                              <div>
                                <h4 className="font-medium text-purple-800 mb-2">Summary</h4>
                                <p className="text-sm text-gray-700">{analysis.summary}</p>
                              </div>
                            )}
                            {analysis.keyFindings && (
                              <div>
                                <h4 className="font-medium text-purple-800 mb-2">Key Findings</h4>
                                <ul className="list-disc list-inside text-sm text-gray-700">
                                  {Array.isArray(analysis.keyFindings) 
                                    ? analysis.keyFindings.map((finding, idx) => (
                                        <li key={idx}>{finding}</li>
                                      ))
                                    : <li>{analysis.keyFindings}</li>
                                  }
                                </ul>
                              </div>
                            )}
                            {analysis.riskAssessment && (
                              <div>
                                <h4 className="font-medium text-red-700 mb-2">Risk Assessment</h4>
                                <p className="text-sm text-gray-700">{analysis.riskAssessment}</p>
                              </div>
                            )}
                            {analysis.recommendations && (
                              <div>
                                <h4 className="font-medium text-green-700 mb-2">Recommendations</h4>
                                <p className="text-sm text-gray-700">{analysis.recommendations}</p>
                              </div>
                            )}
                          </div>
                        );
                      } else {
                        return <p className="text-sm text-gray-700">{String(analysis)}</p>;
                      }
                    } catch {
                      return <p className="text-sm text-gray-500">Analysis data unavailable</p>;
                    }
                  })()}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
