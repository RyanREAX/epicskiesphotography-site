import { supabase } from './auth.js?v=1';

const BUCKET = 'portfolio-assets';
const SITE = window.ADMIN_CONFIG?.site || 'senior';

function canvasBlob(file, maxEdge, quality) {
  return createImageBitmap(file).then((image) => {
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    return new Promise((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Could not resize image.')),
      'image/webp', quality,
    ));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.querySelector('.portfolio-file-input');
  const uploadBtn = document.querySelector('.portfolio-upload-btn');
  const importBtn = document.querySelector('.portfolio-import-btn');
  const nameEl = document.querySelector('.portfolio-file-name');
  const grid = document.querySelector('.portfolio-admin-grid');
  const progress = document.querySelector('.portfolio-progress-list');
  if (!grid) return;

  const publicUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  async function render() {
    const { data: files, error } = await supabase.storage.from(BUCKET).list(`${SITE}/full`, { limit: 500, sortBy: { column: 'name', order: 'asc' } });
    if (error) { grid.innerHTML = `<p class="admin-stub-note">${error.message}</p>`; return; }
    grid.innerHTML = files.length ? files.map((file) => `
      <div class="gallery-photo-thumb">
        <img src="${publicUrl(`${SITE}/thumbs/${file.name}`)}" alt="" loading="lazy" />
        <button type="button" class="gallery-photo-delete-btn portfolio-delete-btn" data-name="${file.name}" aria-label="Delete portfolio photo">×</button>
      </div>`).join('') : '<p class="admin-stub-note">No managed portfolio photos yet. Import the existing portfolio or upload new photographs.</p>';
    grid.querySelectorAll('.portfolio-delete-btn').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('Remove this photograph from the public portfolio?')) return;
      const { error: deleteError } = await supabase.storage.from(BUCKET).remove([`${SITE}/full/${button.dataset.name}`, `${SITE}/thumbs/${button.dataset.name}`]);
      if (deleteError) alert(deleteError.message); else render();
    }));
  }

  async function uploadFiles(files, prefix = Date.now()) {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const row = document.createElement('li');
      row.className = 'upload-row';
      row.textContent = `${file.name} — processing…`;
      progress.appendChild(row);
      try {
        const name = `${String(prefix + index).padStart(14, '0')}-${file.name.replace(/[^a-z0-9.-]+/gi, '-').replace(/\.[^.]+$/, '')}.webp`;
        const [full, thumb] = await Promise.all([canvasBlob(file, 3600, 0.92), canvasBlob(file, 720, 0.8)]);
        let result = await supabase.storage.from(BUCKET).upload(`${SITE}/full/${name}`, full, { contentType: 'image/webp' });
        if (result.error) throw result.error;
        result = await supabase.storage.from(BUCKET).upload(`${SITE}/thumbs/${name}`, thumb, { contentType: 'image/webp' });
        if (result.error) throw result.error;
        row.textContent = `${file.name} — uploaded ✓`;
        row.classList.add('is-success');
      } catch (error) { row.textContent = `${file.name} — failed: ${error.message}`; row.classList.add('is-error'); }
    }
    await render();
  }

  input?.addEventListener('change', () => { nameEl.textContent = `${input.files.length} file${input.files.length === 1 ? '' : 's'} selected`; });
  uploadBtn?.addEventListener('click', () => uploadFiles(Array.from(input.files)));
  importBtn?.addEventListener('click', async () => {
    if (!confirm('Import the existing 48 portfolio photographs into managed storage?')) return;
    importBtn.disabled = true;
    const files = [];
    for (let index = 1; index <= 48; index += 1) {
      const number = String(index).padStart(2, '0');
      const response = await fetch(`../assets/img/senior-portfolio/full/pittsburgh-senior-portrait-${number}.webp`);
      files.push(new File([await response.blob()], `pittsburgh-senior-${number}.webp`, { type: 'image/webp' }));
    }
    await uploadFiles(files, 10000000000000);
    importBtn.disabled = false;
  });
  render();
});
