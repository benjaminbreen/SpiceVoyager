// Safari's WebGL driver is markedly slower than Chrome's for full-screen
// post-processing passes and high-res shadow maps. We use this flag to apply
// lighter-weight render settings on Safari without changing visual character.
export const IS_SAFARI =
  typeof navigator !== 'undefined' &&
  /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
