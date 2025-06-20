import { HeaderNavigation } from "@/components/header-navigation";
import { SecurityBanner } from "@/components/security-banner";
import { DocumentUpload } from "@/components/document-upload";
import { EnhancedDocumentViewer } from "@/components/enhanced-document-viewer";
import { SystemSidebar } from "@/components/system-sidebar";
import { RealTimeStatus } from "@/components/real-time-status";
import { ApiStatusIndicator } from "@/components/api-status-indicator";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import type { Document } from "@shared/schema";

export default function Dashboard() {
  const { t } = useLanguage();
  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  const { data: user } = useQuery({
    queryKey: ["/api/user"],
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderNavigation user={user} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SecurityBanner />
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <DocumentUpload documents={documents} isLoading={isLoading} />
            <EnhancedDocumentViewer documents={documents} />
          </div>
          
          <div className="space-y-6">
            <SystemSidebar />
            <ApiStatusIndicator />
            <RealTimeStatus documents={documents} />
          </div>
        </div>
      </main>

      <footer className="bg-gray-800 text-gray-300 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-4 mb-4 md:mb-0">
              <p className="text-sm">SecureDoc OCR v2.1.0</p>
              <span className="text-gray-500">|</span>
              <p className="text-sm">Compliant with FISMA & FedRAMP standards</p>
            </div>
            
            <div className="flex items-center space-x-6">
              <button className="text-sm hover:text-white transition-colors">
                <i className="fas fa-clipboard-list mr-1"></i>Audit Log
              </button>
              <button className="text-sm hover:text-white transition-colors">
                <i className="fas fa-headset mr-1"></i>Support
              </button>
              <p className="text-sm">Emergency: 1-800-GOV-HELP</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
