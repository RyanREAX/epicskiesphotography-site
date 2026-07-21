/* Portfolio gallery: category filtering + lightbox slideshow */

function initGallery() {
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
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let pointerMoved = false;
  let pinchDistance = 0;
  let pinchZoom = 1;
  const activePointers = new Map();

  function renderZoom() {
    lightboxImg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    lightboxImg.classList.toggle('is-zoomed', zoom > 1);
  }

  function resetZoom() {
    zoom = 1;
    panX = 0;
    panY = 0;
    renderZoom();
  }

  function zoomAt(clientX, clientY, nextZoom) {
    const previousZoom = zoom;
    const rect = lightboxImg.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    zoom = Math.min(6, Math.max(1, nextZoom));
    const ratio = zoom / previousZoom;
    panX -= (clientX - centerX) * (ratio - 1);
    panY -= (clientY - centerY) * (ratio - 1);
    if (zoom === 1) { panX = 0; panY = 0; }
    renderZoom();
  }

  function openLightbox(index) {
    currentIndex = index;
    const item = visibleItems[currentIndex];
    const full = item.dataset.full || item.querySelector('img').src;
    const caption = item.dataset.caption || '';
    lightboxImg.src = full;
    lightboxImg.alt = caption;
    lightboxCaption.textContent = caption;
    lightboxCaption.hidden = !caption;
    resetZoom();
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

  lightboxImg.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, zoom * (event.deltaY < 0 ? 1.18 : 0.85));
  }, { passive: false });

  lightboxImg.addEventListener('dblclick', resetZoom);
  lightboxImg.addEventListener('pointerdown', (event) => {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pointerMoved = false;
    if (activePointers.size === 2) {
      const points = Array.from(activePointers.values());
      pinchDistance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      pinchZoom = zoom;
      dragging = false;
    } else if (zoom > 1) {
      dragging = true;
    }
    dragStartX = event.clientX - panX;
    dragStartY = event.clientY - panY;
    lightboxImg.setPointerCapture(event.pointerId);
  });
  lightboxImg.addEventListener('pointermove', (event) => {
    if (!activePointers.has(event.pointerId)) return;
    const previous = activePointers.get(event.pointerId);
    if (Math.hypot(event.clientX - previous.x, event.clientY - previous.y) > 3) pointerMoved = true;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.size === 2) {
      const points = Array.from(activePointers.values());
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const middleX = (points[0].x + points[1].x) / 2;
      const middleY = (points[0].y + points[1].y) / 2;
      zoomAt(middleX, middleY, pinchZoom * (distance / pinchDistance));
      return;
    }
    if (!dragging) return;
    panX = event.clientX - dragStartX;
    panY = event.clientY - dragStartY;
    renderZoom();
  });
  lightboxImg.addEventListener('pointerup', (event) => {
    activePointers.delete(event.pointerId);
    if (!pointerMoved && zoom === 1) zoomAt(event.clientX, event.clientY, 2.5);
    dragging = false;
  });
  lightboxImg.addEventListener('pointercancel', (event) => { activePointers.delete(event.pointerId); dragging = false; });

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
}

document.addEventListener('DOMContentLoaded', initGallery);
document.addEventListener('portfolio:ready', initGallery);
