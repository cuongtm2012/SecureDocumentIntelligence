import { Shield, Lock, User, LogOut } from "lucide-react";
import { LanguageSwitcher } from "./language-switcher";
import { useLanguage } from "@/hooks/use-language";

interface HeaderNavigationProps {
  user?: {
    name: string;
    clearanceLevel: string;
  };
}

export function HeaderNavigation({ user }: HeaderNavigationProps) {
  const { t } = useLanguage();
  
  return (
    <header className="bg-gov-blue text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-4">
            <Shield className="text-2xl" />
            <div>
              <h1 className="text-xl font-semibold">SecureDoc OCR</h1>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <LanguageSwitcher />
            
            <div className="hidden sm:flex items-center space-x-2 text-green-300">
              <Lock size={14} />
              <span className="text-xs font-medium">{t('authorized')}</span>
            </div>
            
            {user && (
              <div className="flex items-center space-x-3 pl-4 border-l border-blue-500/30">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30">
                    <User size={14} className="text-white" />
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-sm font-medium text-white">{user.name}</div>
                    <div className="text-xs text-blue-200">{user.clearanceLevel} Access</div>
                  </div>
                </div>
                <button className="text-blue-200 hover:text-white transition-colors p-1 rounded hover:bg-white/10">
                  <LogOut size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
