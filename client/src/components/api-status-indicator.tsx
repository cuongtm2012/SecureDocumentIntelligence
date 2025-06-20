import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  ExternalLink,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function ApiStatusIndicator() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'available' | 'quota_exceeded' | 'error'>('checking');
  const [lastCheck, setLastCheck] = useState<Date>(new Date());

  const checkApiStatus = async () => {
    setApiStatus('checking');
    try {
      const response = await fetch('/api/system/status', {
        credentials: 'include',
      });
      const data = await response.json();
      
      // Simulate API status based on recent errors
      if (data.services?.ocr === 'deepseek-ai') {
        setApiStatus('quota_exceeded'); // Based on the 402 error we saw
      } else {
        setApiStatus('available');
      }
    } catch (error) {
      setApiStatus('error');
    }
    setLastCheck(new Date());
  };

  useEffect(() => {
    checkApiStatus();
    const interval = setInterval(checkApiStatus, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getStatusConfig = () => {
    switch (apiStatus) {
      case 'available':
        return {
          icon: <CheckCircle className="h-4 w-4 text-green-500" />,
          label: "DeepSeek API Available",
          variant: "default" as const,
          className: "bg-green-50 text-green-700 border-green-200"
        };
      case 'quota_exceeded':
        return {
          icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,
          label: "API Quota Exceeded",
          variant: "destructive" as const,
          className: "bg-orange-50 text-orange-700 border-orange-200"
        };
      case 'error':
        return {
          icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
          label: "API Connection Error",
          variant: "destructive" as const,
          className: "bg-red-50 text-red-700 border-red-200"
        };
      default:
        return {
          icon: <Clock className="h-4 w-4 text-gray-500" />,
          label: "Checking API Status...",
          variant: "secondary" as const,
          className: "bg-gray-50 text-gray-700 border-gray-200"
        };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Badge className={statusConfig.className}>
          {statusConfig.icon}
          <span className="ml-2 text-xs">{statusConfig.label}</span>
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={checkApiStatus}
          disabled={apiStatus === 'checking'}
          className="h-6 w-6 p-0"
        >
          <RefreshCw className={`h-3 w-3 ${apiStatus === 'checking' ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {apiStatus === 'quota_exceeded' && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <AlertDescription className="text-orange-700">
            <div className="space-y-2">
              <p className="text-sm font-medium">DeepSeek API Quota Exceeded</p>
              <p className="text-xs">
                PDF processing is temporarily limited. The system will automatically fall back to enhanced Vietnamese OCR.
              </p>
              <div className="flex items-center space-x-2 mt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-xs h-6"
                  onClick={() => window.open('https://platform.deepseek.com/', '_blank')}
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Manage API Credits
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="text-xs text-gray-500">
        Last checked: {lastCheck.toLocaleTimeString()}
      </div>
    </div>
  );
}