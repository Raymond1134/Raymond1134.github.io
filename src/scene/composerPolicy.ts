import { useStore } from '@/state/store'
import { BOOT_TIER } from '@/perf/gpuTier'

export const NO_COMPOSER = useStore.getState().compact || BOOT_TIER === 'low'
