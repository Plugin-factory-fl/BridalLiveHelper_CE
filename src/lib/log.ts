const PREFIX = '[BridalLiveHelper]'

export function log(...args: unknown[]) {
  console.log(PREFIX, ...args)
}

export function warn(...args: unknown[]) {
  console.warn(PREFIX, ...args)
}

export function error(...args: unknown[]) {
  console.error(PREFIX, ...args)
}
