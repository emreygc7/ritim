import type { RitimApi } from '@shared/api'

declare global {
  interface Window {
    ritim: RitimApi
  }
}



export {}
