import { getReceivingLines, listLabelTemplates } from '../labels/service'
import {
  checkDuplicateVariant,
  createVariant,
  listCatalogItems,
  searchInventory,
} from '../inventory/service'
import { applySaleSearchToOrder } from './order-context'
import { MSG, type ExtensionMessage, type ExtensionResponse } from '../lib/messages'
import { getActiveBridalLiveCredentials } from '../lib/bridallive-credentials'
import { loadPreferences } from '../lib/storage'
import { detectContext, parseDevScreenOverride } from './context'

let latestContext = detectContext()

export function getLatestContext() {
  return latestContext
}

export function refreshContext(): typeof latestContext {
  latestContext = detectContext()
  void loadPreferences().then((prefs) => {
    const override = parseDevScreenOverride(prefs.devScreenOverride)
    latestContext = detectContext(override)
    broadcastContext()
  })
  return latestContext
}

export function initBridge(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handleMessage(message as ExtensionMessage).then(sendResponse)
    return true
  })
}

async function resolveStoreId(): Promise<string> {
  const prefs = await loadPreferences()
  if (prefs.mockStoreId) return prefs.mockStoreId
  const creds = await getActiveBridalLiveCredentials()
  return creds?.location.id ?? 'store-1'
}

async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  switch (message.type) {
    case MSG.PANEL_READY:
      refreshContext()
      return { ok: true, context: latestContext }

    case MSG.GET_CONTEXT:
      refreshContext()
      return { ok: true, context: latestContext }

    case MSG.COPY_TO_CLIPBOARD:
      try {
        await navigator.clipboard.writeText(message.text)
        return { ok: true }
      } catch {
        return { ok: false, error: 'Clipboard write failed' }
      }

    case MSG.INVENTORY_SEARCH: {
      try {
        const search = await searchInventory(message.query, await resolveStoreId())
        return { ok: true, search }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Search failed' }
      }
    }

    case MSG.INVENTORY_LIST_CATALOG: {
      try {
        const catalogItems = await listCatalogItems(await resolveStoreId())
        return { ok: true, catalogItems }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not load catalog',
        }
      }
    }

    case MSG.INVENTORY_CHECK_DUPLICATE: {
      try {
        const storeId = await resolveStoreId()
        const duplicateWarning = await checkDuplicateVariant(
          message.styleId,
          message.size,
          message.color,
          storeId,
        )
        return { ok: true, search: { items: [], duplicateWarning } }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Duplicate check failed',
        }
      }
    }

    case MSG.APPLY_ITEM_TO_ORDER: {
      const result = await applySaleSearchToOrder(message.saleSearchQuery)
      return result.ok
        ? { ok: true, autoSelected: result.autoSelected }
        : { ok: false, error: result.error }
    }

    case MSG.INVENTORY_CREATE_VARIANT: {
      try {
        const variant = await createVariant(
          {
            styleId: message.payload.styleId,
            size: message.payload.size,
            color: message.payload.color,
            sourceItemNumber: message.payload.sourceItemNumber,
          },
          await resolveStoreId(),
        )
        return { ok: true, variant }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Create variant failed',
        }
      }
    }

    case MSG.LABELS_GET_RECEIVING_LINES: {
      const receivingLines = await getReceivingLines(await resolveStoreId())
      return { ok: true, receivingLines }
    }

    case MSG.LABELS_LIST_TEMPLATES: {
      const labelTemplates = await listLabelTemplates(await resolveStoreId())
      return { ok: true, labelTemplates }
    }

    default:
      return { ok: false, error: `Unknown message: ${(message as { type: string }).type}` }
  }
}

function broadcastContext(): void {
  void chrome.runtime
    .sendMessage({
      type: MSG.CONTEXT_UPDATE,
      context: latestContext,
    })
    .catch(() => {
      /* side panel may be closed */
    })
}

export function notifyPanelContext(): void {
  broadcastContext()
}
