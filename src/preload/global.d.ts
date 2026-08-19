import type { DshDesktopApi } from '../shared/contracts.js'

declare global {
  interface Window {
    dshDesktop: DshDesktopApi
  }
}

export {}
