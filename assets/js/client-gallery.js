/* Client-facing gallery viewer — replaces the old fake access-code demo.
   Real Google/Facebook session -> real galleries assigned via
   gallery_members -> real photos (watermarked preview only - clients never
   see un-watermarked originals here) -> real pricing tiers computed from
   whatever the admin configured. Reuses the same selection/pricing UI
   classes (.proof-item, .checkout-bar, .tier-status, etc.) the original
   store.js prototype used, just fed by real data instead of hardcoded
   window.GALLERY_CONFIG. */

import { getSession, signInWithGoogle, signInWithFacebook, signOut, supabase } from './auth.js?v=2';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function decodeBase64Url(value) {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return 'PROOF';
  }
}

function parseMarqueeSettings(storagePath) {
  const filename = (storagePath || '').split('/').pop() || '';
  const markerIndex = filename.lastIndexOf('__wm__');
  if (markerIndex < 0) return null;
  const encoded = filename.slice(markerIndex + 6).replace(/\.jpg$/i, '');
  const [style, size, color, opacity, quality, text] = encoded.split('__');
  if (style !== 'scrolling' || !/^[0-9a-f]{6}$/i.test(color || '')) return null;
  return {
    text: decodeBase64Url(text || ''),
    size: Math.max(14, Math.min(96, Number(size) || 42)),
    color: `#${color}`,
    opacity: Math.max(0.1, Math.min(1, (Number(opacity) || 35) / 100)),
    quality: Number(quality) || 85,
  };
}

function renderMarquee(settings) {
  if (!settings) return '';
  const phrase = `<span>${escapeHtml(settings.text)}</span>`;
  const track = phrase.repeat(8);
  return `<div class="watermark watermark-marquee" style="--wm-color:${settings.color};--wm-font-size:${settings.size}px;--wm-opacity:${settings.opacity}">
    <div class="watermark-marquee-row">${track}</div>
    <div class="watermark-marquee-row">${track}</div>
    <div class="watermark-marquee-row">${track}</div>
  </div>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const config = window.CLIENT_GALLERY_CONFIG;
  if (!config) return;
  const { site } = config;
  const bucket = `${site}-galleries`;
  const tiersTable = site === 'senior' ? 'senior_pricing_tiers' : 'wedding_pricing_tiers';

  const loginGate = document.querySelector('.login-gate');
  const inventory = document.querySelector('.album-inventory');
  const galleryReveal = document.querySelector('.gallery-reveal');
  const albumList = document.querySelector('.album-list');
  const galleryTitleEl = document.querySelector('.gallery-view-title');
  const proofGrid = document.querySelector('.proof-grid');

  const loginGoogleBtn = document.querySelector('.login-google-btn');
  const loginFacebookBtn = document.querySelector('.login-facebook-btn');
  const signOutBtn = document.querySelector('.client-signout-btn');
  const backBtn = document.querySelector('.gallery-back-btn');
  const selectAllBtn = document.querySelector('.select-all-btn');
  const checkoutBar = document.querySelector('.checkout-bar');
  const checkoutSummary = document.querySelector('#checkout-summary');
  const checkoutBtn = document.querySelector('.checkout-btn');
  const tierStatus = document.querySelector('.tier-status');

  function showOnly(target) {
    [loginGate, inventory, galleryReveal].forEach((el) => {
      if (el) el.classList.toggle('gallery-hidden', el !== target);
    });
  }

  if (loginGoogleBtn) loginGoogleBtn.addEventListener('click', signInWithGoogle);
  if (loginFacebookBtn) loginFacebookBtn.addEventListener('click', signInWithFacebook);
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      await signOut();
      window.location.reload();
    });
  }

  const session = await getSession();
  if (!session) {
    showOnly(loginGate);
    return;
  }

  const { data: galleries, error } = await supabase
    .from('galleries')
    .select('*')
    .eq('site', site)
    .order('created_at', { ascending: false });

  showOnly(inventory);

  if (error || !galleries || galleries.length === 0) {
    albumList.innerHTML = '<p class="admin-stub-note">No galleries have been shared with you yet — check back after your session.</p>';
    return;
  }

  albumList.innerHTML = galleries.map((g) => `
    <button type="button" class="album-card" data-gallery-id="${g.id}" data-gallery-title="${g.title}">
      <span class="album-card-title">${g.title}</span>
      ${g.event_date ? `<span class="album-card-date">${g.event_date}</span>` : ''}
    </button>
  `).join('');

  albumList.querySelectorAll('.album-card').forEach((btn) => {
    btn.addEventListener('click', () => openGallery(btn.dataset.galleryId, btn.dataset.galleryTitle));
  });

  if (backBtn) {
    backBtn.addEventListener('click', () => showOnly(inventory));
  }

  async function openGallery(galleryId, title) {
    showOnly(galleryReveal);
    if (galleryTitleEl) galleryTitleEl.textContent = title;
    proofGrid.innerHTML = '<p class="admin-stub-note">Loading photos…</p>';
    if (checkoutBar) checkoutBar.style.display = 'none';

    const { data: photos } = await supabase
      .from('gallery_photos')
      .select('*')
      .eq('gallery_id', galleryId)
      .order('created_at', { ascending: false });

    const withUrls = await Promise.all((photos || []).map(async (p) => {
      const path = p.storage_path_watermarked || p.storage_path_original;
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      return { ...p, url: signed?.signedUrl || null };
    }));

    if (!withUrls.length) {
      proofGrid.innerHTML = '<p class="admin-stub-note">Photos are still being prepared for this gallery — check back soon.</p>';
      return;
    }

    proofGrid.innerHTML = withUrls
      .filter((p) => p.url)
      .map((p) => `
        <div class="proof-item" data-id="${p.id}">
          <img src="${p.url}" alt="" loading="lazy" />
          ${renderMarquee(parseMarqueeSettings(p.storage_path_watermarked))}
          <div class="select-mark">✓</div>
        </div>`)
      .join('');

    const { data: tiers } = await supabase
      .from(tiersTable)
      .select('*')
      .order('sort_order', { ascending: true });

    wireSelection(withUrls.length, tiers || []);
  }

  function wireSelection(totalPhotos, tiers) {
    const selected = new Set();
    const sortedTiers = [...tiers].sort((a, b) => (a.max_photos ?? Infinity) - (b.max_photos ?? Infinity));

    function computePrice(count) {
      if (count === 0) return { label: 'No photos selected yet', price: null };
      if (!sortedTiers.length) return { label: `${count} photo${count > 1 ? 's' : ''} selected`, price: null };
      const match = sortedTiers.find((t) => count <= (t.max_photos ?? Infinity));
      return match ? { label: match.label, price: match.price } : { label: sortedTiers[sortedTiers.length - 1].label, price: sortedTiers[sortedTiers.length - 1].price };
    }

    function refresh() {
      const count = selected.size;
      const { label, price } = computePrice(count);

      if (tierStatus) {
        tierStatus.innerHTML = count === 0
          ? 'No photos selected yet'
          : `<strong>${count} selected</strong> — ${label}${price != null ? `: <strong>$${price}</strong>` : ''}`;
      }
      if (checkoutBar) checkoutBar.style.display = count > 0 ? 'flex' : 'none';
      if (checkoutSummary) {
        checkoutSummary.textContent = count === 0
          ? 'Select photos above'
          : `${count} photo${count > 1 ? 's' : ''} selected${price != null ? ` — $${price}` : ''}`;
      }
      if (selectAllBtn) selectAllBtn.textContent = count === totalPhotos ? 'Clear Selection' : 'Select All';
    }

    document.querySelectorAll('.proof-item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        if (selected.has(id)) { selected.delete(id); item.classList.remove('is-selected'); }
        else { selected.add(id); item.classList.add('is-selected'); }
        refresh();
      });
    });

    if (selectAllBtn) {
      selectAllBtn.onclick = () => {
        const shouldSelectAll = selected.size !== totalPhotos;
        document.querySelectorAll('.proof-item').forEach((item) => {
          const id = item.dataset.id;
          if (shouldSelectAll) { selected.add(id); item.classList.add('is-selected'); }
          else { selected.delete(id); item.classList.remove('is-selected'); }
        });
        refresh();
      };
    }

    if (checkoutBtn) {
      checkoutBtn.onclick = () => {
        const { label, price } = computePrice(selected.size);
        const message = `Demo checkout — ${selected.size} photo(s), ${label}${price != null ? `, $${price}` : ''}. Connect a payment processor to go live.`;
        if (window.showToast) window.showToast(message);
        else alert(message);
      };
    }

    refresh();
  }
});
