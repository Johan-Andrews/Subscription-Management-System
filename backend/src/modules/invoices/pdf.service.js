const PDFDocument = require('pdfkit');

/**
 * Generate PDF buffer for an invoice
 * @param {Object} data Full invoice object with customer, lines, discounts, payments
 * @returns {Promise<Buffer>}
 */
function generateInvoicePdfBuffer(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    renderInvoiceDoc(doc, data);
    doc.end();
  });
}

/**
 * Stream invoice PDF to a writable stream (e.g. Express res)
 * @param {Object} data 
 * @param {WritableStream} res 
 */
function streamInvoicePdf(data, res) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);
  renderInvoiceDoc(doc, data);
  doc.end();
}

function formatCurrency(amount) {
  const val = Number(amount) || 0;
  return 'INR ' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return 'N/A';
  const date = new Date(d);
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function renderInvoiceDoc(doc, invoice) {
  const customer = invoice.customer || {};
  const lines = invoice.lines || [];
  const discounts = invoice.discounts || [];
  const payments = invoice.payments || [];

  // Colors from DESIGN.md
  const primaryNavy = '#0A2A66';
  const brandBlue = '#0B5CFF';
  const textDark = '#181B25';
  const textMuted = '#5C667A';
  const borderGrey = '#E1E5EB';
  const lightGrey = '#F8FAFC';

  // 1. Header (Company brand & Title)
  doc.rect(40, 40, 515, 65).fill(primaryNavy);

  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('BRIGHTLOOP', 55, 52);

  doc
    .fillColor('#A8F0E0')
    .font('Helvetica')
    .fontSize(10)
    .text('SUBSCRIPTION MANAGEMENT', 55, 78);

  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(20)
    .text('INVOICE', 380, 52, { align: 'right', width: 160 });

  doc
    .fillColor('#E5EFFF')
    .font('Helvetica')
    .fontSize(10)
    .text(invoice.number || 'INV-000000', 380, 78, { align: 'right', width: 160 });

  doc.y = 120;

  // 2. Info Cards (Billed To & Invoice Details)
  const leftX = 40;
  const rightX = 310;
  const cardY = 120;
  const cardHeight = 110;

  // Billed To Box
  doc.roundedRect(leftX, cardY, 250, cardHeight, 6).lineWidth(1).strokeColor(borderGrey).stroke();
  doc.rect(leftX, cardY, 250, 24).fill(lightGrey);
  doc.fillColor(textMuted).font('Helvetica-Bold').fontSize(9).text('BILLED TO', leftX + 12, cardY + 7);

  doc.fillColor(textDark).font('Helvetica-Bold').fontSize(11).text(customer.name || 'Valued Customer', leftX + 12, cardY + 32);
  doc.font('Helvetica').fontSize(9).fillColor(textMuted);
  let custY = cardY + 48;
  if (customer.company) {
    doc.text(customer.company, leftX + 12, custY);
    custY += 13;
  }
  if (customer.email) {
    doc.text(customer.email, leftX + 12, custY);
    custY += 13;
  }
  if (customer.phone) {
    doc.text(`Phone: ${customer.phone}`, leftX + 12, custY);
    custY += 13;
  }
  if (customer.address) {
    doc.text(customer.address, leftX + 12, custY, { width: 226, lineBreak: true });
  }

  // Invoice Details Box
  doc.roundedRect(rightX, cardY, 245, cardHeight, 6).lineWidth(1).strokeColor(borderGrey).stroke();
  doc.rect(rightX, cardY, 245, 24).fill(lightGrey);
  doc.fillColor(textMuted).font('Helvetica-Bold').fontSize(9).text('INVOICE DETAILS', rightX + 12, cardY + 7);

  const metaFields = [
    { label: 'Status:', val: invoice.status || 'DRAFT' },
    { label: 'Issue Date:', val: formatDate(invoice.issue_date) },
    { label: 'Due Date:', val: formatDate(invoice.due_date) },
    { label: 'Period:', val: `${formatDate(invoice.period_start)} - ${formatDate(invoice.period_end)}` },
  ];

  if (invoice.subscription_number) {
    metaFields.push({ label: 'Subscription:', val: invoice.subscription_number });
  }

  let metaY = cardY + 32;
  metaFields.forEach((item) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(textMuted).text(item.label, rightX + 12, metaY);
    doc.font('Helvetica').fontSize(9).fillColor(textDark).text(item.val, rightX + 95, metaY, { width: 140 });
    metaY += 15;
  });

  // 3. Table of Lines
  const tableY = 250;
  doc.rect(40, tableY, 515, 24).fill(primaryNavy);

  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
  doc.text('DESCRIPTION', 50, tableY + 7, { width: 190 });
  doc.text('QTY', 245, tableY + 7, { width: 35, align: 'center' });
  doc.text('UNIT PRICE', 285, tableY + 7, { width: 75, align: 'right' });
  doc.text('TAX', 365, tableY + 7, { width: 65, align: 'right' });
  doc.text('NET AMOUNT', 435, tableY + 7, { width: 110, align: 'right' });

  let curY = tableY + 28;
  doc.font('Helvetica').fontSize(9);

  lines.forEach((line, idx) => {
    const isEven = idx % 2 === 0;
    if (isEven) {
      doc.rect(40, curY - 4, 515, 20).fill('#FAFAFA');
    }

    doc.fillColor(textDark);
    doc.text(line.description || 'Subscription Line', 50, curY, { width: 190 });
    doc.text(String(line.quantity || 1), 245, curY, { width: 35, align: 'center' });
    doc.text(formatCurrency(line.unit_price), 285, curY, { width: 75, align: 'right' });

    const taxDesc = `${Number(line.tax_rate || 0)}%`;
    doc.text(taxDesc, 365, curY, { width: 65, align: 'right' });
    doc.text(formatCurrency(line.amount), 435, curY, { width: 110, align: 'right' });

    curY += 20;

    // Page overflow check
    if (curY > 700) {
      doc.addPage();
      curY = 50;
    }
  });

  doc.rect(40, curY, 515, 1).fill(borderGrey);
  curY += 15;

  // 4. Summary Totals (Right side)
  const sumLabelX = 330;
  const sumValX = 430;
  const sumWidth = 115;

  const totals = [
    { label: 'Subtotal:', val: formatCurrency(invoice.subtotal) },
  ];

  if (Number(invoice.discount_total) > 0) {
    const discountName = discounts.length > 0 ? ` (${discounts[0].name})` : '';
    totals.push({ label: `Discount${discountName}:`, val: `- ${formatCurrency(invoice.discount_total)}`, color: '#D92D20' });
  }

  totals.push(
    { label: 'Tax Total:', val: formatCurrency(invoice.tax_total) },
    { label: 'Total Amount:', val: formatCurrency(invoice.total), bold: true },
    { label: 'Amount Paid:', val: formatCurrency(invoice.amount_paid) },
    {
      label: 'Balance Due:',
      val: formatCurrency(Math.max(0, Number(invoice.total || 0) - Number(invoice.amount_paid || 0))),
      bold: true,
      highlight: true,
    }
  );

  totals.forEach((row) => {
    if (row.highlight) {
      doc.rect(sumLabelX - 10, curY - 3, 225, 22).fill('#E5EFFF');
      doc.fillColor(brandBlue).font('Helvetica-Bold').fontSize(11);
      doc.text(row.label, sumLabelX, curY + 2);
      doc.text(row.val, sumValX, curY + 2, { width: sumWidth, align: 'right' });
      curY += 26;
    } else {
      doc.fillColor(row.color || textDark);
      doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      doc.text(row.label, sumLabelX, curY);
      doc.text(row.val, sumValX, curY, { width: sumWidth, align: 'right' });
      curY += 16;
    }
  });

  // 5. Payments History (if any)
  if (payments && payments.length > 0) {
    curY += 15;
    if (curY > 700) {
      doc.addPage();
      curY = 50;
    }

    doc.fillColor(primaryNavy).font('Helvetica-Bold').fontSize(10).text('PAYMENTS RECEIVED', 40, curY);
    curY += 15;

    doc.rect(40, curY, 515, 18).fill(lightGrey);
    doc.fillColor(textMuted).font('Helvetica-Bold').fontSize(8);
    doc.text('DATE', 50, curY + 4, { width: 100 });
    doc.text('METHOD', 160, curY + 4, { width: 80 });
    doc.text('STATUS', 250, curY + 4, { width: 80 });
    doc.text('NOTE', 340, curY + 4, { width: 120 });
    doc.text('AMOUNT', 460, curY + 4, { width: 85, align: 'right' });
    curY += 22;

    doc.font('Helvetica').fontSize(8).fillColor(textDark);
    payments.forEach((p) => {
      doc.text(formatDate(p.paid_on), 50, curY, { width: 100 });
      doc.text(p.method || 'OTHER', 160, curY, { width: 80 });
      doc.text(p.status || 'COMPLETED', 250, curY, { width: 80 });
      doc.text(p.note || '-', 340, curY, { width: 120, lineBreak: false });
      doc.text(formatCurrency(p.amount), 460, curY, { width: 85, align: 'right' });
      curY += 14;
    });
  }

  // 6. Footer
  const footerY = 780;
  doc.rect(40, footerY - 10, 515, 1).fill(borderGrey);
  doc
    .fillColor(textMuted)
    .font('Helvetica')
    .fontSize(8)
    .text(
      'Thank you for your business! Brightloop Software - Enterprise Subscription Management Platform.',
      40,
      footerY,
      { align: 'center', width: 515 }
    );
}

module.exports = {
  generateInvoicePdfBuffer,
  streamInvoicePdf,
};
