import React from 'react';
import type { Metadata, Viewport } from 'next';
import '@fontsource/comic-neue/400.css';
import '@fontsource/comic-neue/700.css';
import '@/styles/globals.css';
import { themeInitScript } from '@/lib/theme';
import Sidebar from '@/components/layout/Sidebar';
import SessionMonitor from '@/components/SessionMonitor';
import SessionRestore from '@/components/SessionRestore';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: 'yourworld',
  description: 'A private digital world, just for you.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0d0a0f',
  viewportFit: 'cover',
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scheme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="sidebar-open">
        <SessionRestore />
        <SessionMonitor />
        <Sidebar />
        <main className="appMain">
          {children}
        </main>
        <Analytics/>
      </body>
    </html>
  );
}