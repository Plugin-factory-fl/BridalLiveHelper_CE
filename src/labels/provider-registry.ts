import { getDataSource } from '../lib/data-source'
import { bridalliveLabelsProvider } from './bridallive-provider'
import { mockLabelsProvider } from './mock-provider'
import { renderLabelsProvider } from './render-provider'
import type { LabelsProvider } from './provider'

export function getLabelsProvider(): LabelsProvider {
  switch (getDataSource()) {
    case 'bridallive':
      return bridalliveLabelsProvider
    case 'render':
      return renderLabelsProvider
    default:
      return mockLabelsProvider
  }
}
