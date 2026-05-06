/// <reference types="vite/client" />
import type { MapBerryAPI, MapBerryPlayerAPI } from '../preload/preload'

declare global {
  interface Window {
    mapberry: MapBerryAPI
    mapberryPlayer: MapBerryPlayerAPI
  }
}

declare module '*.png' {
  const url: string
  export default url
}
