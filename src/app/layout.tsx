import React from 'react';
import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
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
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

const themeScript = `
try {
  var t = JSON.parse(localStorage.getItem('yw-theme') || '{}');
  var r = document.documentElement.style;
  if (t.bg)        { r.setProperty('--bg', t.bg); r.setProperty('--surf', t.bg); r.setProperty('--card', t.bg === '#0d0a0f' ? '#1a1025' : t.bg + 'cc'); }
  if (t.accent)    { r.setProperty('--or', t.accent); r.setProperty('--or-l', t.accent); }
  if (t.secondary) { r.setProperty('--pu-l', t.secondary); }
  if (t.text)      { r.setProperty('--tx', t.text); }
  if (t.font)      { r.setProperty('--font', t.font); }
  if (t.fontSize)  { document.documentElement.style.fontSize = t.fontSize + 'px'; }
} catch(e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
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