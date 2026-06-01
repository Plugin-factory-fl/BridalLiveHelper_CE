import { getReceivingLines, listLabelTemplates } from '../labels/service'
import {
  checkDuplicateVariant,
  createVariant,
  searchInventory,
} from '../inventory/service'
import { applyItemNumberToOrder } from './order-context'
import { MSG, type ExtensionMessage, type ExtensionResponse } from '../lib/messages'
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
      const prefs = await loadPreferences()
      const search = await searchInventory(message.query, prefs.mockStoreId)
      return { ok: true, search }
    }

    case MSG.INVENTORY_CHECK_DUPLICATE: {
      const prefs = await loadPreferences()
      const duplicateWarning = await checkDuplicateVariant(
        message.styleId,
        message.size,
        message.color,
        prefs.mockStoreId,
      )
      return { ok: true, search: { items: [], duplicateWarning } }
    }

    case MSG.APPLY_ITEM_TO_ORDER: {
      const result = applyItemNumberToOrder(message.itemNumber)
      return result.ok ? { ok: true } : { ok: false, error: result.error }
    }

    case MSG.INVENTORY_CREATE_VARIANT: {
      const prefs = await loadPreferences()
      const variant = await createVariant(
        {
          styleId: message.payload.styleId,
          size: message.payload.size,
          color: message.payload.color,
          sourceItemNumber: message.payload.sourceItemNumber,
        },
        prefs.mockStoreId,
      )
      return { ok: true, variant }
    }

    case MSG.LABELS_GET_RECEIVING_LINES: {
      const prefs = await loadPreferences()
      const receivingLines = await getReceivingLines(prefs.mockStoreId)
      return { ok: true, receivingLines }
    }

    case MSG.LABELS_LIST_TEMPLATES: {
      const prefs = await loadPreferences()
      const labelTemplates = await listLabelTemplates(prefs.mockStoreId)
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
