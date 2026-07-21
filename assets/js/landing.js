const stage = document.getElementById('splitStage');
const seniorPanel = document.querySelector('.split-panel--senior');
const weddingPanel = document.querySelector('.split-panel--wedding');
const glow = document.querySelector('.seam-glow');

const SWING_ACTIVE = 16; // seam range while actively tracking the cursor: 34%..66%
const SWING_IDLE = 6; // gentler sway while idle: 44%..56%
const IDLE_PERIOD = 8; // seconds per full idle sway cycle
const EASE = 0.055; // per-frame chase factor — lower = slower, more gradual
const MAX_SCALE = 1.15;
const IDLE_MS_OUTSIDE = 1500; // cursor isn't over the stage at all
const IDLE_MS_INSIDE = 2500; // cursor is over the stage but not moving
const TEETH = [0, 6, 0, -6, 0, 6, 0, -6, 0];
const YS = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function seniorPolygon(center) {
  const pts = YS.map((y, i) => `${center + TEETH[i]}% ${y}%`).join(', ');
  return `polygon(0% 0%, ${pts}, 0% 100%)`;
}

function weddingPolygon(center) {
  const pts = YS.map((y, i) => `${center + TEETH[i]}% ${y}%`).join(', ');
  return `polygon(100% 0%, ${pts}, 100% 100%)`;
}

function glowPolygon(center) {
  const half = 2;
  const left = YS.map((y, i) => [center + TEETH[i] - half, y]);
  const right = YS.map((y, i) => [center + TEETH[i] + half, y]).reverse();
  const pts = [...left, ...right].map(([x, y]) => `${x}% ${y}%`).join(', ');
  return `polygon(${pts})`;
}

if (stage && seniorPanel && weddingPanel && glow) {
  const seniorMedia = seniorPanel.querySelector('.split-media');
  const weddingMedia = weddingPanel.querySelector('.split-media');
  const seniorContent = seniorPanel.querySelector('.split-content');
  const weddingContent = weddingPanel.querySelector('.split-content');

  let currentCenter = 50;
  let targetCenter = 50;
  let mode = 'active'; // 'active' while the cursor is driving it, 'idle' while auto-swaying
  let idleStartTime = 0;
  let idlePhase = 0;
  let idleTimer = null;
  let isOverStage = false;

  // Enter idle mode picking up the sway from wherever the seam currently is, continuing
  // in whichever direction it was already heading — no snap back to a fixed start point.
  function startIdle() {
    const ratio = clamp((currentCenter - 50) / SWING_IDLE, -1, 1);
    const baseAngle = Math.asin(ratio);
    const headingRight = targetCenter >= currentCenter;
    idlePhase = headingRight ? baseAngle : Math.PI - baseAngle;
    idleStartTime = performance.now();
    mode = 'idle';
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(startIdle, isOverStage ? IDLE_MS_INSIDE : IDLE_MS_OUTSIDE);
  }

  function render(center) {
    const pull = clamp((center - 50) / SWING_ACTIVE, -1, 1);
    const pullSenior = Math.max(0, -pull);
    const pullWedding = Math.max(0, pull);

    seniorPanel.style.clipPath = seniorPolygon(center);
    weddingPanel.style.clipPath = weddingPolygon(center);
    glow.style.clipPath = glowPolygon(center);
    glow.style.setProperty('--seam-center', `${center}%`);
    glow.style.opacity = String(0.7 + Math.max(pullSenior, pullWedding) * 0.3);

    seniorMedia.style.transform = `scale(${1 + pullSenior * (MAX_SCALE - 1)})`;
    weddingMedia.style.transform = `scale(${1 + pullWedding * (MAX_SCALE - 1)})`;

    seniorContent.style.opacity = String(1 - pullWedding * 0.6);
    seniorContent.style.transform = `translateX(${-pullWedding * 20}px)`;
    weddingContent.style.opacity = String(1 - pullSenior * 0.6);
    weddingContent.style.transform = `translateX(${pullSenior * 20}px)`;

    if (mode === 'idle') {
      // during the auto-sway there must always be a dark side and a bright side —
      // no deadzone, so it never reads as both-bright while auto-marqueeing
      stage.classList.toggle('is-hover-left', center <= 50);
      stage.classList.toggle('is-hover-right', center > 50);
    } else {
      // while actively tracking the cursor, a true center position can leave both bright
      stage.classList.toggle('is-hover-left', center < 48);
      stage.classList.toggle('is-hover-right', center > 52);
    }
  }

  function tick(now) {
    if (mode === 'idle') {
      const elapsed = (now - idleStartTime) / 1000;
      const angle = idlePhase + elapsed * ((2 * Math.PI) / IDLE_PERIOD);
      targetCenter = 50 + SWING_IDLE * Math.sin(angle);
    }
    currentCenter += (targetCenter - currentCenter) * EASE;
    render(currentCenter);
    requestAnimationFrame(tick);
  }

  stage.addEventListener('mouseenter', () => {
    isOverStage = true;
    resetIdleTimer();
  });

  stage.addEventListener('mousemove', (e) => {
    mode = 'active';
    const rect = stage.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const pull = clamp((fraction - 0.5) * 2, -1, 1);
    targetCenter = 50 + pull * SWING_ACTIVE;
    resetIdleTimer();
  });

  stage.addEventListener('mouseleave', () => {
    isOverStage = false;
    mode = 'active';
    targetCenter = 50;
    resetIdleTimer();
  });

  document.addEventListener('mousemove', (e) => {
    if (!stage.contains(e.target)) {
      isOverStage = false;
      resetIdleTimer();
    }
  });

  requestAnimationFrame(tick);
  startIdle();
  resetIdleTimer();
}
