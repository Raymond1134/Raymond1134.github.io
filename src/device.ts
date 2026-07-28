export const isCoarsePointer = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export const canHover = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(hover: hover)').matches;

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
