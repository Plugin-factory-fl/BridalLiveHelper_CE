import type { InventorySearchQuery } from '../types/inventory'
import type { InventoryProvider } from './provider'
import type {
  InventoryCreateVariantPayload,
  InventoryCreateVariantResult,
  InventorySearchResult,
} from './types'

const PHASE_2_MSG =
  'BridalLive API is Phase 2. MVP uses mock data. See docs/MVP_ROADMAP.md and implement apiLogin + Swagger endpoints here.'

/**
 * Phase 2: implement against BridalLive API
 * - POST /bl-server/api/auth/apiLogin (retailerId, apiKey) → token header
 * - Inventory search/create per Swagger (prod + QA base URLs)
 * @see https://www.bridallive.com/docs/swagger/index.html
 */
export const bridalliveInventoryProvider: InventoryProvider = {
  async search(
    _query: InventorySearchQuery,
    _storeId: string,
  ): Promise<InventorySearchResult> {
    throw new Error(PHASE_2_MSG)
  },

  async createVariant(
    _payload: InventoryCreateVariantPayload,
    _storeId: string,
  ): Promise<InventoryCreateVariantResult> {
    throw new Error(PHASE_2_MSG)
  },
}
