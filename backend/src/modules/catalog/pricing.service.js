const { badRequest, notFound } = require('../../lib/errors');

const ZERO_TAX = {
  taxId: null,
  rate: '0',
  type: 'PERCENT',
};

function toPaise(value, fieldName) {
  const text = String(value ?? '').trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    throw badRequest(`${fieldName} must be a non-negative amount with up to two decimal places`);
  }
  const fraction = (match[2] || '').padEnd(2, '0');
  return BigInt(match[1]) * 100n + BigInt(fraction || '0');
}

function fromPaise(value) {
  const rupees = value / 100n;
  const paise = (value % 100n).toString().padStart(2, '0');
  return `${rupees}.${paise}`;
}

function parseDate(value, fieldName) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) {
      return value;
    }
  }
  throw badRequest(`${fieldName} must be a valid YYYY-MM-DD date`);
}

function parsePercent(value) {
  const text = String(value ?? '').trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    throw badRequest('Discount percentage must have up to two decimal places');
  }
  return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0');
}

function roundDivide(numerator, denominator) {
  return (numerator + denominator / 2n) / denominator;
}

async function getUnitPrice(client, { productId, variantId }) {
  const result = await client.query(
    `SELECT p.sales_price, v.extra_price
     FROM products p
     LEFT JOIN product_variants v
       ON v.product_id = p.id AND v.id = $2
     WHERE p.id = $1`,
    [productId, variantId || null]
  );
  if (result.rows.length === 0) {
    throw notFound('Product not found');
  }
  const row = result.rows[0];
  if (variantId && row.extra_price === null) {
    throw badRequest('Variant does not belong to this product');
  }
  const salesPrice = toPaise(row.sales_price, 'Product sales price');
  const extraPrice = variantId ? toPaise(row.extra_price, 'Variant extra price') : 0n;
  return fromPaise(salesPrice + extraPrice);
}

async function getTaxForProduct(client, productId) {
  const result = await client.query(
    `SELECT t.id, t.rate, t.type
     FROM products p
     JOIN taxes t ON t.id = p.tax_id AND t.is_active = true
     WHERE p.id = $1`,
    [productId]
  );
  if (result.rows.length === 0) {
    return { ...ZERO_TAX };
  }
  return {
    taxId: result.rows[0].id,
    rate: String(result.rows[0].rate),
    type: result.rows[0].type,
  };
}

function isEligibleOnDate(discount, onDate) {
  if (discount.is_active === false) return false;
  if (discount.start_date && String(discount.start_date).slice(0, 10) > onDate) return false;
  if (discount.end_date && String(discount.end_date).slice(0, 10) < onDate) return false;
  if (discount.usage_limit !== null && discount.usage_limit !== undefined
    && Number(discount.times_used) >= Number(discount.usage_limit)) {
    return false;
  }
  return true;
}

function allocateProportionally(lines, discountPaise, grossTotalPaise) {
  const amounts = [];
  let allocated = 0n;
  for (const line of lines.slice(0, -1)) {
    const amount = discountPaise * line.grossPaise / grossTotalPaise;
    amounts.push(amount);
    allocated += amount;
  }

  const lastIndex = lines.length - 1;
  let lastAmount = discountPaise - allocated;
  if (lastAmount > lines[lastIndex].grossPaise) {
    let remaining = lastAmount - lines[lastIndex].grossPaise;
    lastAmount = lines[lastIndex].grossPaise;
    for (let index = lastIndex - 1; index >= 0 && remaining > 0n; index -= 1) {
      const available = lines[index].grossPaise - amounts[index];
      const addition = available < remaining ? available : remaining;
      amounts[index] += addition;
      remaining -= addition;
    }
    if (remaining > 0n) {
      throw new Error('Discount allocation exceeded the eligible line amounts');
    }
  }
  amounts.push(lastAmount);
  return lines.map((line, index) => ({
    index: line.index,
    amount: fromPaise(amounts[index]),
  }));
}

async function findBestDiscount(client, { lines, subtotal, totalQty, onDate }) {
  if (!Array.isArray(lines) || lines.length === 0) return null;

  const date = parseDate(onDate, 'Billing date');
  const subtotalPaise = toPaise(subtotal, 'Subtotal');
  const quantity = Number(totalQty);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw badRequest('Total quantity must be a non-negative integer');
  }

  const grossLines = lines.map((line, index) => ({
    index: Number.isInteger(line.index) ? line.index : index,
    productId: line.productId,
    quantity: Number(line.quantity),
    grossPaise: toPaise(line.gross, 'Line gross'),
  }));
  if (grossLines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 0)) {
    throw badRequest('Line quantities must be non-negative integers');
  }

  const discountsResult = await client.query(
    `SELECT d.id, d.name, d.type, d.value, d.min_purchase, d.min_qty,
            d.start_date, d.end_date, d.usage_limit, d.times_used,
            d.scope, d.is_active
     FROM discounts d
     WHERE d.is_active = true
       AND (d.start_date IS NULL OR d.start_date <= $1::date)
       AND (d.end_date IS NULL OR d.end_date >= $1::date)
       AND (d.usage_limit IS NULL OR d.times_used < d.usage_limit)
       AND d.min_qty <= $2
       AND d.min_purchase <= $3::numeric
     ORDER BY d.id
     FOR UPDATE`,
    [date, quantity, subtotal]
  );
  const discounts = discountsResult.rows.filter((discount) => isEligibleOnDate(discount, date));
  if (discounts.length === 0) return null;

  const productDiscountIds = discounts
    .filter((discount) => discount.scope === 'PRODUCT')
    .map((discount) => discount.id);
  const productsByDiscount = new Map();
  if (productDiscountIds.length > 0) {
    const productsResult = await client.query(
      `SELECT discount_id, product_id
       FROM discount_products
       WHERE discount_id = ANY($1::uuid[])`,
      [productDiscountIds]
    );
    for (const row of productsResult.rows) {
      if (!productsByDiscount.has(row.discount_id)) {
        productsByDiscount.set(row.discount_id, new Set());
      }
      productsByDiscount.get(row.discount_id).add(row.product_id);
    }
  }

  const eligible = [];
  for (const discount of discounts) {
    if (quantity < Number(discount.min_qty)) continue;
    if (subtotalPaise < toPaise(discount.min_purchase, 'Minimum purchase')) continue;

    const applicableLines = (discount.scope === 'PRODUCT'
      ? grossLines.filter((line) => productsByDiscount.get(discount.id)?.has(line.productId))
      : grossLines).filter((line) => line.grossPaise > 0n);
    const applicableGross = applicableLines.reduce((sum, line) => sum + line.grossPaise, 0n);
    if (applicableGross <= 0n) continue;

    let saving;
    if (discount.type === 'PERCENT') {
      const percentHundredths = parsePercent(discount.value);
      saving = roundDivide(applicableGross * percentHundredths, 10000n);
    } else if (discount.type === 'FIXED') {
      saving = toPaise(discount.value, 'Discount value');
    } else {
      continue;
    }
    if (saving > applicableGross) saving = applicableGross;
    if (saving <= 0n) continue;

    eligible.push({
      discount,
      applicableLines,
      applicableGross,
      saving,
    });
  }

  eligible.sort((left, right) => {
    if (left.saving === right.saving) {
      return String(left.discount.id).localeCompare(String(right.discount.id));
    }
    return left.saving > right.saving ? -1 : 1;
  });
  if (eligible.length === 0) return null;

  const best = eligible[0];
  return {
    discountId: best.discount.id,
    name: best.discount.name,
    lineAllocations: allocateProportionally(
      best.applicableLines,
      best.saving,
      best.applicableGross
    ),
    total: fromPaise(best.saving),
  };
}

module.exports = {
  getUnitPrice,
  getTaxForProduct,
  findBestDiscount,
};
