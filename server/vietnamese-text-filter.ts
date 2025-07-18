/**
 * Vietnamese Text Filter Utility
 * Filters text to keep only valid Vietnamese characters, numbers, and basic punctuation
 * 
 * Features:
 * - Comprehensive Vietnamese character support with all diacritics
 * - Numbers (0-9) and basic punctuation preservation
 * - Whitespace normalization
 * - Special character removal
 */

export class VietnameseTextFilter {
  private static readonly VIETNAMESE_CHARS = 'aăâáàảãạấầẩẫậắằẳẵặbcdđeêéèẻẽẹếềểễệfghiíìỉĩịjklmnoôơóòỏõọốồổỗộớờởỡợpqrstuưúùủũụứừửữựvwxyýỳỷỹỵz';
  private static readonly UPPER_VIETNAMESE_CHARS = this.VIETNAMESE_CHARS.toUpperCase();
  
  // Valid characters: Vietnamese letters, numbers, basic punctuation, and space
  private static readonly VALID_CHARS_REGEX = new RegExp(
    `[${this.VIETNAMESE_CHARS}${this.UPPER_VIETNAMESE_CHARS}0-9.,:;/\\-()\\s]`, 
    'g'
  );

  /**
   * Clean Vietnamese text by removing invalid characters
   * @param text - Input text to clean
   * @returns Cleaned text with only valid Vietnamese characters
   */
  static cleanText(text: string): string {
    if (!text) return '';
    
    // Extract only valid characters
    const cleanedText = text.match(this.VALID_CHARS_REGEX)?.join('') || '';
    
    // Clean up multiple spaces and normalize whitespace
    return cleanedText.replace(/\s+/g, ' ').trim();
  }

  /**
   * Get statistics about the text cleaning process
   * @param originalText - Original text before cleaning
   * @param cleanedText - Text after cleaning
   * @returns Statistics object
   */
  static getCleaningStats(originalText: string, cleanedText: string): {
    originalLength: number;
    cleanedLength: number;
    removedCharacters: number;
    removedPercentage: number;
    removedChars: string[];
  } {
    const originalLength = originalText.length;
    const cleanedLength = cleanedText.length;
    const removedCharacters = originalLength - cleanedLength;
    const removedPercentage = originalLength > 0 ? (removedCharacters / originalLength) * 100 : 0;
    
    // Find characters that were removed
    const originalChars = new Set(originalText.split(''));
    const cleanedChars = new Set(cleanedText.split(''));
    const removedChars = Array.from(originalChars).filter(char => !cleanedChars.has(char));
    
    return {
      originalLength,
      cleanedLength,
      removedCharacters,
      removedPercentage: Math.round(removedPercentage * 100) / 100,
      removedChars
    };
  }

  /**
   * Check if a character is valid Vietnamese character
   * @param char - Character to check
   * @returns True if valid Vietnamese character
   */
  static isValidVietnameseChar(char: string): boolean {
    return this.VALID_CHARS_REGEX.test(char);
  }

  /**
   * Preview text cleaning (for debugging)
   * @param text - Text to preview
   * @param maxLength - Maximum length to show
   * @returns Preview object
   */
  static previewCleaning(text: string, maxLength: number = 100): {
    original: string;
    cleaned: string;
    stats: ReturnType<typeof VietnameseTextFilter.getCleaningStats>;
  } {
    const cleaned = this.cleanText(text);
    const stats = this.getCleaningStats(text, cleaned);
    
    return {
      original: text.length > maxLength ? text.substring(0, maxLength) + '...' : text,
      cleaned: cleaned.length > maxLength ? cleaned.substring(0, maxLength) + '...' : cleaned,
      stats
    };
  }
}

// Export for use in other modules
export default VietnameseTextFilter;