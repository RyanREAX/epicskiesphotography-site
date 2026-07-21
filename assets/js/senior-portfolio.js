/* Builds the complete migrated RyanREAX senior portrait portfolio.
   Separate thumbnails keep the grid fast; full-size optimized files load
   only when a visitor opens the lightbox. */

document.addEventListener('DOMContentLoaded', () => {
  const gallery = document.querySelector('[data-senior-portfolio]');
  if (!gallery) return;

  gallery.innerHTML = Array.from({ length: 48 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const filename = `pittsburgh-senior-portrait-${number}.webp`;
    return `
      <div class="gallery-item" data-category="all" data-caption="" data-full="../assets/img/senior-portfolio/full/${filename}">
        <img src="../assets/img/senior-portfolio/thumbs/${filename}" alt="Professional Pittsburgh senior portrait by EpicSkiesPhotography, image ${index + 1}" loading="lazy" decoding="async" />
      </div>`;
  }).join('');
});
