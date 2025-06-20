import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FileText, Shield, Download, Clock, Lock, ShieldX } from "lucide-react";

export function SystemSidebar() {
  const { data: systemStatus } = useQuery({
    queryKey: ["/api/system/status"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ["/api/audit-logs"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
      case 'connected':
      case 'active':
        return 'status-online';
      default:
        return 'status-error';
    }
  };

  const getActivityIcon = (action: string) => {
    if (action.includes('uploaded')) return <FileText className="gov-blue" size={12} />;
    if (action.includes('processed')) return <FileText className="gov-blue" size={12} />;
    if (action.includes('Security')) return <Shield className="gov-success" size={12} />;
    if (action.includes('exported')) return <Download className="text-purple-600" size={12} />;
    return <FileText className="gov-blue" size={12} />;
  };

  const getActivityIconBg = (action: string) => {
    if (action.includes('uploaded') || action.includes('processed')) return 'bg-blue-100';
    if (action.includes('Security')) return 'bg-green-100';
    if (action.includes('exported')) return 'bg-purple-100';
    return 'bg-blue-100';
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  };

  return (
    <div className="space-y-6">
      {/* System Status */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold gov-dark mb-4">System Status</h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={getStatusColor(systemStatus?.services?.ocr || 'offline')}></div>
                <span className="text-sm">OCR Service</span>
              </div>
              <span className="text-sm text-green-600 capitalize">
                {systemStatus?.services?.ocr || 'offline'}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={getStatusColor(systemStatus?.services?.database || 'offline')}></div>
                <span className="text-sm">Database</span>
              </div>
              <span className="text-sm text-green-600 capitalize">
                {systemStatus?.services?.database || 'offline'}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={getStatusColor(systemStatus?.services?.security || 'offline')}></div>
                <span className="text-sm">Security Layer</span>
              </div>
              <span className="text-sm text-green-600 capitalize">
                {systemStatus?.services?.security || 'offline'}
              </span>
            </div>
          </div>

          {systemStatus?.usage && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between text-sm text-gray-600">
                <span>API Usage Today</span>
                <span>{systemStatus.usage.today}/{systemStatus.usage.limit}</span>
              </div>
              <div className="mt-2">
                <Progress 
                  value={(systemStatus.usage.today / systemStatus.usage.limit) * 100} 
                  className="h-2"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold gov-dark mb-4">Recent Activity</h3>
          
          <div className="space-y-3">
            {auditLogs.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No recent activity</p>
            ) : (
              auditLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-start space-x-3 pb-3 border-b border-gray-100 last:border-b-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getActivityIconBg(log.action)}`}>
                    {getActivityIcon(log.action)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{log.action}</p>
                    <p className="text-xs text-gray-500">{formatTimeAgo(log.timestamp.toString())}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Security Information */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold gov-dark mb-4">Security Information</h3>
          
          <div className="space-y-4">
            <div className="bg-green-50 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-2">
                <Lock className="gov-success" size={16} />
                <span className="text-sm font-medium text-green-800">Encryption Status</span>
              </div>
              <p className="text-xs text-green-700">All data encrypted with AES-256</p>
            </div>
            
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-2">
                <ShieldX className="gov-blue" size={16} />
                <span className="text-sm font-medium text-blue-800">Access Level</span>
              </div>
              <p className="text-xs text-blue-700">Level 3 - Confidential</p>
            </div>
            
            <div className="bg-yellow-50 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-2">
                <Clock className="gov-warning" size={16} />
                <span className="text-sm font-medium text-yellow-800">Session</span>
              </div>
              <p className="text-xs text-yellow-700">
                {systemStatus?.session?.remaining || 45} minutes remaining
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
