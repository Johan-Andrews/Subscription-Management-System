/**
 * Pricing Service (Contract for Member B & Member C)
 * Stubs implemented in Phase 0. Member B replaces this in Task B5.
 */

// eslint-disable-next-line no-unused-vars
async function getUnitPrice(client, { productId, variantId }) {
  // Returns number-like string (e.g. "1560.00")
  return '0.00';
}

// eslint-disable-next-line no-unused-vars
async function getTaxForProduct(client, productId) {
  // Returns { taxId, rate, type }
  return {
    taxId: null,
    rate: '0',
    type: 'PERCENT',
  };
}

// eslint-disable-next-line no-unused-vars
async function findBestDiscount(client, { lines, subtotal, totalQty, onDate }) {
  // Returns { discountId, name, lineAllocations: [{ index, amount }], total } | null
  return null;
}

module.exports = {
  getUnitPrice,
  getTaxForProduct,
  findBestDiscount,
};
