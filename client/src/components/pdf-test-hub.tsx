import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Bug, 
  Settings, 
  Wrench,
  CheckCircle,
  ExternalLink
} from 'lucide-react';

export function PDFTestHub() {
  const testRoutes = [
    {
      path: '/pdf-fixed',
      name: 'Fixed PDF Viewer',
      description: 'Completely rewritten PDF viewer with proper error handling and debugging',
      icon: <CheckCircle className="h-5 w-5 text-green-500" />,
      status: 'Recommended',
      features: ['File upload', 'Full navigation', 'Zoom controls', 'Error handling']
    },
    {
      path: '/pdf-simple',
      name: 'Simple PDF Viewer',
      description: 'Minimal PDF viewer for basic testing',
      icon: <FileText className="h-5 w-5 text-blue-500" />,
      status: 'Basic',
      features: ['File upload', 'Page navigation', 'Canvas testing']
    },
    {
      path: '/pdf-debug',
      name: 'PDF Debug Viewer',
      description: 'Advanced debugging with step-by-step logging',
      icon: <Bug className="h-5 w-5 text-orange-500" />,
      status: 'Debug',
      features: ['Detailed logging', 'Canvas testing', 'Worker validation']
    },
    {
      path: '/pdf-diagnostics',
      name: 'PDF System Diagnostics',
      description: 'Check PDF.js configuration and system health',
      icon: <Settings className="h-5 w-5 text-purple-500" />,
      status: 'System Check',
      features: ['Worker status', 'Network tests', 'Version info']
    },
    {
      path: '/pdf-demo',
      name: 'Original PDF Demo',
      description: 'Original demo with multiple viewers and external PDFs',
      icon: <Wrench className="h-5 w-5 text-gray-500" />,
      status: 'Legacy',
      features: ['Multiple viewers', 'External URLs', 'OCR integration']
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Recommended': return 'bg-green-500';
      case 'Basic': return 'bg-blue-500';
      case 'Debug': return 'bg-orange-500';
      case 'System Check': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const openInNewTab = (path: string) => {
    window.open(path, '_blank');
  };

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-6 w-6" />
            PDF Viewer Test Hub
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            Welcome to the PDF Viewer Test Hub! This page provides access to all available PDF viewers and debugging tools. 
            Start with the <strong>Fixed PDF Viewer</strong> for the best experience.
          </p>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {testRoutes.map((route, index) => (
              <Card key={index} className="border-2 hover:border-blue-300 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {route.icon}
                      <CardTitle className="text-lg">{route.name}</CardTitle>
                    </div>
                    <Badge className={getStatusColor(route.status)}>
                      {route.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-3">
                    {route.description}
                  </p>
                  
                  <div className="space-y-2 mb-4">
                    <p className="text-xs font-medium text-gray-500">Features:</p>
                    <div className="flex flex-wrap gap-1">
                      {route.features.map((feature, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      onClick={() => window.location.href = route.path}
                      className="flex-1"
                    >
                      Open
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => openInNewTab(route.path)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Debugging Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>PDF.js worker configured at <code>/pdf.worker.min.js</code></span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Frontend running on <code>http://localhost:5173</code></span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Canvas 2D context available</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>File upload and ArrayBuffer conversion working</span>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-blue-50 rounded border-l-4 border-blue-400">
            <p className="text-sm text-blue-800">
              <strong>Recommendation:</strong> Start with the "Fixed PDF Viewer" which includes comprehensive error handling, 
              proper cleanup, and detailed console logging to help identify any remaining issues.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
