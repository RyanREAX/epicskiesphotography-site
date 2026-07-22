/* Admin panel shell logic — shared by /adminsenior and /adminwedding.
   Per-page identity comes from window.ADMIN_CONFIG.site, same pattern as
   window.GALLERY_CONFIG on the client gallery pages. */

import { getSession, signInWithGoogle, signInWithFacebook, signOut, supabase } from './auth.js?v=1';
import {
  createGallery,
  listGalleries,
  uploadPhotosSequentially,
  retryUpload,
  listGalleryPhotosWithUrls,
  uploadWatermarkImage,
  listWatermarkImages,
  deleteGalleryPhotos,
  requestWatermark,
  deleteGallery,
  findProfileByEmail,
  listProfiles,
  listGalleryMembers,
  addGalleryMember,
  removeGalleryMember,
} from './uploader.js?v=7';
import { initPricingPanel } from './admin-pricing.js?v=1';

document.addEventListener('DOMContentLoaded', async () => {
  const config = window.ADMIN_CONFIG;
  if (!config) return;

  const gate = document.querySelector('.admin-gate');
  const denied = document.querySelector('.admin-denied');
  const dashboard = document.querySelector('.admin-dashboard');
  const userEmailEl = document.querySelector('.admin-user-email');
  const signOutBtn = document.querySelector('.admin-signout-btn');
  const gateGoogleBtn = document.querySelector('.admin-gate-google');
  const gateFacebookBtn = document.querySelector('.admin-gate-facebook');

  function showOnly(target) {
    [gate, denied, dashboard].forEach((section) => {
      if (section) section.classList.toggle('is-hidden', section !== target);
    });
  }

  if (gateGoogleBtn) gateGoogleBtn.addEventListener('click', signInWithGoogle);
  if (gateFacebookBtn) gateFacebookBtn.addEventListener('click', signInWithFacebook);
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      await signOut();
      window.location.reload();
    });
  }

  const session = await getSession();
  if (!session) {
    showOnly(gate);
    return;
  }

  const { data: roles, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('site', config.site)
    .eq('role', 'admin');

  const isAdmin = !error && roles && roles.length > 0;

  if (!isAdmin) {
    showOnly(denied);
    return;
  }

  if (userEmailEl) userEmailEl.textContent = session.user.email;
  showOnly(dashboard);

  const navButtons = Array.from(document.querySelectorAll('.admin-nav-btn'));
  const panels = Array.from(document.querySelectorAll('.admin-panel'));

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      navButtons.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const target = btn.dataset.panel;
      panels.forEach((panel) => {
        panel.classList.toggle('is-hidden', panel.dataset.panel !== target);
      });
    });
  });

  initGalleryPanel(config.site);
  initPricingPanel(config.site);
});

function initGalleryPanel(site) {
  const bucket = `${site}-galleries`;
  const titleInput = document.querySelector('.gallery-title-input');
  const dateInput = document.querySelector('.gallery-date-input');
  const createBtn = document.querySelector('.gallery-create-btn');
  const gallerySelect = document.querySelector('.gallery-select');
  const fileInput = document.querySelector('.gallery-file-input');
  const uploadBtn = document.querySelector('.gallery-upload-btn');
  const progressList = document.querySelector('.upload-progress-list');
  const photoGrid = document.querySelector('.gallery-photo-grid');
  const watermarkToggle = document.querySelector('.watermark-toggle');
  const watermarkOptions = document.querySelectorAll('.watermark-options');
  const watermarkStyle = document.querySelector('.watermark-style');
  const watermarkResolution = document.querySelector('.watermark-resolution');
  const watermarkQuality = document.querySelector('.watermark-quality');
  const watermarkText = document.querySelector('.watermark-text');
  const watermarkFontSize = document.querySelector('.watermark-font-size');
  const watermarkFontColor = document.querySelector('.watermark-font-color');
  const watermarkOpacity = document.querySelector('.watermark-opacity');
  const watermarkImageSelect = document.querySelector('.watermark-image-select');
  const watermarkImageFile = document.querySelector('.watermark-image-file');
  const watermarkImageUploadBtn = document.querySelector('.watermark-image-upload-btn');
  const watermarkPreviewBtn = document.querySelector('.watermark-preview-btn');
  const deleteSelectedBtn = document.querySelector('.gallery-delete-selected-btn');
  const watermarkSelectedBtn = document.querySelector('.gallery-watermark-selected-btn');
  const filterAlbumSelect = document.querySelector('.gallery-filter-album-select');
  const filterAlbumBtn = document.querySelector('.gallery-filter-album-btn');
  const deleteGalleryBtn = document.querySelector('.gallery-delete-btn');
  const memberEmailInput = document.querySelector('.gallery-member-email');
  const memberSelect = document.querySelector('.gallery-member-select');
  const memberAddBtn = document.querySelector('.gallery-member-add-btn');
  const memberList = document.querySelector('.gallery-member-list');
  const galleryFileNameEl = document.querySelector('.gallery-file-name');
  const watermarkFileNameEl = document.querySelector('.watermark-file-name');

  if (!gallerySelect) return; // panel not on this page

  async function loadRegisteredUsers() {
    if (!memberSelect) return;
    const { profiles, error } = await listProfiles();
    if (error) {
      memberSelect.innerHTML = '<option value="">Could not load registered users</option>';
      return;
    }
    memberSelect.innerHTML = '<option value="">Select a registered user…</option>';
    profiles.forEach((profile) => {
      const option = document.createElement('option');
      option.value = profile.user_id;
      option.dataset.email = profile.email || '';
      option.textContent = profile.display_name
        ? `${profile.display_name} — ${profile.email || 'No email'}`
        : (profile.email || profile.user_id);
      memberSelect.appendChild(option);
    });
  }

  loadRegisteredUsers();

  if (fileInput && galleryFileNameEl) {
    fileInput.addEventListener('change', () => {
      galleryFileNameEl.textContent = fileInput.files.length
        ? `${fileInput.files.length} file${fileInput.files.length > 1 ? 's' : ''} selected`
        : 'No files selected';
    });
  }

  if (watermarkImageFile && watermarkFileNameEl) {
    watermarkImageFile.addEventListener('change', () => {
      watermarkFileNameEl.textContent = watermarkImageFile.files.length ? watermarkImageFile.files[0].name : 'No file selected';
    });
  }

  async function renderMembers() {
    if (!memberList) return;
    const galleryId = gallerySelect.value;
    if (!galleryId) { memberList.innerHTML = ''; return; }
    const { members } = await listGalleryMembers(galleryId, site);
    memberList.innerHTML = members.length
      ? members.map((m) => `
          <div class="pricing-row" style="padding:0.7rem 1rem;">
            <div class="admin-form-row" style="margin:0;">
              <span>${m.profiles?.email || m.user_id}</span>
              <button type="button" class="btn btn-outline gallery-member-remove-btn" data-user-id="${m.user_id}">Remove</button>
            </div>
          </div>`).join('')
      : '<p class="admin-stub-note">No one has access to this gallery yet.</p>';

    memberList.querySelectorAll('.gallery-member-remove-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this client\'s access to the gallery?')) return;
        const { error } = await removeGalleryMember(galleryId, btn.dataset.userId, site);
        if (error) { window.showToast ? window.showToast(`Couldn't remove: ${error.message}`) : alert(error.message); return; }
        await renderMembers();
      });
    });
  }

  if (memberAddBtn) {
    memberAddBtn.addEventListener('click', async () => {
      const galleryId = gallerySelect.value;
      const selectedOption = memberSelect && memberSelect.selectedIndex >= 0
        ? memberSelect.options[memberSelect.selectedIndex]
        : null;
      const selectedUserId = memberSelect ? memberSelect.value : '';
      const email = (memberEmailInput.value || selectedOption?.dataset.email || '').trim();
      if (!galleryId) { window.showToast ? window.showToast('Create or select a gallery first.') : alert('Create or select a gallery first.'); return; }
      if (!selectedUserId && !email) { window.showToast ? window.showToast('Select a registered user or enter an email first.') : alert('Select a registered user or enter an email first.'); return; }

      let userId = selectedUserId;
      if (!userId) {
        const { profile, error: lookupError } = await findProfileByEmail(email);
        if (lookupError) { window.showToast ? window.showToast(`Lookup failed: ${lookupError.message}`) : alert(lookupError.message); return; }
        if (!profile) {
          window.showToast
            ? window.showToast('No account found with that email yet - they need to sign in with Google/Facebook at least once first.')
            : alert('No account found with that email yet - they need to sign in with Google/Facebook at least once first.');
          return;
        }
        userId = profile.user_id;
      }

      const { error } = await addGalleryMember(galleryId, userId, site);
      if (error) { window.showToast ? window.showToast(`Couldn't add: ${error.message}`) : alert(error.message); return; }
      memberEmailInput.value = '';
      if (memberSelect) memberSelect.value = '';
      window.showToast ? window.showToast(`Added ${email} to this gallery.`) : null;
      await renderMembers();
    });
  }

  if (deleteGalleryBtn) {
    deleteGalleryBtn.addEventListener('click', async () => {
      const galleryId = gallerySelect.value;
      if (!galleryId) return;
      const title = gallerySelect.options[gallerySelect.selectedIndex]?.text || 'this gallery';
      if (!confirm(`Delete the entire gallery "${title}" and all its photos? This can't be undone.`)) return;
      const { error } = await deleteGallery(bucket, galleryId, site);
      if (error) { window.showToast ? window.showToast(`Couldn't delete gallery: ${error.message}`) : alert(error.message); return; }
      window.showToast ? window.showToast(`Deleted "${title}".`) : null;
      await refreshGalleries();
    });
  }

  if (watermarkToggle) {
    const syncWatermarkOptions = () => {
      watermarkOptions.forEach((el) => el.classList.toggle('is-hidden', !watermarkToggle.checked));
    };
    watermarkToggle.addEventListener('change', syncWatermarkOptions);
    // Browsers can restore a checkbox's checked state on refresh without
    // firing 'change' - sync once on load so the hidden sections aren't
    // left out of sync with an already-checked box.
    syncWatermarkOptions();
  }

  async function refreshWatermarkImages(selectPath) {
    if (!watermarkImageSelect) return;
    const { images } = await listWatermarkImages(site);
    watermarkImageSelect.innerHTML = '<option value="">Text watermark (no image)</option>'
      + images.map((img) => `<option value="${img.path}">${img.name}</option>`).join('');
    if (selectPath) watermarkImageSelect.value = selectPath;
  }

  if (watermarkImageUploadBtn) {
    watermarkImageUploadBtn.addEventListener('click', async () => {
      const file = watermarkImageFile.files[0];
      if (!file) {
        window.showToast ? window.showToast('Choose a watermark image first.') : alert('Choose a watermark image first.');
        return;
      }
      const { path, error } = await uploadWatermarkImage(site, file);
      if (error) {
        window.showToast ? window.showToast(`Couldn't upload watermark image: ${error.message}`) : alert(error.message);
        return;
      }
      watermarkImageFile.value = '';
      if (watermarkFileNameEl) watermarkFileNameEl.textContent = 'No file selected';
      await refreshWatermarkImages(path);
    });
  }

  if (watermarkPreviewBtn) {
    watermarkPreviewBtn.addEventListener('click', async () => {
      watermarkPreviewBtn.disabled = true;
      const { images, error } = await listWatermarkImages(site);
      watermarkPreviewBtn.disabled = false;
      if (error) {
        window.showToast ? window.showToast(`Couldn't load watermark previews: ${error.message}`) : alert(error.message);
        return;
      }

      const overlay = document.createElement('div');
      const escapeMarkup = (value) => String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
      overlay.className = 'watermark-library-lightbox';
      overlay.innerHTML = `
        <div class="watermark-library-dialog" role="dialog" aria-modal="true" aria-label="Uploaded watermark previews">
          <div class="admin-card-header">
            <h3>Uploaded Watermarks</h3>
            <button type="button" class="watermark-library-close" aria-label="Close watermark previews">×</button>
          </div>
          <div class="watermark-library-grid">
            ${images.length ? images.map((image) => `
              <figure class="watermark-library-item">
                ${image.url ? `<img src="${escapeMarkup(image.url)}" alt="${escapeMarkup(image.name)}" />` : '<div class="watermark-library-missing">Preview unavailable</div>'}
                <figcaption>${escapeMarkup(image.name)}</figcaption>
              </figure>`).join('') : '<p class="admin-stub-note">No watermark images have been uploaded yet.</p>'}
          </div>
        </div>`;
      const close = () => overlay.remove();
      overlay.querySelector('.watermark-library-close').addEventListener('click', close);
      overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
      document.body.appendChild(overlay);
    });
  }

  function getWatermarkConfig() {
    return { ...getWatermarkConfigForce(), enabled: !!(watermarkToggle && watermarkToggle.checked) };
  }

  function getWatermarkConfigForce() {
    return {
      enabled: true,
      style: watermarkStyle.value,
      maxPreviewDimension: Number(watermarkResolution.value),
      jpegQuality: Number(watermarkQuality.value),
      text: watermarkText.value || 'EpicSkiesPhotography — PROOF',
      fontSize: Number(watermarkFontSize.value),
      fontColor: watermarkFontColor.value,
      watermarkImagePath: watermarkImageSelect && watermarkImageSelect.value ? watermarkImageSelect.value : null,
      opacity: Number(watermarkOpacity.value),
    };
  }

  let currentPhotos = [];

  function getCheckedPhotoIds() {
    return Array.from(photoGrid.querySelectorAll('.gallery-photo-check:checked')).map((cb) => cb.value);
  }

  async function deletePhotosByIds(ids) {
    if (!ids.length) return;
    const confirmed = confirm(`Delete ${ids.length} photo${ids.length > 1 ? 's' : ''}? This can't be undone.`);
    if (!confirmed) return;

    const toDelete = currentPhotos.filter((p) => ids.includes(p.id));
    const { error } = await deleteGalleryPhotos(bucket, toDelete, site);
    if (error) {
      window.showToast ? window.showToast(`Couldn't delete: ${error.message}`) : alert(error.message);
      return;
    }
    window.showToast ? window.showToast(`Deleted ${ids.length} photo${ids.length > 1 ? 's' : ''}.`) : null;
    await renderPhotoGrid();
  }

  async function applyWatermarkToPhotos(targets, targetLabel) {
    if (!targets.length) {
      window.showToast ? window.showToast('That album does not contain any photos yet.') : alert('That album does not contain any photos yet.');
      return;
    }
    const watermark = getWatermarkConfigForce();
    const confirmed = confirm(`Apply the current watermark and image-resolution settings to ${targetLabel}? This overwrites existing customer previews. Each photo is processed in this browser one at a time, and progress appears below.`);
    if (!confirmed) return;

    let succeeded = 0;
    let failed = 0;

    for (const photo of targets) {
      const shortName = photo.storage_path_original.split('/').pop();
      const row = addProgressRow({ name: shortName });
      row.textContent = `${shortName} — watermarking…`;
      try {
        await requestWatermark({ bucket, site, photoId: photo.id, originalPath: photo.storage_path_original, watermark });
        succeeded += 1;
        row.textContent = `${shortName} — watermarked ✓`;
        row.classList.add('is-success');
      } catch (err) {
        failed += 1;
        row.textContent = `${shortName} — failed: ${err.message}`;
        row.classList.add('is-error');
      }
    }

    window.showToast
      ? window.showToast(`Watermarked ${succeeded} photo${succeeded === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}.`)
      : null;
    await renderPhotoGrid();
  }

  async function applyWatermarkToIds(ids) {
    if (!ids.length) {
      window.showToast ? window.showToast('Select at least one photo first.') : alert('Select at least one photo first.');
      return;
    }
    const targets = currentPhotos.filter((p) => ids.includes(p.id));
    await applyWatermarkToPhotos(targets, `${targets.length} selected photo${targets.length === 1 ? '' : 's'}`);
  }

  async function renderPhotoGrid() {
    const galleryId = gallerySelect.value;
    if (!photoGrid) return;
    if (!galleryId) {
      photoGrid.innerHTML = '';
      currentPhotos = [];
      return;
    }
    photoGrid.innerHTML = '<p class="admin-stub-note">Loading photos…</p>';
    const { photos } = await listGalleryPhotosWithUrls(bucket, galleryId, site);
    currentPhotos = photos;
    if (!photos.length) {
      photoGrid.innerHTML = '<p class="admin-stub-note">No photos uploaded to this gallery yet.</p>';
      return;
    }
    photoGrid.innerHTML = photos
      .map((p) => (p.url ? `
        <div class="gallery-photo-thumb${p.isWatermarked ? ' is-watermarked' : ''}" title="${p.isWatermarked ? 'Watermarked preview' : 'Original (no watermark)'}">
          <label class="gallery-photo-check-wrap">
            <input type="checkbox" class="gallery-photo-check" value="${p.id}" />
          </label>
          <a href="${p.url}" target="_blank" rel="noopener"><img src="${p.url}" alt="" loading="lazy" /></a>
          <button type="button" class="gallery-photo-delete-btn" data-photo-id="${p.id}" aria-label="Delete photo">✕</button>
        </div>` : ''))
      .join('');

    photoGrid.querySelectorAll('.gallery-photo-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => deletePhotosByIds([btn.dataset.photoId]));
    });
  }

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', () => deletePhotosByIds(getCheckedPhotoIds()));
  }

  if (watermarkSelectedBtn) {
    watermarkSelectedBtn.addEventListener('click', () => applyWatermarkToIds(getCheckedPhotoIds()));
  }

  if (filterAlbumBtn) {
    filterAlbumBtn.addEventListener('click', async () => {
      const galleryId = filterAlbumSelect.value;
      if (!galleryId) {
        window.showToast ? window.showToast('Select an album first.') : alert('Select an album first.');
        return;
      }
      const albumName = filterAlbumSelect.options[filterAlbumSelect.selectedIndex]?.text || 'the selected album';
      filterAlbumBtn.disabled = true;
      try {
        const { photos, error } = await listGalleryPhotosWithUrls(bucket, galleryId, site);
        if (error) throw error;
        await applyWatermarkToPhotos(photos, `all ${photos.length} photos in “${albumName}”`);
      } catch (error) {
        window.showToast ? window.showToast(`Couldn't apply filters: ${error.message}`) : alert(error.message);
      } finally {
        filterAlbumBtn.disabled = false;
      }
    });
  }

  async function refreshGalleries(selectId) {
    const { galleries } = await listGalleries(site);
    gallerySelect.innerHTML = galleries
      .map((g) => `<option value="${g.id}">${g.title}</option>`)
      .join('');
    if (filterAlbumSelect) {
      filterAlbumSelect.innerHTML = galleries
        .map((g) => `<option value="${g.id}">${g.title}</option>`)
        .join('');
    }
    if (selectId) gallerySelect.value = selectId;
    if (filterAlbumSelect) filterAlbumSelect.value = gallerySelect.value;
    await renderPhotoGrid();
    await renderMembers();
  }

  gallerySelect.addEventListener('change', () => {
    if (filterAlbumSelect) filterAlbumSelect.value = gallerySelect.value;
    renderPhotoGrid();
    renderMembers();
  });

  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const title = (titleInput.value || '').trim();
      if (!title) {
        window.showToast ? window.showToast('Enter a gallery title first.') : alert('Enter a gallery title first.');
        return;
      }
      const { gallery, error } = await createGallery({ site, title, eventDate: dateInput.value });
      if (error) {
        window.showToast ? window.showToast(`Couldn't create gallery: ${error.message}`) : alert(error.message);
        return;
      }
      titleInput.value = '';
      dateInput.value = '';
      await refreshGalleries(gallery.id);
    });
  }

  function addProgressRow(file) {
    const li = document.createElement('li');
    li.className = 'upload-row';
    li.textContent = `${file.name} — uploading…`;
    progressList.appendChild(li);
    return li;
  }

  if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
      const galleryId = gallerySelect.value;
      const files = fileInput.files;
      if (!galleryId) {
        window.showToast ? window.showToast('Create or select a gallery first.') : alert('Create or select a gallery first.');
        return;
      }
      if (!files || files.length === 0) return;

      const watermark = getWatermarkConfig();
      const rows = new Map();
      await uploadPhotosSequentially({
        bucket,
        site,
        galleryId,
        files,
        watermark,
        onFileStart: (file) => { rows.set(file, addProgressRow(file)); },
        onFileSuccess: (file) => {
          const row = rows.get(file);
          if (row) { row.textContent = `${file.name} — uploaded ✓${watermark ? ' (watermarking…)' : ''}`; row.classList.add('is-success'); }
        },
        onFileError: (file, index, error) => {
          const row = rows.get(file);
          if (!row) return;
          row.classList.add('is-error');
          row.textContent = `${file.name} — failed: ${error.message} `;
          const retryBtn = document.createElement('button');
          retryBtn.className = 'btn btn-outline upload-retry-btn';
          retryBtn.type = 'button';
          retryBtn.textContent = 'Retry';
          retryBtn.addEventListener('click', () => {
            row.textContent = `${file.name} — uploading…`;
            row.classList.remove('is-error');
            retryUpload({
              bucket,
              site,
              galleryId,
              file,
              watermark,
              onSuccess: () => { row.textContent = `${file.name} — uploaded ✓`; row.classList.add('is-success'); renderPhotoGrid(); },
              onError: (f, err) => {
                row.classList.add('is-error');
                row.textContent = `${file.name} — failed: ${err.message} `;
                row.appendChild(retryBtn);
              },
            });
          });
          row.appendChild(retryBtn);
        },
      });

      fileInput.value = '';
      if (galleryFileNameEl) galleryFileNameEl.textContent = 'No files selected';
      await renderPhotoGrid();
    });
  }

  refreshGalleries();
  refreshWatermarkImages();
}
