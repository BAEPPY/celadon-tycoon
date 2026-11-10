// A finished work's picture is kept as WebP (or PNG) with a see-through background. Internet Explorer 11, which
// PowerPoint 2016/2019 use for add-ins, cannot draw WebP, so the old-engine board asks for the same picture as JPEG
// on the colour of its picture frame. Nothing is stored; the picture is converted when it is asked for.
export const PICTURE_BACKGROUND = '#f5f1e6';
const PREVIEW = /^data:image\/(png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

// Returns a JPEG data URL, or null when the picture cannot be read (or the image library is not available).
export async function previewAsJpeg(preview, {load = () => import('sharp')} = {}) {
  const match = typeof preview === 'string' ? preview.match(PREVIEW) : null;
  if (!match || match[2].length > 410000) return null;
  try {
    const sharp = (await load()).default;
    // The stored pictures are at most 480x360; the pixel limit refuses anything built to exhaust memory.
    const data = await sharp(Buffer.from(match[2], 'base64'), {limitInputPixels: 2_000_000})
      .flatten({background: PICTURE_BACKGROUND}).jpeg({quality: 82}).toBuffer();
    return `data:image/jpeg;base64,${data.toString('base64')}`;
  } catch { return null; }
}
