export function localAssetUrl(assetPath: string | null | undefined): string {
  if (!assetPath) return ''
  return `local-asset:///${assetPath.split('/').map(encodeURIComponent).join('/')}`
}

export function useLogoUrl(): string {
  return new URL('../assets/MapBerry.png', import.meta.url).href
}
