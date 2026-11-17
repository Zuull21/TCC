import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import Spinner     from './components/Spinner';

// Carregadas junto com o app: são a porta de entrada
import Home        from './pages/Home';
import Login       from './pages/Login';

// Demais páginas: baixadas só quando acessadas
const Register    = lazy(() => import('./pages/Register'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const Explore     = lazy(() => import('./pages/Explore'));
const PlaceDetail = lazy(() => import('./pages/PlaceDetail'));
const Feed        = lazy(() => import('./pages/Feed'));
const Terms       = lazy(() => import('./pages/Terms'));
const Privacy     = lazy(() => import('./pages/Privacy'));
const Events      = lazy(() => import('./pages/Events'));
const CreateEvent = lazy(() => import('./pages/CreateEvent'));
const EditEvent   = lazy(() => import('./pages/EditEvent'));
const Profile     = lazy(() => import('./pages/Profile'));
const AIDemo      = lazy(() => import('./pages/AIDemo'));

const pageFallback = (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner dark /></div>
);

export default function App() {
  return (
    <Suspense fallback={pageFallback}>
    <Routes>
      {/* ── Autenticação ─────────────────────────── */}
      <Route path="/login"        element={<Login />} />
      <Route path="/register"     element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* ── Públicas ─────────────────────────────── */}
      <Route path="/"              element={<Home />} />
      <Route path="/explore"       element={<Explore />} />
      <Route path="/places/:id"    element={<PlaceDetail />} />
      <Route path="/feed"          element={<Feed />} />
      <Route path="/terms"         element={<Terms />} />
      <Route path="/privacy"       element={<Privacy />} />

      {/* ── Privadas ─────────────────────────────── */}
      <Route path="/events" element={
        <PrivateRoute><Events /></PrivateRoute>
      } />
      <Route path="/create" element={
        <PrivateRoute><CreateEvent /></PrivateRoute>
      } />
      <Route path="/events/:id/edit" element={
        <PrivateRoute><EditEvent /></PrivateRoute>
      } />
      <Route path="/profile" element={
        <PrivateRoute><Profile /></PrivateRoute>
      } />

      {/* Demonstração dos modelos */}
      <Route path="/ai-demo" element={<AIDemo />} />

      {/* Legado / catch-all */}
      <Route path="/auth"       element={<Navigate to="/login"   replace />} />
      <Route path="/events/new" element={<Navigate to="/create"  replace />} />
      <Route path="*"           element={<Navigate to="/"        replace />} />
    </Routes>
    </Suspense>
  );
}
