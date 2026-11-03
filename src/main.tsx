import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './auth';
import GlassFX from './components/GlassFX';
import { ToastProvider } from './components/toast';
import './index.css';
import './glass.css';

const queryClient = new QueryClient({
  // Data stays fresh for a minute, so moving between pages reuses it; older data still shows at once while it refreshes.
  defaultOptions: { queries: { staleTime: 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: true, retry: 1 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlassFX />
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
