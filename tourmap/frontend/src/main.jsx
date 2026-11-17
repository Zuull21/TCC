import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider }          from './context/AuthContext';
import { ToastProvider }         from './components/Toast';
import { NotificationsProvider } from './context/NotificationsContext';
import './index.css';
import './screens.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Já adota o comportamento do React Router 7 (e silencia os avisos no console) */}
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ToastProvider>
          <NotificationsProvider>
            <App />
          </NotificationsProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
