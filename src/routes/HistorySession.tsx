import { Navigate, useParams } from 'react-router-dom';

/**
 * Legacy route — now redirects to the unified `/session/:sessionId` view.
 * Kept so deep links from older builds still resolve.
 */
export function HistorySession() {
  const params = useParams<{ sessionId: string }>();
  if (!params.sessionId) return <Navigate to="/history" replace />;
  return <Navigate to={`/session/${params.sessionId}`} replace />;
}
