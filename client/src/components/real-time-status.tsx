import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  FileText, 
  FileImage, 
  Loader2,
  TrendingUp,
  Activity
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import type { Document } from "@shared/schema";

interface RealTimeStatusProps {
  documents: Document[];
}

export function RealTimeStatus({ documents }: RealTimeStatusProps) {
  const { t } = useLanguage();
  const [processingMetrics, setProcessingMetrics] = useState({
    totalProcessed: 0,
    successRate: 0,
    averageConfidence: 0,
    processingTime: 0
  });

  useEffect(() => {
    const completedDocs = documents.filter(doc => doc.processingStatus === 'completed');
    const failedDocs = documents.filter(doc => doc.processingStatus === 'failed');
    const totalProcessed = completedDocs.length + failedDocs.length;
    
    const successRate = totalProcessed > 0 ? (completedDocs.length / totalProcessed) * 100 : 0;
    const averageConfidence = completedDocs.length > 0 
      ? completedDocs.reduce((sum, doc) => sum + (doc.confidence || 0), 0) / completedDocs.length 
      : 0;

    setProcessingMetrics({
      totalProcessed,
      successRate,
      averageConfidence,
      processingTime: 2.3 // Average processing time estimate
    });
  }, [documents]);

  const getProcessingQueue = () => {
    return documents.filter(doc => doc.processingStatus === 'processing');
  };

  const getRecentlyCompleted = () => {
    return documents
      .filter(doc => doc.processingStatus === 'completed')
      .slice(-3);
  };

  const getDocumentTypeIcon = (mimeType: string) => {
    return mimeType === 'application/pdf' ? 
      <FileText className="text-red-500" size={16} /> : 
      <FileImage className="text-blue-500" size={16} />;
  };

  const processingQueue = getProcessingQueue();
  const recentlyCompleted = getRecentlyCompleted();

  return (
    <div className="space-y-4">
      {/* Processing Metrics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <Activity size={20} className="text-blue-500" />
            <span>Processing Metrics</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Documents Processed</span>
                <TrendingUp size={16} className="text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-blue-600">{processingMetrics.totalProcessed}</p>
            </div>
            
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Success Rate</span>
                <CheckCircle size={16} className="text-green-500" />
              </div>
              <p className="text-2xl font-bold text-green-600">{processingMetrics.successRate.toFixed(1)}%</p>
            </div>
            
            <div className="bg-purple-50 p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Avg Confidence</span>
                <Activity size={16} className="text-purple-500" />
              </div>
              <p className="text-2xl font-bold text-purple-600">{(processingMetrics.averageConfidence * 100).toFixed(1)}%</p>
            </div>
            
            <div className="bg-orange-50 p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Avg Time</span>
                <Clock size={16} className="text-orange-500" />
              </div>
              <p className="text-2xl font-bold text-orange-600">{processingMetrics.processingTime}s</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Processing Queue */}
      {processingQueue.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2 text-lg">
              <Loader2 size={20} className="text-blue-500 animate-spin" />
              <span>Currently Processing</span>
              <Badge variant="outline">{processingQueue.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {processingQueue.map((doc) => (
              <div key={doc.id} className="bg-blue-50 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getDocumentTypeIcon(doc.mimeType)}
                    <span className="font-medium text-sm truncate">{doc.originalName}</span>
                    <Badge variant="outline" className="text-xs">
                      {doc.mimeType === 'application/pdf' ? 'PDF' : 'Image'}
                    </Badge>
                  </div>
                  <Loader2 size={16} className="text-blue-500 animate-spin" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>
                      {doc.mimeType === 'application/pdf' ? 'Extracting PDF content...' : 'Analyzing image...'}
                    </span>
                    <span>~{processingMetrics.processingTime}s remaining</span>
                  </div>
                  <Progress value={65} className="h-1" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recently Completed */}
      {recentlyCompleted.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2 text-lg">
              <CheckCircle size={20} className="text-green-500" />
              <span>Recently Completed</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentlyCompleted.map((doc) => (
              <div key={doc.id} className="bg-green-50 p-3 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {getDocumentTypeIcon(doc.mimeType)}
                    <span className="font-medium text-sm truncate">{doc.originalName}</span>
                    <Badge variant="outline" className="text-xs">
                      {doc.mimeType === 'application/pdf' ? 'PDF' : 'Image'}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className="text-xs bg-green-100 text-green-700">
                      {Math.round((doc.confidence || 0) * 100)}% confidence
                    </Badge>
                    <CheckCircle size={16} className="text-green-500" />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Error Handling */}
      {documents.some(doc => doc.processingStatus === 'failed') && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-700">
            Some documents failed to process. Check the processing queue above for details.
            <br />
            <span className="text-sm mt-1 block">
              Tip: Ensure PDFs are text-based and images are clear with good contrast.
            </span>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}