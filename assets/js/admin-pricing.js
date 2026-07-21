/* Packages & Pricing panel logic — senior side manages à la carte tiers,
   wedding side manages fixed named packages plus its own optional tiers
   (for post-delivery print/photo purchases, separate from the booking
   packages). Called once from admin.js after the admin-role check passes,
   same pattern as initGalleryPanel. */

import {
  listSeniorTiers,
  upsertSeniorTier,
  deleteSeniorTier,
  listWeddingTiers,
  upsertWeddingTier,
  deleteWeddingTier,
  listWeddingPackages,
  upsertWeddingPackage,
  deleteWeddingPackage,
} from './pricing.js?v=1';

function toast(msg) {
  if (window.showToast) window.showToast(msg);
  else alert(msg);
}

function confirmDelete(label) {
  return confirm(`Delete "${label}"? This can't be undone.`);
}

export function initPricingPanel(site) {
  if (site === 'senior') {
    initTierSection({
      listFn: listSeniorTiers,
      upsertFn: upsertSeniorTier,
      deleteFn: deleteSeniorTier,
      listSelector: '.pricing-tier-list',
      addBtnSelector: '.pricing-add-tier-btn',
    });
  }
  if (site === 'wedding') {
    initWeddingPackages();
    initTierSection({
      listFn: listWeddingTiers,
      upsertFn: upsertWeddingTier,
      deleteFn: deleteWeddingTier,
      listSelector: '.pricing-wedding-tier-list',
      addBtnSelector: '.pricing-add-wedding-tier-btn',
    });
  }
}

function initTierSection({ listFn, upsertFn, deleteFn, listSelector, addBtnSelector }) {
  const list = document.querySelector(listSelector);
  const addBtn = document.querySelector(addBtnSelector);
  if (!list) return;

  function tierRowHtml(tier) {
    const id = tier.id || '';
    return `
      <div class="pricing-row" data-id="${id}">
        <div class="admin-form-row">
          <input type="text" class="tier-label" placeholder="Tier name" value="${tier.label || ''}" />
          <input type="number" class="tier-max-photos" placeholder="Max photos (blank = full gallery)" value="${tier.max_photos ?? ''}" min="1" />
          <input type="number" class="tier-price" placeholder="Price ($)" value="${tier.price ?? ''}" min="0" step="0.01" />
          <input type="number" class="tier-sort" placeholder="Order" value="${tier.sort_order ?? 0}" style="max-width:5rem;" />
        </div>
        <label class="pricing-field-label">Description (optional, shown to clients)</label>
        <textarea class="tier-description" rows="2" placeholder="e.g. Full resolution, unwatermarked digital downloads">${tier.description || ''}</textarea>
        <div class="admin-form-row">
          <input type="number" class="tier-addon-price" placeholder="Add-on price ($, optional)" value="${tier.addon_price ?? ''}" min="0" step="0.01" />
          <input type="text" class="tier-addon-description" placeholder="What the add-on includes (optional)" value="${tier.addon_description || ''}" />
        </div>
        <div class="admin-form-row">
          <button type="button" class="btn btn-admin-primary tier-save-btn">Save</button>
          <button type="button" class="btn btn-outline tier-delete-btn">Delete</button>
        </div>
      </div>`;
  }

  async function render() {
    const { tiers } = await listFn();
    list.innerHTML = tiers.length
      ? tiers.map(tierRowHtml).join('')
      : '<p class="admin-stub-note">No pricing tiers yet — add one below.</p>';
    wireRows();
  }

  function wireRows() {
    list.querySelectorAll('.pricing-row').forEach((row) => {
      const saveBtn = row.querySelector('.tier-save-btn');
      const deleteBtn = row.querySelector('.tier-delete-btn');

      saveBtn.addEventListener('click', async () => {
        const id = row.dataset.id;
        const label = row.querySelector('.tier-label').value.trim();
        const maxPhotosRaw = row.querySelector('.tier-max-photos').value;
        const price = Number(row.querySelector('.tier-price').value);
        const sortOrder = Number(row.querySelector('.tier-sort').value) || 0;
        const description = row.querySelector('.tier-description').value;
        const addonPriceRaw = row.querySelector('.tier-addon-price').value;
        const addonDescription = row.querySelector('.tier-addon-description').value.trim();

        if (!label || Number.isNaN(price)) {
          toast('Enter a tier name and price first.');
          return;
        }

        const { error } = await upsertFn({
          ...(id ? { id } : {}),
          label,
          max_photos: maxPhotosRaw ? Number(maxPhotosRaw) : null,
          price,
          sort_order: sortOrder,
          description,
          addon_price: addonPriceRaw ? Number(addonPriceRaw) : null,
          addon_description: addonDescription || null,
        });
        if (error) { toast(`Couldn't save: ${error.message}`); return; }
        toast('Tier saved.');
        await render();
      });

      deleteBtn.addEventListener('click', async () => {
        const id = row.dataset.id;
        if (!id) { row.remove(); return; }
        const label = row.querySelector('.tier-label').value;
        if (!confirmDelete(label)) return;
        const { error } = await deleteFn(id);
        if (error) { toast(`Couldn't delete: ${error.message}`); return; }
        await render();
      });
    });
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      list.insertAdjacentHTML('beforeend', tierRowHtml({ label: '', max_photos: null, price: '', sort_order: list.children.length + 1 }));
      wireRows();
    });
  }

  render();
}

function initWeddingPackages() {
  const list = document.querySelector('.pricing-package-list');
  const addBtn = document.querySelector('.pricing-add-package-btn');
  if (!list) return;

  function packageRowHtml(pkg) {
    const id = pkg.id || '';
    return `
      <div class="pricing-row pricing-row--package" data-id="${id}">
        <div class="admin-form-row">
          <input type="text" class="pkg-title" placeholder="Package name" value="${pkg.title || ''}" />
          <input type="number" class="pkg-price" placeholder="Price ($)" value="${pkg.price ?? ''}" min="0" step="0.01" />
          <input type="number" class="pkg-sort" placeholder="Order" value="${pkg.sort_order ?? 0}" style="max-width:5rem;" />
        </div>
        <label class="pricing-field-label">What's included (one line per bullet point)</label>
        <textarea class="pkg-description" rows="3" placeholder="1 photographer for 5 hours&#10;Coverage of ceremony, in-between shots, and reception&#10;Up to 150 edited photos">${pkg.description || ''}</textarea>
        <div class="admin-form-row">
          <input type="number" class="pkg-addon-price" placeholder="Add-on price ($, optional)" value="${pkg.addon_price ?? ''}" min="0" step="0.01" />
          <input type="text" class="pkg-addon-description" placeholder="What the add-on includes (optional)" value="${pkg.addon_description || ''}" />
        </div>
        <div class="admin-form-row">
          <button type="button" class="btn btn-admin-primary pkg-save-btn">Save</button>
          <button type="button" class="btn btn-outline pkg-delete-btn">Delete</button>
        </div>
      </div>`;
  }

  async function render() {
    const { packages } = await listWeddingPackages();
    list.innerHTML = packages.length
      ? packages.map(packageRowHtml).join('')
      : '<p class="admin-stub-note">No packages yet — add one below.</p>';
    wireRows();
  }

  function wireRows() {
    list.querySelectorAll('.pricing-row--package').forEach((row) => {
      const saveBtn = row.querySelector('.pkg-save-btn');
      const deleteBtn = row.querySelector('.pkg-delete-btn');

      saveBtn.addEventListener('click', async () => {
        const id = row.dataset.id;
        const title = row.querySelector('.pkg-title').value.trim();
        const price = Number(row.querySelector('.pkg-price').value);
        const sortOrder = Number(row.querySelector('.pkg-sort').value) || 0;
        const description = row.querySelector('.pkg-description').value;
        const addonPriceRaw = row.querySelector('.pkg-addon-price').value;
        const addonDescription = row.querySelector('.pkg-addon-description').value.trim();

        if (!title || Number.isNaN(price)) {
          toast('Enter a package name and price first.');
          return;
        }

        const { error } = await upsertWeddingPackage({
          ...(id ? { id } : {}),
          title,
          price,
          description,
          sort_order: sortOrder,
          addon_price: addonPriceRaw ? Number(addonPriceRaw) : null,
          addon_description: addonDescription || null,
        });
        if (error) { toast(`Couldn't save: ${error.message}`); return; }
        toast('Package saved.');
        await render();
      });

      deleteBtn.addEventListener('click', async () => {
        const id = row.dataset.id;
        if (!id) { row.remove(); return; }
        const title = row.querySelector('.pkg-title').value;
        if (!confirmDelete(title)) return;
        const { error } = await deleteWeddingPackage(id);
        if (error) { toast(`Couldn't delete: ${error.message}`); return; }
        await render();
      });
    });
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      list.insertAdjacentHTML('beforeend', packageRowHtml({ title: '', price: '', description: '', sort_order: list.children.length + 1 }));
      wireRows();
    });
  }

  render();
}
