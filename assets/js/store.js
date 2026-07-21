/* Private client gallery: access gate + photo selection + tiered pricing cart
   -----------------------------------------------------------------------
   NOTE — prototype only. Real deployment needs a backend to:
     1) authenticate clients per-gallery (not a single shared code),
     2) serve watermarked previews vs. full-res files by entitlement,
     3) process real payment (e.g. Stripe Checkout) before releasing
        full-resolution downloads.
   The pricing + selection UX below is fully wired and ready to connect
   to that backend once it exists. */

document.addEventListener('DOMContentLoaded', () => {
  const config = window.GALLERY_CONFIG;
  if (!config) return;

  const loginGate = document.querySelector('.login-gate');
  const gallerySection = document.querySelector('.gallery-reveal');
  const loginForm = document.querySelector('.login-form');
  const loginError = document.querySelector('.login-error');

  const proofItems = Array.from(document.querySelectorAll('.proof-item'));
  const totalPhotos = proofItems.length;
  const selected = new Set();

  const tierStatus = document.querySelector('.tier-status');
  const checkoutBar = document.querySelector('.checkout-bar');
  const checkoutSummary = document.querySelector('#checkout-summary');
  const checkoutBtn = document.querySelector('.checkout-btn');
  const selectAllBtn = document.querySelector('.select-all-btn');
  const unlockAllBtn = document.querySelector('.unlock-all-btn');

  function computePrice(count) {
    if (count === 0) return { label: 'No photos selected yet', price: 0 };
    if (totalPhotos > 0 && count === totalPhotos) {
      return { label: 'Full Gallery Unlock', price: config.fullGallery };
    }
    if (count >= 10) return { label: '10-Photo Collection', price: config.tierTen };
    if (count >= 5) return { label: '5-Photo Collection', price: config.tierFive };
    return { label: `${count} photo${count > 1 ? 's' : ''} à la carte`, price: count * config.pricePerPhoto };
  }

  function nextBreakHint(count) {
    if (count === 0 || count >= totalPhotos) return '';
    const toFull = totalPhotos - count;

    if (count < 5) {
      const toFive = 5 - count;
      if (toFull <= toFive) return `Select ${toFull} more for the full-gallery rate ($${config.fullGallery}).`;
      return `Select ${toFive} more to unlock the 5-photo rate ($${config.tierFive}).`;
    }

    if (count < 10) {
      const toTen = 10 - count;
      if (toFull <= toTen) return `Select ${toFull} more for the full-gallery rate ($${config.fullGallery}).`;
      return `Select ${toTen} more to unlock the 10-photo rate ($${config.tierTen}).`;
    }

    return `Select ${toFull} more for the full-gallery rate ($${config.fullGallery}).`;
  }

  function refresh() {
    const count = selected.size;
    const { label, price } = computePrice(count);
    const hint = nextBreakHint(count);

    if (tierStatus) {
      tierStatus.innerHTML = count === 0
        ? 'No photos selected yet'
        : `<strong>${count} selected</strong> — ${label}: <strong>$${price}</strong>${hint ? ` · <span style="opacity:.75">${hint}</span>` : ''}`;
    }

    if (checkoutBar) {
      checkoutBar.style.display = count > 0 ? 'flex' : 'none';
    }

    if (checkoutSummary) {
      checkoutSummary.textContent = count === 0 ? 'Select photos above' : `${count} photo${count > 1 ? 's' : ''} selected — $${price}`;
    }

    if (checkoutBtn) {
      checkoutBtn.textContent = 'Checkout';
    }

    if (selectAllBtn) {
      selectAllBtn.textContent = count === totalPhotos ? 'Clear Selection' : 'Select All';
    }
  }

  proofItems.forEach((item) => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      if (selected.has(id)) {
        selected.delete(id);
        item.classList.remove('is-selected');
      } else {
        selected.add(id);
        item.classList.add('is-selected');
      }
      refresh();
    });
  });

  selectAllBtn && selectAllBtn.addEventListener('click', () => {
    const shouldSelectAll = selected.size !== totalPhotos;
    proofItems.forEach((item) => {
      const id = item.dataset.id;
      if (shouldSelectAll) {
        selected.add(id);
        item.classList.add('is-selected');
      } else {
        selected.delete(id);
        item.classList.remove('is-selected');
      }
    });
    refresh();
  });

  unlockAllBtn && unlockAllBtn.addEventListener('click', () => {
    proofItems.forEach((item) => {
      selected.add(item.dataset.id);
      item.classList.add('is-selected');
    });
    refresh();
    window.scrollTo({ top: gallerySection.offsetTop - 40, behavior: 'smooth' });
  });

  checkoutBtn && checkoutBtn.addEventListener('click', () => {
    const { label, price } = computePrice(selected.size);
    const message = `Demo checkout — ${selected.size} photo(s), ${label}, $${price}. Connect a payment processor to go live.`;
    if (window.showToast) {
      window.showToast(message);
    } else {
      alert(message);
    }
  });

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = loginForm.querySelector('input[name="access-code"]');
      const value = (input.value || '').trim().toUpperCase();
      if (value === config.accessCode.toUpperCase()) {
        loginGate.classList.add('gallery-hidden');
        gallerySection.classList.remove('gallery-hidden');
        loginError.classList.remove('is-visible');
      } else {
        loginError.classList.add('is-visible');
      }
    });
  }

  refresh();
});
