
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface UseNavigationTrackerProps {
  uploadPagePath?: string;
}

export function useNavigationTracker({ 
  uploadPagePath = '/dashboard' 
}: UseNavigationTrackerProps = {}) {
  const location = useLocation();
  const [isAwayFromUploadPage, setIsAwayFromUploadPage] = useState(false);

  useEffect(() => {
    const isOnUploadPage = location.pathname === uploadPagePath;
    setIsAwayFromUploadPage(!isOnUploadPage);
  }, [location.pathname, uploadPagePath]);

  return {
    isAwayFromUploadPage,
    currentPath: location.pathname,
  };
}
