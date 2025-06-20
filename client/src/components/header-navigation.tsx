import { Shield, Lock, User, LogOut } from "lucide-react";

interface HeaderNavigationProps {
  user?: {
    name: string;
    clearanceLevel: string;
  };
}

export function HeaderNavigation({ user }: HeaderNavigationProps) {
  return (
    <header className="bg-gov-blue text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-4">
            <Shield className="text-2xl" />
            <div>
              <h1 className="text-xl font-semibold">SecureDoc OCR</h1>
              <p className="text-blue-200 text-sm">Government Document Processing System</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <Lock className="text-green-300" size={16} />
              <span className="text-sm">Secure Connection</span>
            </div>
            
            {user && (
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-400 rounded-full flex items-center justify-center">
                    <User size={16} />
                  </div>
                  <span className="text-sm">{user.name}</span>
                </div>
                <button className="text-blue-200 hover:text-white transition-colors">
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
