import React from 'react';
import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import Sidebar from '@/components/layout/Sidebar';
import SessionMonitor from '@/components/SessionMonitor';
import SessionRestore from '@/components/SessionRestore';

export const metadata: Metadata = {
  title: 'yourworld',
  description: 'A private digital world, just for you.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="sidebar-open">
        {/* Restores Supabase session from localStorage on every page load */}
        <SessionRestore />
        {/* Monitors inactivity and session expiry */}
        <SessionMonitor />
        <Sidebar />
        <main className="appMain">
          {children}
        </main>
      </body>
    </html>
  );
}