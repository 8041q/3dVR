import React from 'react'
import ProductInspection from '../product/ProductInspection'

export default function ProductModelPreview({ action, onClose, initialFeature }) {
  return <ProductInspection inspection={action} onClose={onClose} initialFeature={initialFeature} />
}
