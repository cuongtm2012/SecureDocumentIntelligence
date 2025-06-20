import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Clock, CheckCircle, AlertCircle, Loader2, Eye } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import type { Document, AuditLog } from "@shared/schema";

export function EnhancedDashboard() {
  const { t } = useLanguage();
  
  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['/api/documents'],
    refetchInterval: 5000,
  });

  const { data: auditLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['/api/audit-logs'],
    refetchInterval: 5000,
  });

  // Sort documents by upload date (newest first)
  const sortedDocuments = (documents as Document[]).sort((a, b) => 
    new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );

  // Sort audit logs by timestamp (newest first)
  const sortedAuditLogs = (auditLogs as AuditLog[]).sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const getStatusBadge = (status: string) => {
    const statusMap = {
      completed: { variant: "default" as const, className: "bg-green-100 text-green-800", icon: CheckCircle },
      processing: { variant: "secondary" as const, className: "bg-blue-100 text-blue-800", icon: Loader2 },
      failed: { variant: "destructive" as const, className: "bg-red-100 text-red-800", icon: AlertCircle },
      pending: { variant: "outline" as const, className: "bg-gray-100 text-gray-800", icon: Clock }
    };
    
    const config = statusMap[status as keyof typeof statusMap] || statusMap.pending;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className={config.className}>
        <Icon className="w-3 h-3 mr-1" />
        {t(status as any) || status}
      </Badge>
    );
  };

  const formatTimeAgo = (date: string | Date) => {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Processing Queue */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('documents')}</h3>
            <Badge variant="outline" className="text-xs">
              {sortedDocuments.length} {t('documents').toLowerCase()}
            </Badge>
          </div>
          
          {documentsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="ml-2 text-sm text-gray-500">{t('loading')}</span>
            </div>
          ) : sortedDocuments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedDocuments.slice(0, 5).map((doc: Document) => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-gray-900 truncate">
                        {doc.originalName}
                      </p>
                      <div className="flex items-center space-x-2 text-xs text-gray-500">
                        <span>{formatFileSize(doc.fileSize)}</span>
                        <span>•</span>
                        <span>{formatTimeAgo(doc.uploadedAt)}</span>
                        {doc.confidence && (
                          <>
                            <span>•</span>
                            <span>{Math.round(doc.confidence * 100)}% {t('confidence').toLowerCase()}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {getStatusBadge(doc.processingStatus)}
                    <Button variant="outline" size="sm" className="h-7">
                      <Eye className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
              
              {sortedDocuments.length > 5 && (
                <div className="text-center pt-2">
                  <Button variant="outline" size="sm">
                    {t('view')} {sortedDocuments.length - 5} more
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('recentActivity')}</h3>
            <Badge variant="outline" className="text-xs">
              {sortedAuditLogs.length} {t('recentActivity').toLowerCase()}
            </Badge>
          </div>
          
          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="ml-2 text-sm text-gray-500">{t('loading')}</span>
            </div>
          ) : sortedAuditLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No recent activity</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedAuditLogs.slice(0, 6).map((log: AuditLog) => (
                <div key={log.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 leading-relaxed">
                      {log.action}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatTimeAgo(log.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
              
              {sortedAuditLogs.length > 6 && (
                <div className="text-center pt-2">
                  <Button variant="outline" size="sm">
                    {t('view')} {sortedAuditLogs.length - 6} more
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}