export type MassLabelPayload = {
  itemName: string
  deptCode: string
  vendorCode: string
  color: string
  size: string
  salePrice: string
  origPrice: string
  itemNumber: string
  barcodeValue: string
  /** BridalLive Description, else sheet Description, else Long Description. Never size or color. */
  description: string
  locationCode: string
}
