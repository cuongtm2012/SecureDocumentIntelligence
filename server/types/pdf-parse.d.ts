declare module 'pdf-parse' {
  interface PDFData {
    numpages: number;
    text: string;
    metadata?: any;
    info?: any;
    version?: string;
  }

  function pdfParse(buffer: Buffer, options?: any): Promise<PDFData>;
  export = pdfParse;
}