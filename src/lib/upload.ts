import { supabase } from './supabase';

export type ImageFolder = 'library' | 'souls' | 'places' | 'gallery';

/**
 * Uploads an image file to Supabase Storage under the authenticated user's folder.
 * Returns a signed URL valid for 1 year (effectively permanent for a personal app).
 */
export async function uploadImage(file: File, folder: ImageFolder): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${user.id}/${folder}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('yourworld')
    .upload(path, file, { upsert: false });

  if (uploadError) throw uploadError;

  const { data } = await supabase.storage
    .from('yourworld')
    .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

  if (!data?.signedUrl) throw new Error('Could not get signed URL');
  return data.signedUrl;
}

/**
 * Deletes an image from Supabase Storage given its signed URL.
 * Silently no-ops if the URL format is unrecognised.
 */
export async function deleteImage(url: string): Promise<void> {
  // Signed URL path looks like: /object/sign/yourworld/{path}?token=...
  const match = url.match(/\/object\/sign\/yourworld\/(.+?)\?/);
  if (!match) return;
  const path = decodeURIComponent(match[1]);
  await supabase.storage.from('yourworld').remove([path]);
}