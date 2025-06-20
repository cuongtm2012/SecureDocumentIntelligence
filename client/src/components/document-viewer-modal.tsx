import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Eye, Download, Clock, CheckCircle, AlertCircle, Loader2, X } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useState } from "react";
import type { Document } from "@shared/schema";

interface DocumentViewerModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentViewerModal({ document, isOpen, onClose }: DocumentViewerModalProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'extracted' | 'structured'>('extracted');

  if (!isOpen || !document) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      completed: { variant: "default" as const, className: "bg-green-100 text-green-800" },
      processing: { variant: "secondary" as const, className: "bg-blue-100 text-blue-800" },
      failed: { variant: "destructive" as const, className: "bg-red-100 text-red-800" },
      pending: { variant: "outline" as const, className: "bg-gray-100 text-gray-800" }
    };
    
    const config = statusMap[status as keyof typeof statusMap] || statusMap.pending;
    
    return (
      <Badge variant={config.variant} className={config.className}>
        {getStatusIcon(status)}
        <span className="ml-1">{t(status as any) || status}</span>
      </Badge>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string | Date) => {
    return new Date(dateString).toLocaleString();
  };

  const renderStructuredData = (data: any) => {
    if (!data) return <p className="text-gray-500 text-sm">No structured data available</p>;
    
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return (
        <div className="space-y-3">
          {Object.entries(parsed).map(([key, value]) => (
            <div key={key} className="border-b border-gray-100 pb-2 last:border-b-0">
              <dt className="text-sm font-medium text-gray-600 capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </dt>
              <dd className="text-sm text-gray-900 mt-1">
                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
              </dd>
            </div>
          ))}
        </div>
      );
    } catch (e) {
      return (
        <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative bg-white rounded-lg shadow-2xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 truncate">{document.originalName}</h2>
            {getStatusBadge(document.processingStatus)}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Document Info */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Document Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <dt className="font-medium text-gray-600">{t('fileName')}</dt>
                <dd className="text-gray-900 truncate">{document.originalName}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">{t('fileSize')}</dt>
                <dd className="text-gray-900">{formatFileSize(document.fileSize)}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">{t('uploadDate')}</dt>
                <dd className="text-gray-900">{formatDate(document.uploadedAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">{t('processingStatus')}</dt>
                <dd className="text-gray-900">{getStatusBadge(document.processingStatus)}</dd>
              </div>
              {document.confidence && (
                <div>
                  <dt className="font-medium text-gray-600">{t('confidence')}</dt>
                  <dd className="text-gray-900">{Math.round(document.confidence * 100)}%</dd>
                </div>
              )}
              {document.processingCompletedAt && (
                <div>
                  <dt className="font-medium text-gray-600">Processing Completed</dt>
                  <dd className="text-gray-900">{formatDate(document.processingCompletedAt)}</dd>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Content Tabs */}
          <div className="lg:col-span-2">
            <div className="mb-4">
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setActiveTab('extracted')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 ${
                    activeTab === 'extracted'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t('extractedText')}
                </button>
                <button
                  onClick={() => setActiveTab('structured')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 ml-8 ${
                    activeTab === 'structured'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t('structuredData')}
                </button>
              </div>
            </div>

            {activeTab === 'extracted' && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    {t('extractedText')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 overflow-y-auto border border-gray-200 rounded p-3">
                    {document.extractedText ? (
                      <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                        {document.extractedText}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-32 text-gray-500">
                        <div className="text-center">
                          <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                          <p className="text-sm">
                            {document.processingStatus === 'pending' || document.processingStatus === 'processing'
                              ? 'Processing in progress...'
                              : 'No text extracted yet'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'structured' && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {t('structuredData')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 overflow-y-auto border border-gray-200 rounded p-3">
                    {renderStructuredData(document.structuredData)}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-6 border-t border-gray-200">
          <Button variant="outline" onClick={onClose}>
            {t('close')}
          </Button>
          {document.extractedText && (
            <Button variant="default">
              <Download className="w-4 h-4 mr-2" />
              {t('download')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}