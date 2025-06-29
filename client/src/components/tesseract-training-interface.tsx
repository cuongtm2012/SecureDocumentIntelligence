import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Settings,
  Play,
  Download,
  CheckCircle,
  AlertCircle,
  Clock,
  FileText,
  TrendingUp,
  Zap,
  BookOpen
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TrainingSession {
  id: string;
  name: string;
  status: 'preparing' | 'training' | 'completed' | 'failed';
  documentsCount: number;
  accuracy?: number;
  createdAt: string;
  completedAt?: string;
  modelPath?: string;
}

interface ValidationResult {
  suitable: number[];
  unsuitable: Array<{
    id: number;
    reason: string;
  }>;
  recommendations: string[];
}

export function TesseractTrainingInterface() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedDocuments, setSelectedDocuments] = useState<number[]>([]);
  const [sessionName, setSessionName] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  // Fetch all documents
  const { data: documents = [] } = useQuery<any[]>({
    queryKey: ['/api/documents'],
    refetchInterval: 5000
  });

  // Fetch training sessions
  const { data: sessionsData, refetch: refetchSessions } = useQuery<{ sessions: TrainingSession[] }>({
    queryKey: ['/api/training/sessions'],
    refetchInterval: 10000
  });

  // Fetch training guide
  const { data: guideData } = useQuery<{ guide: { steps: string[]; requirements: string[]; estimatedTime: string } }>({
    queryKey: ['/api/training/guide']
  });

  // Validate documents mutation
  const validateMutation = useMutation({
    mutationFn: async (documentIds: number[]) => {
      const response = await fetch('/api/training/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds })
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setValidationResult(data.validation);
        setShowValidation(true);
      }
    }
  });

  // Start training mutation
  const startTrainingMutation = useMutation({
    mutationFn: async ({ sessionName, documentIds }: { sessionName: string; documentIds: number[] }) => {
      const response = await fetch('/api/training/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionName, documentIds })
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Training started",
          description: `Training session "${sessionName}" started with ${data.validation.suitable.length} documents`
        });
        setSelectedDocuments([]);
        setSessionName('');
        refetchSessions();
      } else {
        toast({
          title: "Training failed to start",
          description: data.error,
          variant: "destructive"
        });
      }
    }
  });

  // Install model mutation
  const installModelMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await fetch(`/api/training/install/${sessionId}`, {
        method: 'POST'
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Model installed",
          description: "Improved Vietnamese model installed successfully"
        });
      }
    }
  });

  const handleDocumentSelect = (docId: number, checked: boolean) => {
    setSelectedDocuments(prev => 
      checked 
        ? [...prev, docId]
        : prev.filter(id => id !== docId)
    );
  };

  const handleSelectAll = () => {
    const highQualityDocs = documents
      .filter((doc: any) => 
        doc.extractedText && 
        doc.extractedText.length > 10 && 
        (!doc.confidence || doc.confidence > 0.7)
      )
      .map((doc: any) => doc.id);
    
    setSelectedDocuments(highQualityDocs);
  };

  const handleValidateDocuments = () => {
    if (selectedDocuments.length === 0) {
      toast({
        title: "No documents selected",
        description: "Please select documents for training",
        variant: "destructive"
      });
      return;
    }
    validateMutation.mutate(selectedDocuments);
  };

  const handleStartTraining = () => {
    if (!sessionName.trim()) {
      toast({
        title: "Session name required",
        description: "Please enter a name for your training session",
        variant: "destructive"
      });
      return;
    }
    startTrainingMutation.mutate({ sessionName: sessionName.trim(), documentIds: selectedDocuments });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'preparing': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'training': return <Zap className="h-4 w-4 text-blue-500" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'preparing': return 'secondary';
      case 'training': return 'default';
      case 'completed': return 'default';
      case 'failed': return 'destructive';
      default: return 'secondary';
    }
  };

  const sessions: TrainingSession[] = sessionsData?.sessions || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tesseract Training Center</h1>
          <p className="text-gray-600">Improve Vietnamese OCR accuracy using your own data</p>
        </div>
        <Button variant="outline" onClick={() => setShowGuide(true)}>
          <BookOpen className="h-4 w-4 mr-2" />
          Training Guide
        </Button>
      </div>

      <Tabs defaultValue="new-training" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="new-training">New Training</TabsTrigger>
          <TabsTrigger value="training-history">Training History</TabsTrigger>
        </TabsList>

        <TabsContent value="new-training" className="space-y-6">
          {/* Document Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Select Training Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="session-name">Training Session Name</Label>
                  <Input
                    id="session-name"
                    placeholder="e.g., Receipt Training v1"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    className="w-80"
                  />
                </div>
                <div className="space-x-2">
                  <Button variant="outline" onClick={handleSelectAll}>
                    Select High Quality
                  </Button>
                  <Button 
                    onClick={handleValidateDocuments}
                    disabled={selectedDocuments.length === 0 || validateMutation.isPending}
                  >
                    {validateMutation.isPending ? 'Validating...' : 'Validate Selection'}
                  </Button>
                </div>
              </div>

              <div className="text-sm text-gray-600">
                Selected: {selectedDocuments.length} documents
                {selectedDocuments.length > 0 && (
                  <span className="ml-2">
                    (Minimum 10-20 recommended for effective training)
                  </span>
                )}
              </div>

              <ScrollArea className="h-80">
                <div className="space-y-2">
                  {documents.map((doc: any) => (
                    <div
                      key={doc.id}
                      className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <Checkbox
                        checked={selectedDocuments.includes(doc.id)}
                        onCheckedChange={(checked) => handleDocumentSelect(doc.id, checked as boolean)}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{doc.filename}</div>
                        <div className="text-sm text-gray-500">
                          {doc.extractedText ? `${doc.extractedText.length} characters` : 'No text extracted'}
                          {doc.confidence && (
                            <span className="ml-2">
                              • {Math.round(doc.confidence * 100)}% confidence
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant={doc.confidence > 0.8 ? 'default' : doc.confidence > 0.6 ? 'secondary' : 'destructive'}>
                        {doc.confidence ? `${Math.round(doc.confidence * 100)}%` : 'No OCR'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Training Actions */}
          {validationResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Training Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {validationResult.suitable.length}
                    </div>
                    <div className="text-sm text-green-600">Suitable Documents</div>
                  </div>
                  
                  <div className="text-center p-4 bg-yellow-50 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600">
                      {validationResult.unsuitable.length}
                    </div>
                    <div className="text-sm text-yellow-600">Excluded Documents</div>
                  </div>
                  
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">15-30min</div>
                    <div className="text-sm text-blue-600">Est. Training Time</div>
                  </div>
                </div>

                {validationResult.recommendations.length > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-medium mb-2">Recommendations:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {validationResult.recommendations.map((rec, idx) => (
                          <li key={idx} className="text-sm">{rec}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleStartTraining}
                  disabled={validationResult.suitable.length < 5 || !sessionName.trim() || startTrainingMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {startTrainingMutation.isPending ? 'Starting Training...' : 'Start Training Session'}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="training-history" className="space-y-4">
          {sessions.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <TrendingUp className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Training Sessions</h3>
                <p className="text-gray-500">Start your first training session to improve OCR accuracy</p>
              </CardContent>
            </Card>
          ) : (
            sessions.map((session) => (
              <Card key={session.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(session.status)}
                      <div>
                        <h3 className="font-medium">{session.name}</h3>
                        <p className="text-sm text-gray-500">
                          {session.documentsCount} documents • Created {new Date(session.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Badge variant={getStatusColor(session.status) as any}>
                        {session.status}
                      </Badge>
                      
                      {session.accuracy && (
                        <Badge variant="outline">
                          {session.accuracy.toFixed(1)}% accuracy
                        </Badge>
                      )}
                      
                      {session.status === 'completed' && session.modelPath && (
                        <Button
                          size="sm"
                          onClick={() => installModelMutation.mutate(session.id)}
                          disabled={installModelMutation.isPending}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Install Model
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {session.status === 'training' && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span>Training in progress...</span>
                        <span>This may take 15-30 minutes</span>
                      </div>
                      <Progress value={undefined} className="h-2" />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Validation Results Dialog */}
      <Dialog open={showValidation} onOpenChange={setShowValidation}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Document Validation Results</DialogTitle>
          </DialogHeader>
          {validationResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-xl font-bold text-green-600">
                    {validationResult.suitable.length}
                  </div>
                  <div className="text-sm text-green-600">Suitable for Training</div>
                </div>
                
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-xl font-bold text-red-600">
                    {validationResult.unsuitable.length}
                  </div>
                  <div className="text-sm text-red-600">Excluded from Training</div>
                </div>
              </div>

              {validationResult.unsuitable.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Excluded Documents:</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {validationResult.unsuitable.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 bg-red-50 rounded">
                        <span className="text-sm">Document ID: {item.id}</span>
                        <span className="text-xs text-red-600">{item.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Training Guide Dialog */}
      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tesseract Training Guide</DialogTitle>
          </DialogHeader>
          {guideData?.guide && (
            <div className="space-y-6">
              <div>
                <h3 className="font-medium mb-3">Training Steps:</h3>
                <ol className="list-decimal list-inside space-y-2">
                  {guideData.guide.steps.map((step: string, idx: number) => (
                    <li key={idx} className="text-sm">{step}</li>
                  ))}
                </ol>
              </div>

              <div>
                <h3 className="font-medium mb-3">Requirements:</h3>
                <ul className="list-disc list-inside space-y-1">
                  {guideData.guide.requirements.map((req: string, idx: number) => (
                    <li key={idx} className="text-sm">{req}</li>
                  ))}
                </ul>
              </div>

              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  <strong>Estimated Time:</strong> {guideData.guide.estimatedTime}
                </AlertDescription>
              </Alert>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}