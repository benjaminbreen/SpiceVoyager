const IMAGE_EXTENSIONS = ['webp', 'png', 'jpg'] as const;

export function getPortBannerCandidates(portId: string, tab?: string): string[] {
  if (!tab || tab === 'overview') {
    return getDefaultPortImageCandidates(portId);
  }

  return [
    ...IMAGE_EXTENSIONS.map(ext => `/ports/${portId}-${tab}.${ext}`),
    ...getDefaultPortImageCandidates(portId),
  ];
}

export function getDefaultPortImageCandidates(portId: string): string[] {
  return IMAGE_EXTENSIONS.map(ext => `/ports/${portId}.${ext}`);
}

export function getPortIconCandidates(portId: string): string[] {
  return IMAGE_EXTENSIONS.map(ext => `/ports/${portId}-icon.${ext}`);
}
