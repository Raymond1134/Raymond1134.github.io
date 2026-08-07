export const isCoarsePointer = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export const canHover = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(hover: hover)').matches;
