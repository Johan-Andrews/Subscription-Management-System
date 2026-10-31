/**
 * Integer-based money utilities for INR (paise).
 * 1 INR = 100 paise.
 */

function toPaise(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') {
    return Math.round(value * 100);
  }
  const str = String(value).trim();
  if (!str) return 0;
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

function fromPaise(paise) {
  if (paise === null || paise === undefined || isNaN(paise)) return '0.00';
  const integerPaise = Math.round(Number(paise));
  const sign = integerPaise < 0 ? '-' : '';
  const absPaise = Math.abs(integerPaise);
  const rupees = Math.floor(absPaise / 100);
  const remainingPaise = absPaise % 100;
  return `${sign}${rupees}.${remainingPaise.toString().padStart(2, '0')}`;
}

function mulPaise(paise, quantity) {
  const p = Math.round(Number(paise) || 0);
  const q = Number(quantity) || 0;
  return Math.round(p * q);
}

function percentOf(paise, ratePercent) {
  const p = Math.round(Number(paise) || 0);
  const r = Number(ratePercent) || 0;
  return Math.round((p * r) / 100);
}

module.exports = {
  toPaise,
  fromPaise,
  mulPaise,
  percentOf,
};

