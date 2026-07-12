import { useEffect } from 'react';
import { createPortal } from 'react-dom';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getCustomerDetails({
  order,
  booking,
  customerName,
  customerPhone,
  customerEmail,
}) {
  const source = order || booking || {};
  const profile = source.profiles || source.customer || {};

  const name =
    customerName ||
    source.walkin_customer_name ||
    source.guest_name ||
    `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
    'Guest Customer';

  const phone =
    customerPhone ||
    source.customer_contact_phone ||
    source.walkin_customer_phone ||
    source.guest_phone ||
    profile.phone ||
    '—';

  const email =
    customerEmail ||
    profile.email ||
    source.customer_email ||
    '—';

  return {
    name,
    phone,
    email,
  };
}

function getBookingServices(booking) {
  const services = Array.isArray(booking?.booking_services)
    ? booking.booking_services
    : [];

  if (services.length > 0) {
    return services;
  }

  if (booking?.services) {
    return [
      {
        service_name:
          booking.services?.name ||
          booking.services_summary ||
          'Motorcycle Service',
        base_price: Number(booking.services?.base_price) || 0,
        labor_cost: Number(booking.services?.labor_cost) || 0,
        quantity: 1,
      },
    ];
  }

  if (booking?.services_summary) {
    return String(booking.services_summary)
      .split(',')
      .map((name, index) => ({
        id: `summary-${index}`,
        service_name: name.trim(),
        base_price: 0,
        labor_cost: 0,
        quantity: 1,
      }))
      .filter((item) => item.service_name);
  }

  return [];
}

function normalizeItems({ items = [], order = null, booking = null }) {
  if (Array.isArray(items) && items.length > 0) {
    return items.map((item, index) => {
      const quantity = Math.max(1, Number(item?.quantity) || 1);
      const lineTotal =
        Number(
          item?.lineTotal ??
            item?.line_total ??
            item?.subtotal ??
            item?.amount
        ) || 0;
      const unitPrice =
        Number(item?.unitPrice ?? item?.unit_price) ||
        (quantity > 0 ? lineTotal / quantity : lineTotal);

      return {
        id: item?.id || `custom-${index}`,
        label:
          item?.label ||
          item?.item_name ||
          item?.name ||
          'MotoFix Item',
        description:
          item?.description ||
          item?.item_type ||
          '',
        quantity,
        unitPrice,
        lineTotal,
      };
    });
  }

  if (Array.isArray(order?.order_items) && order.order_items.length > 0) {
    return order.order_items.map((item, index) => {
      const quantity = Math.max(1, Number(item?.quantity) || 1);
      const unitPrice = Number(item?.unit_price) || 0;
      const lineTotal =
        Number(item?.subtotal) || unitPrice * quantity;

      return {
        id: item?.id || `order-${index}`,
        label:
          item?.parts?.name ||
          item?.name ||
          'Motorcycle Part',
        description:
          item?.parts?.category ||
          item?.category ||
          'Product / Part',
        quantity,
        unitPrice,
        lineTotal,
      };
    });
  }

  const bookingItems = getBookingServices(booking).map(
    (service, index) => {
      const quantity = Math.max(
        1,
        Number(service?.quantity) || 1
      );
      const unitPrice =
        (Number(service?.base_price) || 0) +
        (Number(service?.labor_cost) || 0);

      return {
        id: service?.id || `service-${index}`,
        label:
          service?.service_name ||
          service?.name ||
          service?.services?.name ||
          'Motorcycle Service',
        description: 'Service',
        quantity,
        unitPrice,
        lineTotal: unitPrice * quantity,
      };
    }
  );

  const products = Array.isArray(booking?.parts_used)
    ? booking.parts_used
    : Array.isArray(booking?.products)
      ? booking.products
      : [];

  products.forEach((product, index) => {
    const quantity = Math.max(
      1,
      Number(product?.quantity) || 1
    );
    const unitPrice =
      Number(product?.unit_price ?? product?.price) || 0;

    bookingItems.push({
      id: product?.id || product?.part_id || `product-${index}`,
      label: product?.name || 'Product / Part',
      description: 'Product / Part',
      quantity,
      unitPrice,
      lineTotal:
        Number(product?.subtotal) ||
        unitPrice * quantity,
    });
  });

  return bookingItems;
}

function getPaymentDate(payment) {
  return new Date(
    payment?.receipt_issued_at ||
      payment?.paid_at ||
      payment?.created_at ||
      0
  ).getTime();
}

function normalizePayment(payment, index = 0) {
  return {
    ...payment,
    _index: index,
    amount: Number(
      payment?.amount ??
        payment?.amount_paid ??
        payment?.paid_amount ??
        0
    ) || 0,
    payment_type:
      payment?.payment_type ||
      payment?.type ||
      'payment',
    method:
      payment?.method ||
      payment?.payment_method ||
      payment?.provider ||
      'payment',
    receipt_number:
      payment?.receipt_number ||
      payment?.reference_number ||
      payment?.provider_payment_id ||
      null,
    receipt_issued_at:
      payment?.receipt_issued_at ||
      payment?.paid_at ||
      payment?.created_at ||
      null,
  };
}

function calculatePayments(payments = []) {
  return (payments || [])
    .map(normalizePayment)
    .reduce((sum, payment) => {
      const type = String(payment.payment_type || '').toLowerCase();

      return type === 'refund'
        ? sum - payment.amount
        : sum + payment.amount;
    }, 0);
}

function getCumulativePaidForReceipt(receipt, payments, totalAmount) {
  const normalizedPayments = (payments || [])
    .map(normalizePayment)
    .sort((a, b) => getPaymentDate(a) - getPaymentDate(b));

  if (normalizedPayments.length === 0) {
    return Math.min(
      Number(receipt?.amount ?? receipt?.amountPaid) || 0,
      totalAmount
    );
  }

  const targetId = String(receipt?.id || '');
  const targetReceiptNumber = String(
    receipt?.receipt_number ||
      receipt?.reference_number ||
      ''
  );
  const targetDate = getPaymentDate(receipt);

  let runningTotal = 0;
  let matched = false;

  for (const payment of normalizedPayments) {
    const type = String(payment.payment_type || '').toLowerCase();

    runningTotal +=
      type === 'refund'
        ? -payment.amount
        : payment.amount;

    const sameId =
      targetId &&
      String(payment?.id || '') === targetId;
    const sameReceipt =
      targetReceiptNumber &&
      String(payment?.receipt_number || '') === targetReceiptNumber;
    const sameDate =
      targetDate > 0 &&
      getPaymentDate(payment) === targetDate &&
      Number(payment.amount) ===
        Number(receipt?.amount || 0);

    if (sameId || sameReceipt || sameDate) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    runningTotal = calculatePayments(normalizedPayments);
  }

  return Math.max(
    0,
    totalAmount > 0
      ? Math.min(runningTotal, totalAmount)
      : runningTotal
  );
}

function getMechanicName(booking) {
  const mechanic = booking?.mechanic || {};
  const name = `${mechanic.first_name || ''} ${
    mechanic.last_name || ''
  }`.trim();

  return name || 'Unassigned';
}

function getDocumentData({
  type,
  invoice,
  receipt,
  payment,
  payments,
  order,
  booking,
  customerName,
  customerPhone,
  customerEmail,
  items,
}) {
  const documentType =
    type === 'receipt' ? 'receipt' : 'invoice';
  const activeReceipt = receipt || payment || null;
  const displayItems = normalizeItems({
    items,
    order,
    booking,
  });

  const itemSubtotal = displayItems.reduce(
    (sum, item) => sum + item.lineTotal,
    0
  );

  const recordTotal =
    Number(
      order?.total_amount ??
        booking?.total_amount ??
        booking?.service_total
    ) ||
    itemSubtotal ||
    0;

  const totalAmount =
    documentType === 'invoice'
      ? Number(
          invoice?.total_amount ??
            invoice?.totalAmount
        ) || recordTotal
      : Number(
          activeReceipt?.total ??
            activeReceipt?.total_amount
        ) || recordTotal;

  const receiptAmount =
    documentType === 'receipt'
      ? Number(
          activeReceipt?.amount ??
            activeReceipt?.amountPaid ??
            activeReceipt?.amount_paid
        ) || 0
      : 0;

  const paidToDate =
    documentType === 'invoice'
      ? Number(
          invoice?.amount_paid ??
            invoice?.amountPaid
        ) || calculatePayments(payments)
      : getCumulativePaidForReceipt(
          activeReceipt,
          payments,
          totalAmount
        );

  const balanceDue =
    documentType === 'invoice'
      ? Number(
          invoice?.balance_due ??
            invoice?.balanceDue
        )
      : Math.max(totalAmount - paidToDate, 0);

  const safeBalance = Number.isFinite(balanceDue)
    ? Math.max(balanceDue, 0)
    : Math.max(totalAmount - paidToDate, 0);

  const status =
    documentType === 'invoice'
      ? invoice?.status ||
        (safeBalance <= 0
          ? 'paid'
          : paidToDate > 0
            ? 'partial'
            : 'unpaid')
      : safeBalance <= 0
        ? 'paid'
        : paidToDate > 0
          ? 'partial'
          : 'unpaid';

  const documentNumber =
    documentType === 'receipt'
      ? activeReceipt?.receipt_number ||
        activeReceipt?.receiptNumber ||
        activeReceipt?.reference_number ||
        activeReceipt?.referenceId ||
        `OR-${String(
          activeReceipt?.id ||
            order?.id ||
            booking?.id ||
            'PENDING'
        )
          .slice(0, 8)
          .toUpperCase()}`
      : invoice?.invoice_number ||
        invoice?.invoiceNumber ||
        `INV-${String(
          order?.id ||
            booking?.id ||
            'PENDING'
        )
          .slice(0, 8)
          .toUpperCase()}`;

  const issuedAt =
    documentType === 'receipt'
      ? activeReceipt?.receipt_issued_at ||
        activeReceipt?.receiptIssuedAt ||
        activeReceipt?.paid_at ||
        activeReceipt?.created_at ||
        activeReceipt?.issuedAt
      : invoice?.issued_at ||
        invoice?.issuedAt ||
        invoice?.created_at;

  const customer = getCustomerDetails({
    order,
    booking,
    customerName,
    customerPhone,
    customerEmail,
  });

  const paymentMethod =
    activeReceipt?.method ||
    activeReceipt?.paymentMethod ||
    activeReceipt?.payment_method ||
    order?.payment_method ||
    booking?.payment_method ||
    '—';

  const paymentReference =
    activeReceipt?.reference_number ||
    activeReceipt?.payment_reference ||
    activeReceipt?.receipt_number ||
    order?.payment_reference ||
    booking?.payment_reference ||
    '—';

  const recordId =
    invoice?.order_id ||
    invoice?.booking_id ||
    activeReceipt?.order_id ||
    activeReceipt?.booking_id ||
    order?.id ||
    booking?.id ||
    documentNumber;

  const transactionLabel = order
    ? order?.is_walkin
      ? 'Product Counter / Walk-in Order'
      : 'Parts Order'
    : booking
      ? 'Motorcycle Service Booking'
      : documentType === 'receipt'
        ? 'Payment Receipt'
        : 'Invoice';

  return {
    documentType,
    activeReceipt,
    displayItems,
    itemSubtotal,
    totalAmount,
    receiptAmount,
    paidToDate,
    balanceDue: safeBalance,
    status,
    documentNumber,
    issuedAt,
    customer,
    paymentMethod,
    paymentReference,
    paymentType:
      activeReceipt?.payment_type ||
      activeReceipt?.paymentType ||
      'payment',
    recordId,
    transactionLabel,
    order,
    booking,
    invoice,
    payments: (payments || []).map(normalizePayment),
  };
}

function getStatusDetails(status) {
  const value = String(status || '').toLowerCase();

  if (['paid', 'issued', 'completed'].includes(value)) {
    return {
      label: 'PAID',
      modalClass:
        'bg-green-50 text-green-700 ring-green-200',
      printClass: 'status-paid',
    };
  }

  if (
    ['partial', 'partially_paid', 'partially paid'].includes(
      value
    )
  ) {
    return {
      label: 'PARTIALLY PAID',
      modalClass:
        'bg-yellow-50 text-yellow-700 ring-yellow-200',
      printClass: 'status-partial',
    };
  }

  if (
    ['cancelled', 'refunded', 'returned', 'void'].includes(
      value
    )
  ) {
    return {
      label: formatLabel(value).toUpperCase(),
      modalClass:
        'bg-red-50 text-red-700 ring-red-200',
      printClass: 'status-cancelled',
    };
  }

  return {
    label: 'UNPAID',
    modalClass:
      'bg-red-50 text-red-700 ring-red-200',
    printClass: 'status-unpaid',
  };
}

function buildProfessionalDocumentHtml(data) {
  const status = getStatusDetails(data.status);

  const itemRows = data.displayItems
    .map(
      (item, index) => `
        <tr>
          <td class="line-number">${index + 1}</td>
          <td>
            <div class="item-name">${escapeHtml(item.label)}</div>
            ${
              item.description
                ? `<div class="item-description">${escapeHtml(
                    formatLabel(item.description)
                  )}</div>`
                : ''
            }
          </td>
          <td class="center">${item.quantity}</td>
          <td class="money">${formatPeso(item.unitPrice)}</td>
          <td class="money strong">${formatPeso(item.lineTotal)}</td>
        </tr>
      `
    )
    .join('');

  const paymentRows = data.payments
    .filter(
      (payment) =>
        String(payment.payment_type || '').toLowerCase() !==
        'refund'
    )
    .map(
      (payment) => `
        <div class="payment-row">
          <div>
            <strong>${escapeHtml(
              payment.receipt_number || 'Receipt pending'
            )}</strong>
            <span>
              ${escapeHtml(formatLabel(payment.payment_type))}
              · ${escapeHtml(formatLabel(payment.method))}
            </span>
          </div>
          <div class="payment-row-right">
            <strong>${formatPeso(payment.amount)}</strong>
            <span>${formatDateTime(
              payment.receipt_issued_at
            )}</span>
          </div>
        </div>
      `
    )
    .join('');

  const recordDetails = data.order
    ? `
        <div class="detail-row">
          <span>Order ID</span>
          <strong>${escapeHtml(
            String(data.order.id || '').slice(0, 8).toUpperCase()
          )}</strong>
        </div>
        <div class="detail-row">
          <span>Fulfillment</span>
          <strong>${escapeHtml(
            formatLabel(data.order.fulfillment_method || 'pickup')
          )}</strong>
        </div>
        ${
          data.order.delivery_address
            ? `
              <div class="detail-row">
                <span>Address</span>
                <strong>${escapeHtml(
                  data.order.delivery_address
                )}</strong>
              </div>
            `
            : ''
        }
      `
    : data.booking
      ? `
          <div class="detail-row">
            <span>Booking ID</span>
            <strong>${escapeHtml(
              String(data.booking.id || '')
                .slice(0, 8)
                .toUpperCase()
            )}</strong>
          </div>
          <div class="detail-row">
            <span>Schedule</span>
            <strong>
              ${escapeHtml(
                formatDate(data.booking.booking_date)
              )}
              ${escapeHtml(
                String(data.booking.booking_time || '').slice(0, 5)
              )}
            </strong>
          </div>
          <div class="detail-row">
            <span>Motorcycle</span>
            <strong>${escapeHtml(
              data.booking.motorcycle_model ||
                data.booking.motorcycleModel ||
                '—'
            )}</strong>
          </div>
          <div class="detail-row">
            <span>Mechanic</span>
            <strong>${escapeHtml(
              getMechanicName(data.booking)
            )}</strong>
          </div>
        `
      : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />

        <title>${escapeHtml(data.documentNumber)}</title>

        <style>
          @page {
            size: A4 portrait;
            margin: 10mm;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #111827;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            line-height: 1.45;
          }

          .page {
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
          }

          .document-card {
            overflow: hidden;
            border: 1px solid #d1d5db;
            border-radius: 16px;
            background: #ffffff;
          }

          .accent {
            height: 7px;
            background: linear-gradient(
              90deg,
              #db2777 0%,
              #ec4899 50%,
              #f59e0b 100%
            );
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 24px;
            border-bottom: 1px solid #e5e7eb;
            padding: 23px 25px 19px;
          }

          .brand {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .brand-mark {
            display: grid;
            width: 48px;
            height: 48px;
            place-items: center;
            border-radius: 14px;
            background: #fce7f3;
            color: #db2777;
            font-size: 18px;
            font-weight: 900;
          }

          .brand-name {
            margin: 0;
            font-size: 27px;
            font-weight: 900;
            letter-spacing: -0.04em;
          }

          .brand-name span {
            color: #db2777;
          }

          .brand-subtitle {
            margin: 2px 0 0;
            color: #6b7280;
            font-size: 10px;
            font-weight: 700;
          }

          .document-heading {
            min-width: 255px;
            text-align: right;
          }

          .document-heading h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 900;
            letter-spacing: 0.08em;
          }

          .document-number {
            margin-top: 5px;
            color: #db2777;
            font-family: Consolas, Monaco, monospace;
            font-size: 13px;
            font-weight: 900;
            overflow-wrap: anywhere;
          }

          .issued-at {
            margin-top: 3px;
            color: #6b7280;
            font-size: 10px;
          }

          .status {
            display: inline-flex;
            margin-top: 8px;
            border: 1px solid;
            border-radius: 999px;
            padding: 5px 10px;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 0.08em;
          }

          .status-paid {
            border-color: #86efac;
            background: #f0fdf4;
            color: #166534;
          }

          .status-partial {
            border-color: #fde68a;
            background: #fffbeb;
            color: #92400e;
          }

          .status-unpaid,
          .status-cancelled {
            border-color: #fecaca;
            background: #fef2f2;
            color: #991b1b;
          }

          .content {
            padding: 21px 25px 25px;
          }

          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 13px;
            margin-bottom: 20px;
          }

          .info-card {
            min-height: 130px;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            background: #f9fafb;
            padding: 14px 15px;
          }

          .info-title {
            margin: 0 0 9px;
            color: #9ca3af;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }

          .detail-row {
            display: grid;
            grid-template-columns: 90px minmax(0, 1fr);
            gap: 10px;
            margin-top: 6px;
          }

          .detail-row span {
            color: #6b7280;
            font-size: 10px;
            font-weight: 700;
          }

          .detail-row strong {
            min-width: 0;
            color: #111827;
            font-size: 10px;
            overflow-wrap: anywhere;
            text-align: right;
          }

          .section-title {
            margin: 0 0 8px;
            font-size: 11px;
            font-weight: 900;
            letter-spacing: 0.05em;
            text-transform: uppercase;
          }

          table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            overflow: hidden;
            border: 1px solid #d1d5db;
            border-radius: 12px;
          }

          thead {
            display: table-header-group;
          }

          th {
            border-bottom: 1px solid #d1d5db;
            background: #111827;
            color: #ffffff;
            padding: 9px 8px;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 0.05em;
            text-align: left;
            text-transform: uppercase;
          }

          td {
            border-bottom: 1px solid #e5e7eb;
            padding: 9px 8px;
            vertical-align: top;
          }

          tbody tr:last-child td {
            border-bottom: 0;
          }

          tbody tr:nth-child(even) {
            background: #f9fafb;
          }

          .line-number {
            width: 32px;
            color: #9ca3af;
            text-align: center;
          }

          .item-name {
            font-weight: 800;
          }

          .item-description {
            margin-top: 2px;
            color: #6b7280;
            font-size: 9px;
          }

          .center {
            text-align: center;
          }

          .money {
            white-space: nowrap;
            text-align: right;
          }

          .strong {
            font-weight: 900;
          }

          .empty-row {
            padding: 22px !important;
            color: #6b7280;
            text-align: center;
            font-weight: 700;
          }

          .payments {
            margin-top: 18px;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            background: #f9fafb;
            padding: 13px 15px;
          }

          .payment-row {
            display: flex;
            justify-content: space-between;
            gap: 18px;
            border-bottom: 1px solid #e5e7eb;
            padding: 8px 0;
          }

          .payment-row:last-child {
            border-bottom: 0;
          }

          .payment-row strong,
          .payment-row span {
            display: block;
          }

          .payment-row span {
            margin-top: 2px;
            color: #6b7280;
            font-size: 9px;
          }

          .payment-row-right {
            white-space: nowrap;
            text-align: right;
          }

          .summary {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 325px;
            gap: 20px;
            align-items: end;
            margin-top: 19px;
          }

          .acknowledgment {
            border: 1px dashed #d1d5db;
            border-radius: 12px;
            padding: 13px;
            color: #6b7280;
            font-size: 10px;
          }

          .acknowledgment strong {
            color: #374151;
          }

          .totals {
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            background: #f9fafb;
            padding: 13px 15px;
          }

          .total-row {
            display: flex;
            justify-content: space-between;
            gap: 18px;
            padding: 5px 0;
            color: #4b5563;
          }

          .total-row strong {
            white-space: nowrap;
            color: #111827;
          }

          .grand-total {
            margin-top: 5px;
            border-top: 1px solid #d1d5db;
            padding-top: 10px;
            color: #111827;
            font-size: 15px;
            font-weight: 900;
          }

          .receipt-payment strong,
          .paid-to-date strong {
            color: #15803d;
          }

          .balance {
            margin-top: 4px;
            border-radius: 8px;
            background: ${
              data.balanceDue > 0 ? '#fffbeb' : '#f0fdf4'
            };
            padding: 8px 10px;
            color: ${
              data.balanceDue > 0 ? '#92400e' : '#166534'
            };
            font-weight: 900;
          }

          .balance strong {
            color: inherit;
          }

          .signature-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 38px;
            margin-top: 36px;
          }

          .signature {
            border-top: 1px solid #9ca3af;
            padding-top: 6px;
            color: #6b7280;
            font-size: 9px;
            text-align: center;
          }

          .footer {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            margin-top: 24px;
            border-top: 1px solid #e5e7eb;
            padding-top: 14px;
            color: #6b7280;
            font-size: 9px;
          }

          .footer strong {
            color: #374151;
          }

          .footer-reference {
            max-width: 250px;
            overflow-wrap: anywhere;
            text-align: right;
          }

          @media print {
            html,
            body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }

            .document-card,
            .info-card,
            .totals,
            tr,
            .payment-row {
              break-inside: avoid;
            }
          }
        </style>
      </head>

      <body>
        <main class="page">
          <article class="document-card">
            <div class="accent"></div>

            <header class="header">
              <div class="brand">
                <div class="brand-mark">MF</div>

                <div>
                  <h1 class="brand-name">Moto<span>Fix</span></h1>
                  <p class="brand-subtitle">
                    Motorcycle Service and Product Management
                  </p>
                </div>
              </div>

              <div class="document-heading">
                <h2>
                  ${
                    data.documentType === 'receipt'
                      ? 'OFFICIAL RECEIPT'
                      : 'CUSTOMER INVOICE'
                  }
                </h2>

                <div class="document-number">
                  ${escapeHtml(data.documentNumber)}
                </div>

                <div class="issued-at">
                  ${formatDateTime(
                    data.issuedAt ||
                      new Date().toISOString()
                  )}
                </div>

                <span class="status ${status.printClass}">
                  ${status.label}
                </span>
              </div>
            </header>

            <div class="content">
              <section class="info-grid">
                <div class="info-card">
                  <p class="info-title">Customer Information</p>

                  <div class="detail-row">
                    <span>Name</span>
                    <strong>${escapeHtml(data.customer.name)}</strong>
                  </div>

                  <div class="detail-row">
                    <span>Phone</span>
                    <strong>${escapeHtml(data.customer.phone)}</strong>
                  </div>

                  <div class="detail-row">
                    <span>Email</span>
                    <strong>${escapeHtml(data.customer.email)}</strong>
                  </div>

                  <div class="detail-row">
                    <span>Reference ID</span>
                    <strong>${escapeHtml(
                      String(data.recordId || '')
                        .slice(0, 8)
                        .toUpperCase()
                    )}</strong>
                  </div>
                </div>

                <div class="info-card">
                  <p class="info-title">Transaction Information</p>

                  <div class="detail-row">
                    <span>Transaction</span>
                    <strong>${escapeHtml(data.transactionLabel)}</strong>
                  </div>

                  ${
                    data.documentType === 'receipt'
                      ? `
                        <div class="detail-row">
                          <span>Payment Type</span>
                          <strong>${escapeHtml(
                            formatLabel(data.paymentType)
                          )}</strong>
                        </div>

                        <div class="detail-row">
                          <span>Method</span>
                          <strong>${escapeHtml(
                            formatLabel(data.paymentMethod)
                          )}</strong>
                        </div>

                        <div class="detail-row">
                          <span>Payment Ref.</span>
                          <strong>${escapeHtml(
                            data.paymentReference
                          )}</strong>
                        </div>
                      `
                      : `
                        <div class="detail-row">
                          <span>Due Date</span>
                          <strong>${escapeHtml(
                            formatDate(
                              data.invoice?.due_date ||
                                data.invoice?.dueDate
                            )
                          )}</strong>
                        </div>
                      `
                  }

                  ${recordDetails}
                </div>
              </section>

              <section>
                <h3 class="section-title">Items and Services</h3>

                <table>
                  <thead>
                    <tr>
                      <th style="width:32px;">#</th>
                      <th>Item / Service</th>
                      <th style="width:50px;text-align:center;">Qty</th>
                      <th style="width:105px;text-align:right;">Unit Price</th>
                      <th style="width:110px;text-align:right;">Line Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${
                      itemRows ||
                      `
                        <tr>
                          <td class="empty-row" colspan="5">
                            No line items were recorded.
                          </td>
                        </tr>
                      `
                    }
                  </tbody>
                </table>
              </section>

              ${
                data.documentType === 'invoice' && paymentRows
                  ? `
                    <section class="payments">
                      <h3 class="section-title">Payments Applied</h3>
                      ${paymentRows}
                    </section>
                  `
                  : ''
              }

              <section class="summary">
                <div>
                  <div class="acknowledgment">
                    <strong>
                      ${
                        data.documentType === 'receipt'
                          ? 'Payment acknowledgment:'
                          : 'Invoice notice:'
                      }
                    </strong><br />

                    ${
                      data.documentType === 'receipt'
                        ? 'This document confirms the payment recorded by MotoFix. Keep it for payment verification, warranty, and future service reference.'
                        : 'This document summarizes the items, payments, and remaining balance recorded by MotoFix.'
                    }
                  </div>

                  <div class="signature-grid">
                    <div class="signature">Customer Signature</div>
                    <div class="signature">Authorized MotoFix Staff</div>
                  </div>
                </div>

                <div class="totals">
                  <div class="total-row">
                    <span>Items Subtotal</span>
                    <strong>${formatPeso(data.itemSubtotal)}</strong>
                  </div>

                  <div class="total-row grand-total">
                    <span>Total Amount</span>
                    <strong>${formatPeso(data.totalAmount)}</strong>
                  </div>

                  ${
                    data.documentType === 'receipt'
                      ? `
                        <div class="total-row receipt-payment">
                          <span>This Payment</span>
                          <strong>${formatPeso(
                            data.receiptAmount
                          )}</strong>
                        </div>
                      `
                      : ''
                  }

                  <div class="total-row paid-to-date">
                    <span>Paid To Date</span>
                    <strong>${formatPeso(data.paidToDate)}</strong>
                  </div>

                  <div class="total-row balance">
                    <span>Balance Due</span>
                    <strong>${formatPeso(data.balanceDue)}</strong>
                  </div>
                </div>
              </section>

              <footer class="footer">
                <div>
                  <strong>Thank you for choosing MotoFix.</strong><br />
                  Reliable motorcycle service, repairs, and parts.
                </div>

                <div class="footer-reference">
                  System-generated
                  ${
                    data.documentType === 'receipt'
                      ? 'official receipt'
                      : 'invoice'
                  }<br />
                  ${escapeHtml(data.documentNumber)}
                </div>
              </footer>
            </div>
          </article>
        </main>

        <script>
          window.addEventListener('load', function () {
            window.focus();

            window.setTimeout(function () {
              window.print();
            }, 250);
          });

          window.addEventListener('afterprint', function () {
            window.close();
          });
        </script>
      </body>
    </html>
  `;
}

export default function InvoiceReceiptModal({
  isOpen,
  type = 'invoice',
  invoice = null,
  receipt = null,
  payment = null,
  payments = [],
  order = null,
  booking = null,
  customerName = 'Customer',
  customerPhone = '',
  customerEmail = '',
  items = [],
  onClose,
}) {
  const visible =
    isOpen ?? Boolean(invoice || receipt || payment);

  useEffect(() => {
    if (!visible) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = Math.max(
      window.innerWidth -
        document.documentElement.clientWidth,
      0
    );

    document.body.style.overflow = 'hidden';

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight =
        previousPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, visible]);

  if (!visible) return null;

  const data = getDocumentData({
    type,
    invoice,
    receipt,
    payment,
    payments,
    order,
    booking,
    customerName,
    customerPhone,
    customerEmail,
    items,
  });

  const status = getStatusDetails(data.status);

  function handlePrint() {
    const printWindow = window.open(
      '',
      '_blank',
      'width=900,height=950'
    );

    if (!printWindow) {
      window.alert(
        'Please allow pop-ups to print the document.'
      );
      return;
    }

    printWindow.document.open();
    printWindow.document.write(
      buildProfessionalDocumentHtml(data)
    );
    printWindow.document.close();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-document-modal-title"
        className="relative mx-auto overflow-hidden rounded-3xl border border-gray-200 bg-white text-gray-950 shadow-2xl"
        style={{
          width: 'min(calc(100vw - 32px), 760px)',
          maxWidth: 760,
          maxHeight: 'calc(100dvh - 32px)',
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-white/95 p-5 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-pink-600">
              {data.documentType === 'receipt'
                ? 'Official Receipt'
                : 'Customer Invoice'}
            </p>

            <h2
              id="admin-document-modal-title"
              className="mt-1 break-all text-lg font-black"
            >
              {data.documentNumber}
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              {formatDateTime(
                data.issuedAt || new Date().toISOString()
              )}
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            <span
              className={`hidden rounded-full px-3 py-1 text-[10px] font-black ring-1 sm:inline-flex ${status.modalClass}`}
            >
              {status.label}
            </span>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close invoice or receipt"
              className="grid h-9 w-9 place-items-center rounded-xl border border-gray-200 bg-gray-50 text-lg font-black text-gray-500 transition hover:bg-gray-100 hover:text-gray-950"
            >
              ×
            </button>
          </div>
        </header>

        <div
          className="overflow-y-auto p-5"
          style={{
            maxHeight: 'calc(100dvh - 126px)',
          }}
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                Customer
              </p>

              <p className="mt-2 break-words text-sm font-black">
                {data.customer.name}
              </p>

              <p className="mt-1 break-words text-xs text-gray-500">
                {data.customer.phone}
              </p>

              <p className="break-words text-xs text-gray-500">
                {data.customer.email}
              </p>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                Transaction
              </p>

              <p className="mt-2 text-sm font-black">
                {data.transactionLabel}
              </p>

              {data.documentType === 'receipt' ? (
                <>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatLabel(data.paymentMethod)}
                  </p>

                  <p className="break-all text-xs text-gray-500">
                    Ref: {data.paymentReference}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-gray-500">
                  Balance: {formatPeso(data.balanceDue)}
                </p>
              )}
            </section>
          </div>

          <div className="mb-4 overflow-x-auto rounded-2xl border border-gray-200">
            <table className="min-w-[620px] divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-wider text-gray-500">
                    Item / Service
                  </th>
                  <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-wider text-gray-500">
                    Qty
                  </th>
                  <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-wider text-gray-500">
                    Unit
                  </th>
                  <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-wider text-gray-500">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {data.displayItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan="4"
                      className="px-3 py-8 text-center text-sm font-semibold text-gray-500"
                    >
                      No line items available.
                    </td>
                  </tr>
                ) : (
                  data.displayItems.map((item) => (
                    <tr key={item.id}>
                      <td className="max-w-[280px] break-words px-3 py-3">
                        <p className="font-black">
                          {item.label}
                        </p>

                        {item.description && (
                          <p className="mt-1 text-xs text-gray-500">
                            {formatLabel(item.description)}
                          </p>
                        )}
                      </td>

                      <td className="px-3 py-3 text-center font-semibold">
                        {item.quantity}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold">
                        {formatPeso(item.unitPrice)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-right font-black">
                        {formatPeso(item.lineTotal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data.documentType === 'invoice' &&
            data.payments.length > 0 && (
              <section className="mb-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Payments Applied
                </p>

                <div className="space-y-2">
                  {data.payments
                    .filter(
                      (item) =>
                        String(
                          item.payment_type || ''
                        ).toLowerCase() !== 'refund'
                    )
                    .map((item, index) => (
                      <div
                        key={
                          item.id ||
                          `${item.receipt_number}-${index}`
                        }
                        className="flex justify-between gap-4 border-b border-gray-200 pb-2 text-xs last:border-0 last:pb-0"
                      >
                        <span className="min-w-0 break-words text-gray-600">
                          {item.receipt_number ||
                            'Receipt pending'}{' '}
                          · {formatLabel(item.payment_type)}
                        </span>

                        <strong className="whitespace-nowrap">
                          {formatPeso(item.amount)}
                        </strong>
                      </div>
                    ))}
                </div>
              </section>
            )}

          <section className="ml-auto mb-5 max-w-sm space-y-2 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">
                Total Amount
              </span>
              <strong>{formatPeso(data.totalAmount)}</strong>
            </div>

            {data.documentType === 'receipt' && (
              <div className="flex justify-between gap-4 text-green-700">
                <span className="font-bold">
                  This Payment
                </span>
                <strong>
                  {formatPeso(data.receiptAmount)}
                </strong>
              </div>
            )}

            <div className="flex justify-between gap-4 text-green-700">
              <span className="font-bold">
                Paid To Date
              </span>
              <strong>{formatPeso(data.paidToDate)}</strong>
            </div>

            <div className="flex justify-between gap-4 border-t border-gray-200 pt-2 text-base">
              <span className="font-black">
                Balance Due
              </span>

              <strong
                className={
                  data.balanceDue > 0
                    ? 'text-yellow-700'
                    : 'text-green-700'
                }
              >
                {formatPeso(data.balanceDue)}
              </strong>
            </div>
          </section>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              className="order-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 transition hover:bg-gray-50 sm:order-1"
            >
              Close
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="order-1 rounded-2xl bg-pink-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-pink-600/20 transition hover:bg-pink-700 sm:order-2"
            >
              Print / Save PDF
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
