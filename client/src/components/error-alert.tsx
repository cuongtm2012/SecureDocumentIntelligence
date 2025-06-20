import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ExternalLink } from "lucide-react";

interface ErrorAlertProps {
  error: string;
  onRetry?: () => void;
  showApiKeyHelp?: boolean;
}

export function ErrorAlert({ error, onRetry, showApiKeyHelp }: ErrorAlertProps) {
  const isApiQuotaError = error.includes("402") || error.includes("Insufficient Balance") || error.includes("quota");
  const isApiKeyError = error.includes("401") || error.includes("unauthorized") || error.includes("API key");

  return (
    <Alert className="border-red-200 bg-red-50">
      <AlertTriangle className="h-4 w-4 text-red-500" />
      <AlertDescription className="text-red-700">
        <div className="space-y-3">
          <p className="font-medium">Processing Failed</p>
          <p className="text-sm">{error}</p>
          
          {isApiQuotaError && (
            <div className="bg-white p-3 rounded border border-red-200">
              <p className="text-sm font-medium text-red-800 mb-2">API Quota Exceeded</p>
              <p className="text-xs text-red-600 mb-2">
                The DeepSeek API has reached its usage limit. The system will automatically use the fallback Vietnamese OCR processor.
              </p>
              <ul className="text-xs text-red-600 space-y-1 list-disc list-inside">
                <li>Fallback processing may take longer but will still extract Vietnamese text accurately</li>
                <li>Contact your administrator to increase API quota limits</li>
                <li>Processing will continue with enhanced Vietnamese OCR capabilities</li>
              </ul>
            </div>
          )}

          {isApiKeyError && showApiKeyHelp && (
            <div className="bg-white p-3 rounded border border-red-200">
              <p className="text-sm font-medium text-red-800 mb-2">API Configuration Required</p>
              <p className="text-xs text-red-600 mb-2">
                Please configure the DeepSeek API key to enable advanced processing features.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs"
                onClick={() => window.open('https://platform.deepseek.com/', '_blank')}
              >
                <ExternalLink className="mr-1" size={12} />
                Get API Key
              </Button>
            </div>
          )}

          <div className="flex items-center space-x-2">
            {onRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="text-xs"
              >
                <RefreshCw className="mr-1" size={12} />
                Retry Processing
              </Button>
            )}
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}