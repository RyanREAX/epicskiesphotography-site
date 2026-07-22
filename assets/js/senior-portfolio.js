/* Builds the complete migrated RyanREAX senior portrait portfolio.
   Separate thumbnails keep the grid fast; full-size optimized files load
   only when a visitor opens the lightbox. */

import { supabase } from './auth.js?v=2';

document.addEventListener('DOMContentLoaded', async () => {
  const gallery = document.querySelector('[data-senior-portfolio]');
  if (!gallery) return;

  const { data: managed } = await supabase.storage.from('portfolio-assets').list('senior/full', { limit: 500, sortBy: { column: 'name', order: 'asc' } });
  const files = managed?.length
    ? managed.map((file) => ({
        full: supabase.storage.from('portfolio-assets').getPublicUrl(`senior/full/${file.name}`).data.publicUrl,
        thumb: supabase.storage.from('portfolio-assets').getPublicUrl(`senior/thumbs/${file.name}`).data.publicUrl,
      }))
    : Array.from({ length: 48 }, (_, index) => {
        const number = String(index + 1).padStart(2, '0');
        const filename = `pittsburgh-senior-portrait-${number}.webp`;
        return { full: `../assets/img/senior-portfolio/full/${filename}`, thumb: `../assets/img/senior-portfolio/thumbs/${filename}` };
      });

  gallery.innerHTML = files.map((file, index) => {
    return `
      <div class="gallery-item" data-category="all" data-caption="" data-full="${file.full}">
        <img src="${file.thumb}" alt="Professional Pittsburgh senior portrait by EpicSkiesPhotography" loading="lazy" decoding="async" />
      </div>`;
  }).join('');
  document.dispatchEvent(new CustomEvent('portfolio:ready'));
});
