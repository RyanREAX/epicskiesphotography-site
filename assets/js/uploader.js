/* Gallery creation + sequential photo upload — shared by both admin panels.

   Files are uploaded ONE AT A TIME (for...of + await, never Promise.all)
   so that a failure or timeout on file N never touches files 1..N-1 that
   already succeeded — each file's Storage upload + gallery_photos row is
   committed independently, and only the failed file needs retrying. */

import { supabase } from './auth.js?v=2';

const VALID_SITES = new Set(['senior', 'wedding']);

function validateSite(site) {
  if (!VALID_SITES.has(site)) throw new Error('Invalid admin site category.');
  return site;
}

function validateSiteBucket(site, bucket) {
  validateSite(site);
  if (bucket !== `${site}-galleries`) throw new Error('Gallery storage does not match this admin site.');
}

async function galleryBelongsToSite(galleryId, site) {
  validateSite(site);
  const { data, error } = await supabase
    .from('galleries')
    .select('id')
    .eq('id', galleryId)
    .eq('site', site)
    .maybeSingle();
  return { allowed: !!data, error };
}

export async function createGallery({ site, title, eventDate }) {
  validateSite(site);
  const { data, error } = await supabase
    .from('galleries')
    .insert({ site, title, event_date: eventDate || null })
    .select()
    .single();
  return { gallery: data, error };
}

export async function listGalleries(site) {
  validateSite(site);
  const { data, error } = await supabase
    .from('galleries')
    .select('*')
    .eq('site', site)
    .order('created_at', { ascending: false });
  return { galleries: data || [], error };
}

/** Photos in a gallery, each with a temporary signed URL for previewing
 * (the bucket is private, so there's no permanent public URL). */
export async function listGalleryPhotosWithUrls(bucket, galleryId, site) {
  validateSiteBucket(site, bucket);
  const ownership = await galleryBelongsToSite(galleryId, site);
  if (ownership.error || !ownership.allowed) {
    return { photos: [], error: ownership.error || { message: `This gallery does not belong to the ${site} site.` } };
  }
  const { data: photos, error } = await supabase
    .from('gallery_photos')
    .select('*')
    .eq('gallery_id', galleryId)
    .order('created_at', { ascending: false });

  if (error || !photos) return { photos: [], error };

  const withUrls = await Promise.all(
    photos.map(async (photo) => {
      const pathToShow = photo.storage_path_watermarked || photo.storage_path_original;
      const { data: signed } = await supabase.storage
        .from(bucket)
        .createSignedUrl(pathToShow, 3600);
      return { ...photo, url: signed?.signedUrl || null, isWatermarked: !!photo.storage_path_watermarked };
    })
  );

  return { photos: withUrls, error: null };
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('The browser could not create the customer preview.')),
      'image/jpeg',
      quality
    );
  });
}

async function drawTextWatermark(context, width, height, watermark) {
  const size = clamp(watermark.fontSize, 14, 96, 42);
  const opacity = clamp(watermark.opacity, 0.1, 1, 0.35);
  const text = String(watermark.text || 'EpicSkiesPhotography — PROOF').slice(0, 120);
  const angle = watermark.style === 'tiled' ? -20 : -30;
  const spacingY = watermark.style === 'tiled' ? Math.max(110, size * 3.2) : Math.max(170, size * 4.5);

  await document.fonts.load(`700 ${size}px Jost`).catch(() => {});
  context.font = `700 ${size}px Jost, Arial, sans-serif`;
  context.textBaseline = 'middle';
  const spacingX = Math.max(280, context.measureText(text).width + 100);

  for (let y = -spacingY; y < height + spacingY; y += spacingY) {
    for (let x = -spacingX; x < width + spacingX; x += spacingX) {
      context.save();
      context.translate(x, y);
      context.rotate(angle * Math.PI / 180);
      context.globalAlpha = opacity;
      context.lineWidth = Math.max(1, size / 28);
      context.strokeStyle = '#000000';
      context.fillStyle = /^#[0-9a-f]{6}$/i.test(watermark.fontColor || '') ? watermark.fontColor : '#ffffff';
      context.strokeText(text, 0, 0);
      context.fillText(text, 0, 0);
      context.restore();
    }
  }
}

async function drawImageWatermark(context, width, height, watermarkBlob, watermark) {
  const logo = await createImageBitmap(watermarkBlob);
  const opacity = clamp(watermark.opacity, 0.1, 1, 0.35);
  const logoWidth = watermark.style === 'tiled' ? 110 : watermark.style === 'scrolling' ? 140 : 170;
  const logoHeight = logo.height * (logoWidth / logo.width);
  const gap = watermark.style === 'tiled' ? 140 : watermark.style === 'scrolling' ? 170 : 220;
  const angle = watermark.style === 'scrolling' ? 0 : watermark.style === 'tiled' ? -20 : -30;

  for (let y = -logoHeight; y < height + logoHeight; y += logoHeight + gap) {
    for (let x = -logoWidth; x < width + logoWidth; x += logoWidth + gap) {
      context.save();
      context.translate(x + logoWidth / 2, y + logoHeight / 2);
      context.rotate(angle * Math.PI / 180);
      context.globalAlpha = opacity;
      context.drawImage(logo, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
      context.restore();
    }
  }
  logo.close();
}

/** Creates and stores the customer preview entirely in the admin browser.
 * The full-resolution original remains untouched in private Storage. */
export async function requestWatermark({ bucket, site, photoId, originalPath, watermark }) {
  validateSiteBucket(site, bucket);
  if (watermark.watermarkImagePath && !watermark.watermarkImagePath.startsWith(`${site}/`)) {
    throw new Error(`That watermark belongs to the other admin site.`);
  }
  const { data: scopedPhoto, error: scopedPhotoError } = await supabase
    .from('gallery_photos')
    .select('id, galleries!inner(site)')
    .eq('id', photoId)
    .eq('galleries.site', site)
    .maybeSingle();
  if (scopedPhotoError) throw scopedPhotoError;
  if (!scopedPhoto) throw new Error(`This photo does not belong to the ${site} site.`);
  const { data: originalFile, error: downloadError } = await supabase.storage.from(bucket).download(originalPath);
  if (downloadError) throw downloadError;

  const original = await createImageBitmap(originalFile);
  const requestedLongEdge = clamp(watermark.maxPreviewDimension, 480, 2400, 1600);
  const scale = Math.min(1, requestedLongEdge / Math.max(original.width, original.height));
  const width = Math.max(200, Math.round(original.width * scale));
  const height = Math.max(200, Math.round(original.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(original, 0, 0, width, height);
  original.close();

  const enabled = watermark.enabled !== false;
  if (enabled && watermark.watermarkImagePath) {
    const { data: watermarkFile, error: watermarkError } = await supabase.storage
      .from('watermark-assets')
      .download(watermark.watermarkImagePath);
    if (watermarkError) throw watermarkError;
    await drawImageWatermark(context, width, height, watermarkFile, watermark);
  } else if (enabled && watermark.style !== 'scrolling') {
    await drawTextWatermark(context, width, height, watermark);
  }

  const quality = clamp(watermark.jpegQuality, 45, 95, 85);
  const preview = await canvasToJpeg(canvas, quality / 100);
  const renderedText = String(watermark.text || 'EpicSkiesPhotography — PROOF').slice(0, 120);
  const color = /^#[0-9a-f]{6}$/i.test(watermark.fontColor || '') ? watermark.fontColor.slice(1).toLowerCase() : 'ffffff';
  const opacity = Math.round(clamp(watermark.opacity, 0.1, 1, 0.35) * 100);
  const fontSize = Math.round(clamp(watermark.fontSize, 14, 96, 42));
  const style = ['diagonal', 'tiled', 'scrolling'].includes(watermark.style) ? watermark.style : 'diagonal';
  const metadata = enabled && !watermark.watermarkImagePath
    ? `__wm__${style}__${fontSize}__${color}__${opacity}__${quality}__${btoa(unescape(encodeURIComponent(renderedText))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
    : '';
  const pathBase = originalPath.replace('/originals/', '/watermarked/').replace(/\.[^./]+$/, '');
  const previewPath = `${pathBase}${metadata}.jpg`;

  const { data: existing } = await supabase
    .from('gallery_photos')
    .select('storage_path_watermarked')
    .eq('id', photoId)
    .maybeSingle();
  const { error: uploadError } = await supabase.storage.from(bucket).upload(previewPath, preview, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { error: updateError } = await supabase
    .from('gallery_photos')
    .update({ storage_path_watermarked: previewPath })
    .eq('id', photoId);
  if (updateError) {
    await supabase.storage.from(bucket).remove([previewPath]);
    throw updateError;
  }

  const oldPath = existing?.storage_path_watermarked;
  if (oldPath && oldPath !== previewPath) await supabase.storage.from(bucket).remove([oldPath]);
}

/**
 * Uploads a FileList/array sequentially into `{bucket}/{galleryId}/originals/`,
 * inserting one gallery_photos row per successful upload, and — if
 * `watermark` is provided — calling the watermark function for that same
 * file before moving to the next one (still fully sequential end-to-end).
 *
 * onFileStart/onFileSuccess/onFileError(file, index) let the caller render
 * independent per-file progress/retry UI instead of one big spinner.
 */
export async function uploadPhotosSequentially({ bucket, site, galleryId, files, watermark, onFileStart, onFileSuccess, onFileError }) {
  validateSiteBucket(site, bucket);
  const ownership = await galleryBelongsToSite(galleryId, site);
  if (ownership.error) throw ownership.error;
  if (!ownership.allowed) throw new Error(`This gallery does not belong to the ${site} site.`);
  const fileArray = Array.from(files);

  for (let i = 0; i < fileArray.length; i += 1) {
    const file = fileArray[i];
    if (onFileStart) onFileStart(file, i);

    try {
      const path = `${galleryId}/originals/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: photoRow, error: rowError } = await supabase
        .from('gallery_photos')
        .insert({ gallery_id: galleryId, storage_path_original: path })
        .select()
        .single();
      if (rowError) throw rowError;

      if (watermark) {
        await requestWatermark({ bucket, site, photoId: photoRow.id, originalPath: path, watermark });
      }

      if (onFileSuccess) onFileSuccess(file, i);
    } catch (error) {
      if (onFileError) onFileError(file, i, error);
    }
  }
}

/** Uploads a reference watermark image (e.g. a logo) into the shared
 * watermark-assets bucket, under a per-site folder. */
export async function uploadWatermarkImage(site, file) {
  validateSite(site);
  const path = `${site}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from('watermark-assets').upload(path, file, { upsert: false });
  return { path, error };
}

/** Lists previously uploaded watermark images for a site, with signed
 * preview URLs (bucket is private). */
export async function listWatermarkImages(site) {
  validateSite(site);
  const { data: files, error } = await supabase.storage.from('watermark-assets').list(site, {
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error || !files) return { images: [], error };

  const withUrls = await Promise.all(
    files.map(async (f) => {
      const path = `${site}/${f.name}`;
      const { data: signed } = await supabase.storage.from('watermark-assets').createSignedUrl(path, 3600);
      return { name: f.name, path, url: signed?.signedUrl || null };
    })
  );
  return { images: withUrls, error: null };
}

/** Deletes one or more gallery photos - removes both the original and
 * watermarked Storage objects (if any) plus the gallery_photos row(s).
 * Caller is responsible for confirming with the user first. */
export async function deleteGalleryPhotos(bucket, photos, site) {
  validateSiteBucket(site, bucket);
  const ids = photos.map((p) => p.id);
  if (!ids.length) return { error: null, deletedCount: 0 };
  const { data: scopedPhotos, error: scopeError } = await supabase
    .from('gallery_photos')
    .select('id, galleries!inner(site)')
    .in('id', ids)
    .eq('galleries.site', site);
  if (scopeError) return { error: scopeError };
  if (!scopedPhotos || scopedPhotos.length !== ids.length) {
    return { error: { message: `One or more selected photos do not belong to the ${site} site.` } };
  }
  const paths = photos.flatMap((photo) =>
    [photo.storage_path_original, photo.storage_path_watermarked].filter(Boolean)
  );
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(bucket).remove(paths);
    if (storageError) return { error: storageError };
  }
  const { data, error } = await supabase
    .from('gallery_photos')
    .delete()
    .in('id', ids)
    .select('id');
  if (error) return { error };
  if (!data || data.length !== ids.length) {
    return { error: { message: 'Supabase denied the photo delete. Apply migration 0010, then try again.' } };
  }
  return { error: null, deletedCount: data.length };
}

/** Deletes an entire gallery: every photo's Storage objects (original +
 * watermarked), then the gallery row itself (gallery_photos and
 * gallery_members rows cascade automatically via their foreign keys).
 * Caller is responsible for confirming with the user first. */
export async function deleteGallery(bucket, galleryId, site) {
  validateSiteBucket(site, bucket);
  const ownership = await galleryBelongsToSite(galleryId, site);
  if (ownership.error) return { error: ownership.error };
  if (!ownership.allowed) return { error: { message: `This gallery does not belong to the ${site} site.` } };
  const { data: photos, error: photosError } = await supabase
    .from('gallery_photos')
    .select('storage_path_original, storage_path_watermarked')
    .eq('gallery_id', galleryId);
  if (photosError) return { error: photosError };
  const paths = (photos || []).flatMap((photo) =>
    [photo.storage_path_original, photo.storage_path_watermarked].filter(Boolean)
  );
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(bucket).remove(paths);
    if (storageError) return { error: storageError };
  }
  const { data, error } = await supabase
    .from('galleries')
    .delete()
    .eq('id', galleryId)
    .select('id');
  if (error) return { error };
  if (!data || data.length !== 1) {
    return { error: { message: 'Supabase denied the gallery delete. Apply migration 0010, then try again.' } };
  }
  return { error: null };
}

/** Looks up a client's account by email (admins can read all profiles,
 * per the profiles RLS policy added for gallery-assignment purposes). */
export async function findProfileByEmail(email) {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email, display_name')
    .ilike('email', email.trim())
    .maybeSingle();
  return { profile: data, error };
}

export async function listProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email, display_name')
    .order('email', { ascending: true });
  return { profiles: data || [], error };
}

export async function listGalleryMembers(galleryId, site) {
  const ownership = await galleryBelongsToSite(galleryId, site);
  if (ownership.error || !ownership.allowed) return { members: [], error: ownership.error || { message: 'Gallery site mismatch.' } };
  const { data, error } = await supabase
    .from('gallery_members')
    .select('user_id, profiles(email, display_name)')
    .eq('gallery_id', galleryId);
  return { members: data || [], error };
}

export async function addGalleryMember(galleryId, userId, site) {
  const ownership = await galleryBelongsToSite(galleryId, site);
  if (ownership.error || !ownership.allowed) return { error: ownership.error || { message: 'Gallery site mismatch.' } };
  const { error } = await supabase.from('gallery_members').insert({ gallery_id: galleryId, user_id: userId });
  return { error };
}

export async function removeGalleryMember(galleryId, userId, site) {
  const ownership = await galleryBelongsToSite(galleryId, site);
  if (ownership.error || !ownership.allowed) return { error: ownership.error || { message: 'Gallery site mismatch.' } };
  const { error } = await supabase.from('gallery_members').delete().eq('gallery_id', galleryId).eq('user_id', userId);
  return { error };
}

/** Retries a single failed file without re-touching any others. */
export async function retryUpload({ bucket, site, galleryId, file, watermark, onSuccess, onError }) {
  try {
    validateSiteBucket(site, bucket);
    const ownership = await galleryBelongsToSite(galleryId, site);
    if (ownership.error) throw ownership.error;
    if (!ownership.allowed) throw new Error(`This gallery does not belong to the ${site} site.`);
    const path = `${galleryId}/originals/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
    if (uploadError) throw uploadError;

    const { data: photoRow, error: rowError } = await supabase
      .from('gallery_photos')
      .insert({ gallery_id: galleryId, storage_path_original: path })
      .select()
      .single();
    if (rowError) throw rowError;

    if (watermark) {
      await requestWatermark({ bucket, site, photoId: photoRow.id, originalPath: path, watermark });
    }

    if (onSuccess) onSuccess(file);
  } catch (error) {
    if (onError) onError(file, error);
  }
}
