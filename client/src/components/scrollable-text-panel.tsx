import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Copy, 
  Edit, 
  Save, 
  X, 
  CheckCircle, 
  AlertTriangle,
  FileText,
  Search,
  RotateCcw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ScrollableTextPanelProps {
  extractedText: string;
  confidence: number;
  isEditable?: boolean;
  onTextEdit?: (newText: string) => void;
  onSearch?: (query: string) => void;
  className?: string;
}

export function ScrollableTextPanel({
  extractedText,
  confidence,
  isEditable = true,
  onTextEdit,
  onSearch,
  className = ""
}: ScrollableTextPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(extractedText);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Update edited text when extracted text changes
  useEffect(() => {
    setEditedText(extractedText);
  }, [extractedText]);

  // Auto-resize textarea when editing
  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.style.height = 'auto';
      editRef.current.style.height = editRef.current.scrollHeight + 'px';
    }
  }, [isEditing, editedText]);

  // Handle editing
  const handleStartEdit = () => {
    setIsEditing(true);
    setEditedText(extractedText);
  };

  const handleSaveEdit = () => {
    if (onTextEdit) {
      onTextEdit(editedText);
    }
    setIsEditing(false);
    toast({
      title: "Text updated",
      description: "OCR text has been saved successfully.",
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedText(extractedText);
  };

  const handleResetText = () => {
    setEditedText(extractedText);
    toast({
      title: "Text reset",
      description: "Text has been reset to original OCR result.",
    });
  };

  // Copy text to clipboard
  const handleCopyText = async () => {
    try {
      const textToCopy = isEditing ? editedText : extractedText;
      await navigator.clipboard.writeText(textToCopy);
      toast({
        title: "Text copied",
        description: "Text has been copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Failed to copy text to clipboard.",
        variant: "destructive",
      });
    }
  };

  // Highlight search results
  const highlightSearchResults = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.split(regex).map((part, index) => {
      if (regex.test(part)) {
        return (
          <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 rounded px-1">
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  // Highlight low confidence words (simple implementation)
  const highlightLowConfidenceWords = (text: string) => {
    if (confidence > 0.8) return text;
    
    // Simple heuristic: highlight words with special characters or numbers mixed with letters
    const words = text.split(/(\s+)/);
    return words.map((word, index) => {
      const hasSpecialChars = /[^\w\s\u00C0-\u017F\u1EA0-\u1EF9]/.test(word);
      const hasMixedContent = /\d/.test(word) && /[a-zA-Z]/.test(word);
      
      if ((hasSpecialChars || hasMixedContent) && word.trim().length > 1) {
        return (
          <span
            key={index}
            className="bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 rounded px-1"
            title="Low confidence word - may need review"
          >
            {word}
          </span>
        );
      }
      return word;
    });
  };

  // Calculate text statistics
  const textStats = {
    characters: extractedText.length,
    words: extractedText.split(/\s+/).filter(word => word.length > 0).length,
    lines: extractedText.split('\n').length,
    paragraphs: extractedText.split(/\n\s*\n/).filter(p => p.trim().length > 0).length
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="p-3 border-b bg-gray-50 dark:bg-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <h3 className="font-medium">Extracted Text</h3>
            <Badge 
              variant={confidence > 0.8 ? "default" : confidence > 0.6 ? "secondary" : "destructive"}
              className="text-xs"
            >
              {Math.round(confidence * 100)}% confidence
            </Badge>
          </div>
          
          <div className="flex items-center gap-1">
            {/* Search Toggle */}
            <Button 
              size="sm" 
              variant={showSearch ? "default" : "outline"} 
              onClick={() => setShowSearch(!showSearch)}
            >
              <Search className="h-4 w-4" />
            </Button>

            {/* Copy Button */}
            <Button size="sm" variant="outline" onClick={handleCopyText}>
              <Copy className="h-4 w-4" />
            </Button>
            
            {/* Edit Controls */}
            {isEditable && (
              <>
                {!isEditing ? (
                  <Button size="sm" variant="outline" onClick={handleStartEdit}>
                    <Edit className="h-4 w-4" />
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={handleResetText} title="Reset to original">
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={handleSaveEdit}>
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div className="mt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search in text..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (onSearch) onSearch(e.target.value);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>
        )}
      </div>

      {/* Text Content - Scrollable */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {!isEditing ? (
          <div 
            ref={textRef}
            className="h-full overflow-y-auto px-4 py-4 bg-white dark:bg-gray-800"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#CBD5E0 #F7FAFC'
            }}
          >
            <div className="prose max-w-none dark:prose-invert">
              <div className="whitespace-pre-wrap text-sm leading-relaxed break-words font-mono">
                {searchQuery 
                  ? highlightSearchResults(extractedText, searchQuery)
                  : highlightLowConfidenceWords(extractedText)
                }
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full p-4 bg-white dark:bg-gray-800">
            <Textarea
              ref={editRef}
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="h-full w-full resize-none border-0 focus:ring-0 focus:outline-none font-mono text-sm leading-relaxed"
              style={{
                minHeight: '100%',
                background: 'transparent'
              }}
              placeholder="Edit the extracted text here..."
            />
          </div>
        )}
      </div>

      {/* Footer with Stats */}
      <div className="p-3 border-t bg-gray-50 dark:bg-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <span>{textStats.characters.toLocaleString()} characters</span>
            <span>{textStats.words.toLocaleString()} words</span>
            <span>{textStats.lines.toLocaleString()} lines</span>
            {textStats.paragraphs > 1 && (
              <span>{textStats.paragraphs.toLocaleString()} paragraphs</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {confidence > 0.8 ? (
              <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle className="h-3 w-3" />
                <span>High Quality</span>
              </div>
            ) : confidence > 0.6 ? (
              <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="h-3 w-3" />
                <span>Good Quality</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3 w-3" />
                <span>Review Required</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .h-full::-webkit-scrollbar {
          width: 8px;
        }
        
        .h-full::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }
        
        .h-full::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        
        .h-full::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        
        .dark .h-full::-webkit-scrollbar-track {
          background: #374151;
        }
        
        .dark .h-full::-webkit-scrollbar-thumb {
          background: #6b7280;
        }
        
        .dark .h-full::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
      `}</style>
    </div>
  );
}
