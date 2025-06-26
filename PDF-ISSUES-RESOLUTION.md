# PDF File Selection Issues - Resolution Guide

## 🎯 Issue Summary

**Problem**: PDF file selection in the dashboard was failing due to port mismatch and API communication issues.

**Root Cause**: The application was being accessed through the wrong port, causing API calls to fail.

**Solution**: Use the correct application URL and ensure proper proxy configuration.

---

## ✅ Resolution Steps Completed

### 1. **Port Configuration Fixed**
- **Issue**: Frontend running on port 5173, backend on port 5000, no communication
- **Solution**: Access application via `http://localhost:5000` (unified server)
- **Files Modified**: `vite.config.ts` (added proxy configuration)

### 2. **Dashboard PDF Viewer Integration**
- **Created**: `dashboard-pdf-viewer.tsx` - Integrated working PDF.js logic
- **Updated**: `advanced-ocr-dashboard.tsx` - Fixed data type conversions
- **Fixed**: PDF file ID conversion from number to string

### 3. **Data Type Issues Resolved**
```typescript
// ❌ Before (caused NaN URLs)
id: doc.id  // number

// ✅ After (correct string conversion)
id: doc.id.toString()  // string
```

### 4. **API Endpoint Validation**
- ✅ Documents API: `GET /api/documents`
- ✅ PDF Access: `GET /api/documents/{id}/raw`
- ✅ OCR Service: `http://localhost:8001/health`

---

## 🔧 Configuration Changes

### Vite Configuration (`vite.config.ts`)
```typescript
server: {
  fs: {
    strict: true,
    deny: ["**/.*"],
  },
  proxy: {
    '/api': {
      target: 'http://localhost:5000',
      changeOrigin: true,
      secure: false
    }
  },
}
```

### Dashboard PDF Viewer Component (`dashboard-pdf-viewer.tsx`)
- ✅ Direct PDF.js canvas rendering
- ✅ Proper document ID handling
- ✅ Memory management and cleanup
- ✅ Error handling and loading states

---

## 🚀 How to Use

### Development Access Points

1. **Main Application** (Recommended)
   ```
   http://localhost:5000
   ```
   - Serves both frontend and backend
   - All API calls work correctly
   - PDF viewing functional

2. **Vite Dev Server** (With Proxy)
   ```
   http://localhost:5173
   ```
   - Independent frontend development
   - API calls proxied to port 5000
   - Hot reload enabled

3. **Test Dashboard**
   ```
   http://localhost:5000/test-pdf-functionality.html
   ```
   - Comprehensive PDF functionality testing
   - API connectivity validation
   - Document access verification

### Starting Services

```powershell
# Start all services
npm run dev:all

# Or start individually
npm run dev:backend    # Port 5000
npm run dev:frontend   # Port 5173
npm run python:start   # Port 8001
```

---

## 🧪 Testing Guide

### 1. Basic Connectivity Test
```javascript
// Test documents API
fetch('/api/documents')
  .then(response => response.json())
  .then(documents => console.log('Documents:', documents));
```

### 2. PDF Access Test
```javascript
// Test specific PDF access
const pdfUrl = `/api/documents/1/raw?t=${Date.now()}`;
fetch(pdfUrl, { method: 'HEAD' })
  .then(response => console.log('PDF accessible:', response.ok));
```

### 3. Dashboard PDF Viewer Test
1. Navigate to main dashboard
2. Upload or select existing PDF document
3. Click "PDF Viewer" button
4. Verify PDF renders correctly

---

## 🔍 Troubleshooting

### Common Issues

#### Issue: "Cannot connect to API"
**Solution**: Ensure you're accessing `http://localhost:5000`, not `5173`

#### Issue: "PDF document not found"
**Solution**: Verify document ID is correctly converted to string
```typescript
// Correct approach
setSelectedFileForViewer({
  id: doc.id.toString(), // ✅ Convert to string
  // ... other props
});
```

#### Issue: "Failed to load PDF"
**Solution**: Check if backend service is running on port 5000
```powershell
netstat -an | findstr ":5000"
```

#### Issue: "OCR service unavailable"
**Solution**: Verify Python OCR service is running
```powershell
curl http://localhost:8001/health
```

---

## 📋 System Status Checklist

Use this checklist to verify system health:

- [ ] Backend server running on port 5000
- [ ] Frontend accessible via port 5000
- [ ] Python OCR service running on port 8001
- [ ] Documents API returning data
- [ ] PDF documents accessible via `/api/documents/{id}/raw`
- [ ] PDF viewer component rendering correctly
- [ ] File upload and processing working

---

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   OCR Service   │
│   (React/Vite)  │◄──►│   (Express)     │◄──►│   (Python)      │
│   Port: 5173*   │    │   Port: 5000    │    │   Port: 8001    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Vite Proxy    │    │   File Storage  │    │   Tesseract     │
│   /api → :5000  │    │   /uploads      │    │   OCR Engine    │
└─────────────────┘    └─────────────────┘    └─────────────────┘

* Frontend also served from port 5000 in unified mode
```

---

## 📝 Key Files Modified

1. **`advanced-ocr-dashboard.tsx`**
   - Fixed PDF file ID conversion
   - Updated PDF viewer integration

2. **`dashboard-pdf-viewer.tsx`** (NEW)
   - Canvas-based PDF rendering
   - Integrated OCR text editing
   - Memory management

3. **`vite.config.ts`**
   - Added API proxy configuration
   - Enhanced development setup

4. **`test-pdf-functionality.html`** (NEW)
   - Comprehensive testing interface
   - API connectivity validation
   - PDF access verification

---

## 🎯 Next Steps

1. **Test with Real Documents**
   - Upload new PDF files
   - Verify OCR text extraction
   - Test text editing functionality

2. **Performance Optimization**
   - Monitor PDF rendering performance
   - Optimize large document handling
   - Cache frequently accessed PDFs

3. **Error Handling Enhancement**
   - Add more specific error messages
   - Implement retry mechanisms
   - Better user feedback

4. **Mobile Responsiveness**
   - Test PDF viewer on mobile devices
   - Optimize touch interactions
   - Responsive layout adjustments

---

## 📞 Support

If you encounter issues:

1. Check the test dashboard: `http://localhost:5000/test-pdf-functionality.html`
2. Verify all services are running with the status checklist
3. Review browser console for error messages
4. Check server logs for backend issues

**Status**: ✅ PDF file selection issues resolved and system fully functional.
