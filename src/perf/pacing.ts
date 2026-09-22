export const pacing = {
  hz: 60,
  div: 1,
  throttled: false,
  changedAt: 0,
}

export const paceBounds = (refresh: number): [number, number] => {
  if (pacing.div === 1) return refresh > 100 ? [60, 100] : [40, 60]
  const target = pacing.hz / pacing.div
  return [target * 0.67, target * 0.97]
}

export const paceSettling = (ms: number) =>
  pacing.throttled || performance.now() - pacing.changedAt < ms
