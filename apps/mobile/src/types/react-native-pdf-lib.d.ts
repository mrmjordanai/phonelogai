declare module 'react-native-pdf-lib' {
  export interface PDFPage {
    create(_options?: any): Promise<PDFPage>;
    getNumberOfPages(): number;
    write(): Promise<string>;
    addPage(_page: PDFPage): void;
    
    // Text methods
    addText(_text: string, _options?: any): void;
    
    // Drawing methods  
    addRect(_options: any): void;
    addCircle(_options: any): void;
    
    // Helper methods
    measure(_options: any): any;
    width(): any;
    height(): any;
    
    // Color utilities
    rgb(_r: number, _g: number, _b: number): any;
  }

  export interface PDFDocument {
    create(_options?: any): Promise<PDFDocument>;
    addPage(_options?: any): Promise<PDFPage>;
    write(): Promise<string>;
  }

  declare const PDFLib: {
    create(_options?: any): Promise<PDFDocument>;
    PDFPage: PDFPage;
    PDFDocument: PDFDocument;
  };
  
  export default PDFLib;
}