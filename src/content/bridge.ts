import { getReceivingLines, listLabelTemplates } from '../labels/service'
import {
  checkDuplicateVariant,
  createVariant,
  listCatalogItems,
  searchInventory,
} from '../inventory/service'
import { applySaleSearchToOrder } from './order-context'
import { readOpenPosTransaction } from './pos-transaction'
import { addInventoryItemToPosTransaction } from '../lib/bridallive-pos'
import { getWorkingLocationId } from '../lib/helper-session'
import { MSG, type ExtensionMessage, type ExtensionResponse } from '../lib/messages'
import { detectContext } from './context'
import { log, warn } from '../lib/log'

let latestContext = detectContext()

export function getLatestContext() {
  return latestContext
}

export function refreshContext(): typeof latestContext {
  latestContext = detectContext()
  broadcastContext()
  return latestContext
}

export function initBridge(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handleMessage(message as ExtensionMessage).then(sendResponse)
    return true
  })
}

async function resolveStoreId(): Promise<string> {
  return getWorkingLocationId()
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
        return { ok: false, error: 'Could not copy. Try again.' }
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
      const itemNumber = (message.itemNumber ?? message.saleSearchQuery).trim()
      if (!itemNumber) {
        return { ok: false, error: 'Item number is required to add to the order.' }
      }

      const storeId = await resolveStoreId()
      const openTrx = readOpenPosTransaction()

      if (openTrx && (openTrx.id || openTrx.trxNumber)) {
        try {
          const apiResult = await addInventoryItemToPosTransaction({
            itemNumber,
            inventoryItemId: message.inventoryItemId,
            posTransactionId: openTrx.id,
            trxNumber: openTrx.trxNumber,
            storeId,
          })
          if (apiResult.ok) {
            log('add to order via API', apiResult.message)
            // Reload so the open sale reflects the new line item.
            window.setTimeout(() => {
              location.reload()
            }, 250)
            return {
              ok: true,
              autoSelected: true,
              addMethod: 'api',
              message: apiResult.message,
            }
          }
          warn('API addLineItem failed, falling back to DOM', apiResult.message)
        } catch (err) {
          warn('API addLineItem threw, falling back to DOM', err)
        }
      }

      const result = await applySaleSearchToOrder(itemNumber)
      return result.ok
        ? { ok: true, autoSelected: result.autoSelected, addMethod: 'dom' }
        : { ok: false, error: result.error, addMethod: 'dom' }
    }

    case MSG.INVENTORY_CREATE_VARIANT: {
      try {
        const variant = await createVariant(
          {
            styleId: message.payload.styleId,
            size: message.payload.size,
            color: message.payload.color,
            vendorItemName: message.payload.vendorItemName,
            sourceItemNumber: message.payload.sourceItemNumber,
            sourceInventoryItemId: message.payload.sourceInventoryItemId,
            sourceLocationId: message.payload.sourceLocationId,
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
