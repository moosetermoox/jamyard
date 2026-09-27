// Minimal stand-ins for the two animation helpers the live madlib uses, so the landing page
// doesn't need the full timeline engine. Skipped if the engine is already loaded.
(function () {
  if (window.animate && window.Easing) return;
  const Easing = {
    easeOutCubic: (t) => (--t) * t * t + 1,
    easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
    easeInQuad: (t) => t * t,
  };
  function animate({ from = 0, to = 1, start = 0, end = 1, ease = Easing.easeInOutCubic }) {
    return (t) => {
      if (t <= start) return from;
      if (t >= end) return to;
      return from + (to - from) * ease((t - start) / (end - start));
    };
  }
  window.Easing = Easing;
  window.animate = animate;
})();
