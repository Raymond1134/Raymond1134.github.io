import { useStore } from '@/state/store'

const boot = useStore.getState()
export const NO_COMPOSER = boot.compact || boot.quality === 'low'
