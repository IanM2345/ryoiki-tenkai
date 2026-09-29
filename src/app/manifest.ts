import type { MetadataRoute } from 'next';

// Lets the site be added to her home screen and open full screen, like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'yourworld',
    short_name: 'yourworld',
    description: 'A private digital world, just for you.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0d0a0f',
    theme_color: '#0d0a0f',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Write in journal', url: '/journal/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Log a mood', url: '/mood', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Tasks', url: '/tasks', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
