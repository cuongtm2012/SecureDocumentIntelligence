import { Button } from "@/components/ui/button";
import { Check, ChevronDown } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useState } from "react";

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const languages = [
    { code: 'en', name: 'English', shortName: 'EN', flag: '🇺🇸' },
    { code: 'vi', name: 'Tiếng Việt', shortName: 'VI', flag: '🇻🇳' }
  ];

  const currentLanguage = languages.find(lang => lang.code === language) || languages[0];

  const handleLanguageChange = (langCode: string) => {
    setLanguage(langCode);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="h-9 px-3 py-2 text-sm font-medium bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-lg shadow-sm hover:shadow-md hover:bg-white transition-all duration-200 flex items-center gap-2"
      >
        <span className="text-lg leading-none">{currentLanguage.flag}</span>
        <span className="hidden sm:inline text-gray-700">{currentLanguage.name}</span>
        <span className="sm:hidden text-gray-700 font-semibold">{currentLanguage.shortName}</span>
        <ChevronDown className={`h-3 w-3 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 z-20 min-w-[160px] bg-white rounded-lg border border-gray-200/60 shadow-lg backdrop-blur-sm overflow-hidden">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-50 transition-colors duration-150 flex items-center justify-between ${
                  language === lang.code ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg leading-none">{lang.flag}</span>
                  <span className="font-medium">{lang.name}</span>
                </div>
                {language === lang.code && (
                  <Check className="h-4 w-4 text-blue-600" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}