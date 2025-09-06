document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;

  const depth = document.getElementById('depth');
  const blur = document.getElementById('blur');
  const radius = document.getElementById('radius');
  const togglePressed = document.getElementById('togglePressed');

  function updateVar(name, value, unit = 'px') {
    root.style.setProperty(name, `${value}${unit}`);
  }

  if (depth) {
    depth.addEventListener('input', (e) => updateVar('--elevation', e.target.value));
  }
  if (blur) {
    blur.addEventListener('input', (e) => updateVar('--blur', e.target.value));
  }
  if (radius) {
    radius.addEventListener('input', (e) => updateVar('--radius', e.target.value));
  }

  if (togglePressed) {
    togglePressed.addEventListener('click', () => {
      togglePressed.classList.toggle('is-pressed');
    });
  }
});

