"use client";

import { useState, useEffect } from 'react';
import { Header, Footer } from '@moya/ui';
import { LogButton, LogPanel, startErrorListener, startPersistence } from '@moya/logger';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    const stopError = startErrorListener();
    const stopPersist = startPersistence();
    return () => { stopError(); stopPersist(); };
  }, []);

  return (
    <div className="min-h-screen bg-rice-100 paper-texture">
      <Header />
      <main className="pt-16 min-h-[calc(100vh-64px)]">
        {children}
      </main>
      <Footer />
      <LogButton onClick={() => setLogOpen((v) => !v)} />
      <LogPanel open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}
