/* Portfolio gallery: category filtering + lightbox slideshow */

document.addEventListener('DOMContentLoaded', () => {
  const items = Array.from(document.querySelectorAll('.gallery-item'));
  const chips = Array.from(document.querySelectorAll('.filter-chip'));
  const lightbox = document.querySelector('.lightbox');
  if (!lightbox || items.length === 0) return;

  const lightboxImg = lightbox.querySelector('img');
  const lightboxCaption = lightbox.querySelector('figcaption');
  const closeBtn = lightbox.querySelector('.lightbox-close');
  const prevBtn = lightbox.querySelector('.lightbox-prev');
  const nextBtn = lightbox.querySelector('.lightbox-next');

  let visibleItems = items;
  let currentIndex = 0;

  function openLightbox(index) {
    currentIndex = index;
    const item = visibleItems[currentIndex];
    const full = item.dataset.full || item.querySelector('img').src;
    const caption = item.dataset.caption || '';
    lightboxImg.src = full;
    lightboxImg.alt = caption;
    lightboxCaption.textContent = caption;
    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function step(delta) {
    currentIndex = (currentIndex + delta + visibleItems.length) % visibleItems.length;
    openLightbox(currentIndex);
  }

  items.forEach((item, index) => {
    item.addEventListener('click', () => {
      const idx = visibleItems.indexOf(item);
      openLightbox(idx === -1 ? 0 : idx);
    });
  });

  closeBtn && closeBtn.addEventListener('click', closeLightbox);
  prevBtn && prevBtn.addEventListener('click', () => step(-1));
  nextBtn && nextBtn.addEventListener('click', () => step(1));

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });

  if (chips.length) {
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        const filter = chip.dataset.filter;

        items.forEach((item) => {
          const match = filter === 'all' || item.dataset.category === filter;
          item.style.display = match ? '' : 'none';
        });

        visibleItems = items.filter((item) => item.style.display !== 'none');
      });
    });
  }
});
