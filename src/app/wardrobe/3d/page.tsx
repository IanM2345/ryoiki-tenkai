// The 3D view now lives in the wardrobe itself (Dress up, then 3D), wearing the outfit she's putting together.
import { redirect } from 'next/navigation';

export default function Wardrobe3DPage() {
  redirect('/wardrobe?view=3d');
}
