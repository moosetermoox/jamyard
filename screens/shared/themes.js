// --- Pre-built game themes ---
// Used by editor (theme picker) and host/player screens (apply CSS vars)

window.GAME_THEMES = {
  'pop-art': {
    name: 'Pop Art',
    icon: '\uD83C\uDFA8',
    description: 'Bold colors, thick borders, Keith Haring energy',
    colors: {
      bg: '#FFF9C4',
      surface: '#FFFFFF',
      accent: '#0057FF',
      text: '#222222',
      heading: '#000000',
      button: '#FF4081',
      buttonText: '#FFFFFF',
      border: '#000000',
      timer: '#0057FF',
      success: '#00C853',
      danger: '#FF2D2D'
    }
  },
  'arcade': {
    name: 'Arcade',
    icon: '\uD83D\uDC7E',
    description: 'Dark background, neon glow, retro game vibes',
    colors: {
      bg: '#1A1A2E',
      surface: '#16213E',
      accent: '#E94560',
      text: '#EAEAEA',
      heading: '#00FF41',
      button: '#E94560',
      buttonText: '#FFFFFF',
      border: '#00FF41',
      timer: '#E94560',
      success: '#00FF41',
      danger: '#FF1744'
    }
  },
  'ocean': {
    name: 'Ocean',
    icon: '\uD83C\uDF0A',
    description: 'Calm blues and teals, relaxing and easy on the eyes',
    colors: {
      bg: '#E0F7FA',
      surface: '#FFFFFF',
      accent: '#00838F',
      text: '#263238',
      heading: '#006064',
      button: '#00ACC1',
      buttonText: '#FFFFFF',
      border: '#B2EBF2',
      timer: '#00ACC1',
      success: '#00897B',
      danger: '#E53935'
    }
  },
  'sunset': {
    name: 'Sunset',
    icon: '\uD83C\uDF05',
    description: 'Warm oranges and purples, golden hour feeling',
    colors: {
      bg: '#FFF3E0',
      surface: '#FFFFFF',
      accent: '#FF6D00',
      text: '#3E2723',
      heading: '#BF360C',
      button: '#FF6D00',
      buttonText: '#FFFFFF',
      border: '#FFAB91',
      timer: '#FF6D00',
      success: '#43A047',
      danger: '#D32F2F'
    }
  }
};

// Apply a theme's colors as CSS custom properties on a target element (usually document.body)
window.applyGameTheme = function (theme) {
  if (!theme) return;

  var colors = null;

  if (typeof theme === 'string') {
    // Pre-built theme name
    var preset = window.GAME_THEMES[theme];
    if (preset) colors = preset.colors;
  } else if (typeof theme === 'object') {
    // Custom theme with colors object
    colors = theme.colors || null;
  }

  if (!colors) return;

  var root = document.documentElement;
  root.style.setProperty('--theme-bg', colors.bg);
  root.style.setProperty('--theme-surface', colors.surface);
  root.style.setProperty('--theme-accent', colors.accent);
  root.style.setProperty('--theme-text', colors.text);
  root.style.setProperty('--theme-heading', colors.heading);
  root.style.setProperty('--theme-button', colors.button);
  root.style.setProperty('--theme-button-text', colors.buttonText);
  root.style.setProperty('--theme-border', colors.border);
  root.style.setProperty('--theme-timer', colors.timer);
  root.style.setProperty('--theme-success', colors.success);
  root.style.setProperty('--theme-danger', colors.danger);

  // Also set body background directly for immediate effect
  document.body.style.background = colors.bg;
  document.body.style.color = colors.text;
};
