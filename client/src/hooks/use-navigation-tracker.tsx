
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';

interface UseNavigationTrackerProps {
  uploadPagePath?: string;
}

export function useNavigationTracker({ 
  uploadPagePath = '/dashboard' 
}: UseNavigationTrackerProps = {}) {
  const [location] = useLocation();
  const [isAwayFromUploadPage, setIsAwayFromUploadPage] = useState(false);

  useEffect(() => {
    const isOnUploadPage = location === uploadPagePath;
    setIsAwayFromUploadPage(!isOnUploadPage);
  }, [location, uploadPagePath]);

  return {
    isAwayFromUploadPage,
    currentPath: location,
  };
}
