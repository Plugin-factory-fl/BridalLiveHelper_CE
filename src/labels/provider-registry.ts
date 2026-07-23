import { resolveDataSource } from '../lib/data-source'
import { bridalliveLabelsProvider } from './bridallive-provider'
import { mockLabelsProvider } from './mock-provider'
import { renderLabelsProvider } from './render-provider'
import type { LabelsProvider } from './provider'

export async function getLabelsProvider(): Promise<LabelsProvider> {
  switch (await resolveDataSource()) {
    case 'bridallive':
      return bridalliveLabelsProvider
    case 'render':
      return renderLabelsProvider
    default:
      return mockLabelsProvider
  }
}
