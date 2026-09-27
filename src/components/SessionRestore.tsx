'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSettings } from '@/lib/db';
import { applyTheme, saveThemeLocally, type StoredTheme } from '@/lib/theme';

/**
 * Once per app load (after login), pull the theme saved in the database
 * so every device shows the same colours, font and size.
 */
export default function SessionRestore() {
  const pathname = usePathname();
  const onAuthPage = pathname.startsWith('/login') || pathname.startsWith('/reset-password');

  useEffect(() => {
    if (onAuthPage) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session || cancelled) return;
      const st = await getSettings().catch(() => null);
      if (!st || cancelled) return;
      const theme: StoredTheme = {
        bg: st.theme_bg ?? undefined,
        accent: st.theme_accent ?? undefined,
        secondary: st.theme_secondary ?? undefined,
        text: st.theme_text ?? undefined,
        font: st.theme_font ?? undefined,
        fontSize: st.theme_font_size ?? undefined,
      };
      if (Object.values(theme).some(Boolean)) {
        applyTheme(theme);
        saveThemeLocally(theme);
      }
    })();
    return () => { cancelled = true; };
  }, [onAuthPage]);

  return null;
}
