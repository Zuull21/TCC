import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Spinner from './Spinner';

export default function PrivateRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Spinner center size="lg" dark />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}
