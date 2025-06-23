import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  Languages, 
  Globe, 
  Scan, 
  CheckCircle, 
  AlertTriangle, 
  Loader2,
  Brain,
  TrendingUp
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LanguageDetectionResult {
  language: string;
  confidence: number;
  script: string;
  direction: 'ltr' | 'rtl';
}

interface OCRLanguageConfig {
  code: string;
  name: string;
  nativeName: string;
  script: string;
  direction: 'ltr' | 'rtl';
  tesseractCode: string;
  supported: boolean;
}

interface MultiLanguageOCRProps {
  documentId: string;
  imageUrl: string;
  onOCRComplete: (result: {
    text: string;
    confidence: number;
    language: string;
    detectedLanguages: LanguageDetectionResult[];
  }) => void;
}

const SUPPORTED_LANGUAGES: OCRLanguageConfig[] = [
  { code: 'en', name: 'English', nativeName: 'English', script: 'Latin', direction: 'ltr', tesseractCode: 'eng', supported: true },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', script: 'Latin', direction: 'ltr', tesseractCode: 'vie', supported: true },
  { code: 'zh', name: 'Chinese', nativeName: '中文', script: 'Han', direction: 'ltr', tesseractCode: 'chi_sim', supported: true },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', script: 'Hiragana/Katakana/Kanji', direction: 'ltr', tesseractCode: 'jpn', supported: false },
  { code: 'ko', name: 'Korean', nativeName: '한국어', script: 'Hangul', direction: 'ltr', tesseractCode: 'kor', supported: false },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', script: 'Thai', direction: 'ltr', tesseractCode: 'tha', supported: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', script: 'Arabic', direction: 'rtl', tesseractCode: 'ara', supported: false },
  { code: 'fr', name: 'French', nativeName: 'Français', script: 'Latin', direction: 'ltr', tesseractCode: 'fra', supported: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', script: 'Latin', direction: 'ltr', tesseractCode: 'deu', supported: false },
  { code: 'es', name: 'Spanish', nativeName: 'Español', script: 'Latin', direction: 'ltr', tesseractCode: 'spa', supported: false },
];

export function MultiLanguageOCR({ documentId, imageUrl, onOCRComplete }: MultiLanguageOCRProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<OCRLanguageConfig | null>(null);
  const [detectedLanguages, setDetectedLanguages] = useState<LanguageDetectionResult[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true);
  const [multiLanguageMode, setMultiLanguageMode] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (autoDetectEnabled && imageUrl) {
      detectLanguages();
    }
  }, [imageUrl, autoDetectEnabled]);

  const detectLanguages = async () => {
    setIsDetecting(true);
    try {
      const response = await fetch('/api/ocr/detect-language', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId,
          imageUrl,
        }),
      });

      if (!response.ok) {
        throw new Error('Language detection failed');
      }

      const results: LanguageDetectionResult[] = await response.json();
      setDetectedLanguages(results);

      // Auto-select the most confident language
      if (results.length > 0) {
        const topLanguage = results[0];
        const languageConfig = SUPPORTED_LANGUAGES.find(lang => 
          lang.code === topLanguage.language
        );
        if (languageConfig) {
          setSelectedLanguage(languageConfig);
        }
      }

      toast({
        title: "Language detection completed",
        description: `Detected ${results.length} language(s) in the document.`,
      });

    } catch (error) {
      console.error('Language detection error:', error);
      toast({
        title: "Language detection failed",
        description: "Using default English OCR settings.",
        variant: "destructive",
      });
      
      // Fallback to English
      setSelectedLanguage(SUPPORTED_LANGUAGES[0]);
    } finally {
      setIsDetecting(false);
    }
  };

  const performOCR = async () => {
    if (!selectedLanguage) {
      toast({
        title: "No language selected",
        description: "Please select a language for OCR processing.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setOcrProgress(0);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setOcrProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 10;
        });
      }, 500);

      const response = await fetch('/api/ocr/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId,
          imageUrl,
          language: selectedLanguage.tesseractCode,
          multiLanguage: multiLanguageMode,
          enableDeepSeek: true,
        }),
      });

      if (!response.ok) {
        throw new Error('OCR processing failed');
      }

      const result = await response.json();
      
      clearInterval(progressInterval);
      setOcrProgress(100);

      onOCRComplete({
        text: result.text,
        confidence: result.confidence,
        language: selectedLanguage.code,
        detectedLanguages,
      });

      toast({
        title: "OCR processing completed",
        description: `Text extracted with ${result.confidence}% confidence.`,
      });

    } catch (error) {
      console.error('OCR processing error:', error);
      toast({
        title: "OCR processing failed",
        description: "An error occurred while processing the document.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getLanguageFlag = (languageCode: string) => {
    const flags: Record<string, string> = {
      'en': '🇺🇸',
      'vi': '🇻🇳',
      'zh': '🇨🇳',
      'ja': '🇯🇵',
      'ko': '🇰🇷',
      'th': '🇹🇭',
      'ar': '🇸🇦',
      'fr': '🇫🇷',
      'de': '🇩🇪',
      'es': '🇪🇸',
    };
    return flags[languageCode] || '🌐';
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5 text-blue-600" />
          Multi-Language OCR Engine
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Language Detection Results */}
        {detectedLanguages.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-green-600" />
              <h3 className="font-medium">Detected Languages</h3>
              {isDetecting && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {detectedLanguages.map((detection, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getLanguageFlag(detection.language)}</span>
                    <div>
                      <p className="font-medium text-sm">
                        {SUPPORTED_LANGUAGES.find(l => l.code === detection.language)?.name || detection.language}
                      </p>
                      <p className="text-xs text-gray-500">{detection.script} • {detection.direction}</p>
                    </div>
                  </div>
                  <Badge variant={detection.confidence > 80 ? 'default' : 'secondary'}>
                    {detection.confidence}%
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Language Selection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">OCR Language Settings</h3>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoDetect"
                checked={autoDetectEnabled}
                onChange={(e) => setAutoDetectEnabled(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="autoDetect" className="text-sm">Auto-detect</label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Primary Language</label>
              <Select 
                value={selectedLanguage?.code || ''} 
                onValueChange={(value) => {
                  const language = SUPPORTED_LANGUAGES.find(l => l.code === value);
                  setSelectedLanguage(language || null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map((language) => (
                    <SelectItem 
                      key={language.code} 
                      value={language.code}
                      disabled={!language.supported}
                    >
                      <div className="flex items-center gap-2">
                        <span>{getLanguageFlag(language.code)}</span>
                        <span>{language.name}</span>
                        <span className="text-xs text-gray-500">({language.nativeName})</span>
                        {!language.supported && (
                          <Badge variant="outline" className="text-xs">Coming Soon</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Processing Mode</label>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="singleLang"
                    checked={!multiLanguageMode}
                    onChange={() => setMultiLanguageMode(false)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="singleLang" className="text-sm">Single Language</label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="multiLang"
                    checked={multiLanguageMode}
                    onChange={() => setMultiLanguageMode(true)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="multiLang" className="text-sm">Multi-Language</label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* OCR Progress */}
        {isProcessing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Processing OCR...</span>
              <span className="text-sm text-gray-500">{Math.round(ocrProgress)}%</span>
            </div>
            <Progress value={ocrProgress} className="w-full" />
          </div>
        )}

        {/* Warnings and Alerts */}
        {selectedLanguage && !selectedLanguage.supported && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {selectedLanguage.name} OCR is not yet supported. Please select English or Vietnamese for best results.
            </AlertDescription>
          </Alert>
        )}

        {multiLanguageMode && (
          <Alert>
            <Globe className="h-4 w-4" />
            <AlertDescription>
              Multi-language mode may take longer to process but provides better accuracy for mixed-language documents.
            </AlertDescription>
          </Alert>
        )}

        <Separator />

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <Button 
            variant="outline" 
            onClick={detectLanguages}
            disabled={isDetecting || isProcessing}
          >
            {isDetecting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Brain className="h-4 w-4 mr-2" />
            )}
            Detect Languages
          </Button>

          <Button 
            onClick={performOCR}
            disabled={!selectedLanguage || isProcessing || !selectedLanguage.supported}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Scan className="h-4 w-4 mr-2" />
            )}
            Start OCR Processing
          </Button>
        </div>

        {/* Processing Stats */}
        {selectedLanguage && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{selectedLanguage.script}</p>
              <p className="text-xs text-gray-500">Script Type</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{selectedLanguage.direction.toUpperCase()}</p>
              <p className="text-xs text-gray-500">Text Direction</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">
                {detectedLanguages.length > 0 ? Math.round(detectedLanguages[0]?.confidence || 0) : 0}%
              </p>
              <p className="text-xs text-gray-500">Confidence</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">
                {selectedLanguage.supported ? 'Ready' : 'Pending'}
              </p>
              <p className="text-xs text-gray-500">Status</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
