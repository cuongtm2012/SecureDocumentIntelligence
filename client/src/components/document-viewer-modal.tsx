import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Eye, Download, Clock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import type { Document } from "@shared/schema";

interface DocumentViewerModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentViewerModal({ document, isOpen, onClose }: DocumentViewerModalProps) {
  const { t } = useLanguage();

  if (!document) return null;

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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-600" />
            <span className="truncate">{document.originalName}</span>
            {getStatusBadge(document.processingStatus)}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
          <Card className="md:col-span-1">
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

          <div className="md:col-span-2">
            <Tabs defaultValue="extracted" className="h-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="extracted">{t('extractedText')}</TabsTrigger>
                <TabsTrigger value="structured">{t('structuredData')}</TabsTrigger>
              </TabsList>
              
              <TabsContent value="extracted" className="mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      {t('extractedText')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
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
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="structured" className="mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      {t('structuredData')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      {renderStructuredData(document.structuredData)}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
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
      </DialogContent>
    </Dialog>
  );
}