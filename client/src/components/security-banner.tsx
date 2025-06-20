import { AlertTriangle } from "lucide-react";

export function SecurityBanner() {
  return (
    <div className="bg-yellow-50 border-l-4 border-gov-warning p-4 mb-6">
      <div className="flex items-center">
        <AlertTriangle className="gov-warning mr-3" size={20} />
        <div>
          <h3 className="text-sm font-medium text-yellow-800">Security Notice</h3>
          <p className="text-sm text-yellow-700 mt-1">
            This system processes sensitive government documents. Ensure all uploads comply with security protocols.
          </p>
        </div>
      </div>
    </div>
  );
}
