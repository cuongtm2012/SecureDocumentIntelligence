export interface Translations {
  // Navigation
  dashboard: string;
  documents: string;
  settings: string;
  logout: string;

  // Document Upload
  uploadDocument: string;
  uploadDocuments: string;
  dragDropFiles: string;
  selectFiles: string;
  supportedFormats: string;
  uploadProgress: string;
  processingDocument: string;
  uploadComplete: string;
  uploadFailed: string;

  // Document Processing
  processDocument: string;
  processing: string;
  completed: string;
  failed: string;
  pending: string;
  confidence: string;
  extractedText: string;
  structuredData: string;
  
  // System Status
  systemStatus: string;
  services: string;
  database: string;
  ocr: string;
  operational: string;
  usage: string;
  session: string;

  // Activity & Logs
  recentActivity: string;
  auditLogs: string;
  action: string;
  timestamp: string;
  user: string;
  details: string;
  
  // Document Information
  fileName: string;
  fileSize: string;
  uploadDate: string;
  processingStatus: string;
  documentType: string;
  language: string;
  
  // Security
  classified: string;
  securityLevel: string;
  clearanceLevel: string;
  authorized: string;
  
  // Common
  loading: string;
  error: string;
  success: string;
  cancel: string;
  close: string;
  save: string;
  delete: string;
  download: string;
  view: string;
  edit: string;
  refresh: string;
}

export const translations: Record<string, Translations> = {
  en: {
    // Navigation
    dashboard: "Dashboard",
    documents: "Documents",
    settings: "Settings",
    logout: "Logout",

    // Document Upload
    uploadDocument: "Upload Document",
    uploadDocuments: "Upload Documents",
    dragDropFiles: "Drag and drop files here, or click to select",
    selectFiles: "Select Files",
    supportedFormats: "Supported formats: JPEG, PNG, PDF",
    uploadProgress: "Upload Progress",
    processingDocument: "Processing document...",
    uploadComplete: "Upload Complete",
    uploadFailed: "Upload Failed",

    // Document Processing
    processDocument: "Process Document",
    processing: "Processing",
    completed: "Completed",
    failed: "Failed",
    pending: "Pending",
    confidence: "Confidence",
    extractedText: "Extracted Text",
    structuredData: "Structured Data",
    
    // System Status
    systemStatus: "System Status",
    services: "Services",
    database: "Database",
    ocr: "OCR",
    operational: "Operational",
    usage: "Usage",
    session: "Session",

    // Activity & Logs
    recentActivity: "Recent Activity",
    auditLogs: "Audit Logs",
    action: "Action",
    timestamp: "Timestamp",
    user: "User",
    details: "Details",
    
    // Document Information
    fileName: "File Name",
    fileSize: "File Size",
    uploadDate: "Upload Date",
    processingStatus: "Processing Status",
    documentType: "Document Type",
    language: "Language",
    
    // Security
    classified: "CLASSIFIED",
    securityLevel: "Security Level",
    clearanceLevel: "Clearance Level",
    authorized: "AUTHORIZED",
    
    // Common
    loading: "Loading...",
    error: "Error",
    success: "Success",
    cancel: "Cancel",
    close: "Close",
    save: "Save",
    delete: "Delete",
    download: "Download",
    view: "View",
    edit: "Edit",
    refresh: "Refresh",
  },

  vi: {
    // Navigation
    dashboard: "Bảng điều khiển",
    documents: "Tài liệu",
    settings: "Cài đặt",
    logout: "Đăng xuất",

    // Document Upload
    uploadDocument: "Tải lên tài liệu",
    uploadDocuments: "Tải lên tài liệu",
    dragDropFiles: "Kéo và thả tệp vào đây, hoặc nhấp để chọn",
    selectFiles: "Chọn tệp",
    supportedFormats: "Định dạng hỗ trợ: JPEG, PNG, PDF",
    uploadProgress: "Tiến trình tải lên",
    processingDocument: "Đang xử lý tài liệu...",
    uploadComplete: "Tải lên thành công",
    uploadFailed: "Tải lên thất bại",

    // Document Processing
    processDocument: "Xử lý tài liệu",
    processing: "Đang xử lý",
    completed: "Hoàn thành",
    failed: "Thất bại",
    pending: "Đang chờ",
    confidence: "Độ tin cậy",
    extractedText: "Văn bản trích xuất",
    structuredData: "Dữ liệu có cấu trúc",
    
    // System Status
    systemStatus: "Trạng thái hệ thống",
    services: "Dịch vụ",
    database: "Cơ sở dữ liệu",
    ocr: "OCR",
    operational: "Hoạt động",
    usage: "Sử dụng",
    session: "Phiên làm việc",

    // Activity & Logs
    recentActivity: "Hoạt động gần đây",
    auditLogs: "Nhật ký kiểm toán",
    action: "Hành động",
    timestamp: "Thời gian",
    user: "Người dùng",
    details: "Chi tiết",
    
    // Document Information
    fileName: "Tên tệp",
    fileSize: "Kích thước tệp",
    uploadDate: "Ngày tải lên",
    processingStatus: "Trạng thái xử lý",
    documentType: "Loại tài liệu",
    language: "Ngôn ngữ",
    
    // Security
    classified: "MẬT",
    securityLevel: "Cấp độ bảo mật",
    clearanceLevel: "Cấp độ ủy quyền",
    authorized: "ĐÃ ỦY QUYỀN",
    
    // Common
    loading: "Đang tải...",
    error: "Lỗi",
    success: "Thành công",
    cancel: "Hủy",
    close: "Đóng",
    save: "Lưu",
    delete: "Xóa",
    download: "Tải xuống",
    view: "Xem",
    edit: "Chỉnh sửa",
    refresh: "Làm mới",
  }
};

export function getTranslation(key: keyof Translations, language: string): string {
  return translations[language]?.[key] || translations.en[key] || key;
}