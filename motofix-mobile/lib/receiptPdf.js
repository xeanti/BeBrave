import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function peso(value) {
  const amount = Number(value) || 0;
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function humanize(value) {
  if (!value) return '—';

  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getOrderTotal(order) {
  const savedTotal = Number(order?.total_amount || 0);

  if (savedTotal > 0) return savedTotal;

  return (order?.order_items || []).reduce((sum, item) => {
    const unitPrice = Number(item.unit_price) || 0;
    const quantity = Number(item.quantity) || 0;
    const subtotal = Number(item.subtotal) || unitPrice * quantity;

    return sum + subtotal;
  }, 0);
}

function getPaymentTotal(payments = []) {
  return payments.reduce((sum, payment) => {
    const amount = Number(payment?.amount) || 0;

    if (String(payment?.payment_type || '').toLowerCase() === 'refund') {
      return sum - amount;
    }

    return sum + amount;
  }, 0);
}

function getReceiptNumber(order, payments = []) {
  if (order?.receipt_number) return order.receipt_number;

  const latestWithReceipt = [...payments]
    .reverse()
    .find((payment) => payment?.receipt_number);

  if (latestWithReceipt?.receipt_number) return latestWithReceipt.receipt_number;

  return `MFX-${String(order?.id || '').slice(0, 8).toUpperCase() || Date.now()}`;
}

function getCustomerName({ order, customerName }) {
  if (customerName) return customerName;

  const customer = order?.profiles || order?.customer;

  const name = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim();
  return name || customer?.email || 'Customer';
}

function buildItemsRows(items = []) {
  if (!items.length) {
    return `
      <tr>
        <td colspan="5" class="empty">No order items found.</td>
      </tr>
    `;
  }

  return items
    .map((item, index) => {
      const part = item.parts || {};
      const qty = Number(item.quantity) || 0;
      const unit = Number(item.unit_price) || Number(part.price) || 0;
      const subtotal = Number(item.subtotal) || unit * qty;

      return `
        <tr>
          <td>${index + 1}</td>
          <td>
            <strong>${escapeHtml(part.name || item.name || 'Part')}</strong>
            <div class="muted">${escapeHtml(part.category || 'General')}</div>
          </td>
          <td class="right">${qty}</td>
          <td class="right">${peso(unit)}</td>
          <td class="right">${peso(subtotal)}</td>
        </tr>
      `;
    })
    .join('');
}

function buildPaymentRows(payments = []) {
  if (!payments.length) {
    return `
      <tr>
        <td colspan="5" class="empty">No payment records yet.</td>
      </tr>
    `;
  }

  return payments
    .map((payment, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(humanize(payment.payment_type || 'payment'))}</td>
          <td>${escapeHtml(humanize(payment.method || 'cash'))}</td>
          <td>${escapeHtml(payment.receipt_number || '—')}</td>
          <td class="right">${peso(payment.amount)}</td>
        </tr>
      `;
    })
    .join('');
}

function buildReceiptHtml({
  order,
  payments = [],
  customerName,
  shopName = 'MotoFix',
  shopSubtitle = 'Motorcycle Service and Parts',
  shopAddress = '',
  shopContact = '',
}) {
  const total = getOrderTotal(order);
  const totalPaid = Math.max(getPaymentTotal(payments), Number(order?.amount_paid || 0));
  const balance = Math.max(total - totalPaid, 0);
  const receiptNumber = getReceiptNumber(order, payments);
  const orderId = String(order?.id || '').slice(0, 8).toUpperCase();
  const paymentStatus =
    balance <= 0 || String(order?.payment_status || '').toLowerCase() === 'paid'
      ? 'Paid'
      : totalPaid > 0
        ? 'Partial'
        : 'Pending';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(shopName)} Receipt</title>
        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 28px;
            font-family: Arial, Helvetica, sans-serif;
            background: #f4f4f5;
            color: #111827;
          }

          .page {
            background: #ffffff;
            border-radius: 18px;
            padding: 28px;
            border: 1px solid #e5e7eb;
          }

          .header {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 3px solid #eab308;
            padding-bottom: 18px;
            margin-bottom: 22px;
          }

          .brand {
            font-size: 30px;
            font-weight: 900;
            letter-spacing: -0.7px;
            color: #111827;
          }

          .brand span {
            color: #eab308;
          }

          .subtitle {
            color: #6b7280;
            margin-top: 4px;
            font-size: 13px;
          }

          .receipt-title {
            text-align: right;
          }

          .receipt-title h1 {
            margin: 0;
            font-size: 24px;
            letter-spacing: 1px;
          }

          .receipt-no {
            color: #6b7280;
            font-size: 13px;
            margin-top: 6px;
          }

          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 22px;
          }

          .box {
            border: 1px solid #e5e7eb;
            border-radius: 14px;
            padding: 14px;
            background: #fafafa;
          }

          .box-title {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.7px;
            color: #6b7280;
            font-weight: 800;
            margin-bottom: 8px;
          }

          .line {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin: 5px 0;
            font-size: 13px;
          }

          .label {
            color: #6b7280;
          }

          .value {
            font-weight: 800;
            text-align: right;
          }

          .status {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 999px;
            background: #fef3c7;
            color: #92400e;
            font-size: 12px;
            font-weight: 900;
          }

          .status.paid {
            background: #dcfce7;
            color: #166534;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            margin-bottom: 22px;
          }

          th {
            text-align: left;
            background: #111827;
            color: #ffffff;
            font-size: 12px;
            padding: 10px;
          }

          td {
            border-bottom: 1px solid #e5e7eb;
            padding: 10px;
            font-size: 12px;
            vertical-align: top;
          }

          .right {
            text-align: right;
          }

          .muted {
            color: #6b7280;
            font-size: 11px;
            margin-top: 2px;
          }

          .empty {
            text-align: center;
            color: #6b7280;
            padding: 18px;
          }

          .summary {
            width: 42%;
            margin-left: auto;
            border: 1px solid #e5e7eb;
            border-radius: 14px;
            padding: 12px 14px;
            background: #fafafa;
          }

          .summary-row {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            font-size: 13px;
          }

          .summary-row.total {
            border-top: 1px solid #e5e7eb;
            padding-top: 10px;
            font-size: 17px;
            font-weight: 900;
          }

          .note {
            margin-top: 22px;
            padding: 13px;
            border-radius: 12px;
            background: #fffbeb;
            color: #713f12;
            font-size: 12px;
            line-height: 18px;
          }

          .footer {
            margin-top: 26px;
            border-top: 1px solid #e5e7eb;
            padding-top: 14px;
            color: #6b7280;
            font-size: 11px;
            text-align: center;
          }

          @media print {
            body {
              background: #fff;
              padding: 0;
            }

            .page {
              border: none;
              border-radius: 0;
            }
          }
        </style>
      </head>

      <body>
        <div class="page">
          <div class="header">
            <div>
              <div class="brand">Moto<span>Fix</span></div>
              <div class="subtitle">${escapeHtml(shopSubtitle)}</div>
              ${shopAddress ? `<div class="subtitle">${escapeHtml(shopAddress)}</div>` : ''}
              ${shopContact ? `<div class="subtitle">${escapeHtml(shopContact)}</div>` : ''}
            </div>

            <div class="receipt-title">
              <h1>RECEIPT</h1>
              <div class="receipt-no">${escapeHtml(receiptNumber)}</div>
            </div>
          </div>

          <div class="grid">
            <div class="box">
              <div class="box-title">Customer</div>
              <div class="line">
                <span class="label">Name</span>
                <span class="value">${escapeHtml(getCustomerName({ order, customerName }))}</span>
              </div>
              <div class="line">
                <span class="label">Email</span>
                <span class="value">${escapeHtml(order?.profiles?.email || order?.customer?.email || '—')}</span>
              </div>
              <div class="line">
                <span class="label">Phone</span>
                <span class="value">${escapeHtml(order?.profiles?.phone || order?.customer?.phone || '—')}</span>
              </div>
            </div>

            <div class="box">
              <div class="box-title">Order</div>
              <div class="line">
                <span class="label">Order ID</span>
                <span class="value">#${escapeHtml(orderId || '—')}</span>
              </div>
              <div class="line">
                <span class="label">Date</span>
                <span class="value">${escapeHtml(formatDateTime(order?.created_at))}</span>
              </div>
              <div class="line">
                <span class="label">Order Status</span>
                <span class="value">${escapeHtml(humanize(order?.status || 'pending'))}</span>
              </div>
              <div class="line">
                <span class="label">Payment Status</span>
                <span class="status ${paymentStatus === 'Paid' ? 'paid' : ''}">${escapeHtml(paymentStatus)}</span>
              </div>
            </div>
          </div>

          <div class="box-title">Order Items</div>
          <table>
            <thead>
              <tr>
                <th style="width: 42px;">#</th>
                <th>Item</th>
                <th class="right">Qty</th>
                <th class="right">Unit Price</th>
                <th class="right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${buildItemsRows(order?.order_items || [])}
            </tbody>
          </table>

          <div class="box-title">Payment History</div>
          <table>
            <thead>
              <tr>
                <th style="width: 42px;">#</th>
                <th>Type</th>
                <th>Method</th>
                <th>Receipt No.</th>
                <th class="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${buildPaymentRows(payments)}
            </tbody>
          </table>

          <div class="summary">
            <div class="summary-row">
              <span>Order Total</span>
              <strong>${peso(total)}</strong>
            </div>
            <div class="summary-row">
              <span>Amount Paid</span>
              <strong>${peso(totalPaid)}</strong>
            </div>
            <div class="summary-row total">
              <span>Balance</span>
              <span>${peso(balance)}</span>
            </div>
          </div>

          <div class="note">
            This receipt is system-generated by MotoFix. Please keep a copy for your records.
            For questions about this receipt, contact the shop and provide the receipt number.
          </div>

          <div class="footer">
            Generated on ${escapeHtml(formatDateTime(new Date().toISOString()))}
          </div>
        </div>
      </body>
    </html>
  `;
}

function getPdfFilename(order, payments = []) {
  const receiptNumber = getReceiptNumber(order, payments)
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .slice(0, 50);

  return `${receiptNumber || 'MotoFix-Receipt'}.pdf`;
}

export async function createReceiptPdf({
  order,
  payments = [],
  customerName,
  shopName = 'MotoFix',
  shopSubtitle = 'Motorcycle Service and Parts',
  shopAddress = '',
  shopContact = '',
} = {}) {
  if (!order) {
    throw new Error('Missing order data for receipt.');
  }

  const html = buildReceiptHtml({
    order,
    payments,
    customerName,
    shopName,
    shopSubtitle,
    shopAddress,
    shopContact,
  });

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  const filename = getPdfFilename(order, payments);
  const targetUri = `${FileSystem.documentDirectory}${filename}`;

  try {
    await FileSystem.copyAsync({
      from: uri,
      to: targetUri,
    });

    return {
      uri: targetUri,
      filename,
    };
  } catch {
    return {
      uri,
      filename,
    };
  }
}

export async function shareReceiptPdf(options = {}) {
  const { uri, filename } = await createReceiptPdf(options);

  const canShare = await Sharing.isAvailableAsync();

  if (!canShare) {
    return {
      uri,
      filename,
      shared: false,
      message: 'Sharing is not available on this device.',
    };
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: filename,
    UTI: 'com.adobe.pdf',
  });

  return {
    uri,
    filename,
    shared: true,
  };
}

export async function saveReceiptPdf(options = {}) {
  const { uri, filename } = await createReceiptPdf(options);

  if (
    Platform.OS === 'android' &&
    FileSystem.StorageAccessFramework?.requestDirectoryPermissionsAsync
  ) {
    const permissions =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

    if (permissions.granted) {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const destinationUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        filename,
        'application/pdf'
      );

      await FileSystem.writeAsStringAsync(destinationUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return {
        uri: destinationUri,
        filename,
        savedToDownloads: true,
      };
    }
  }

  const canShare = await Sharing.isAvailableAsync();

  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Save ${filename}`,
      UTI: 'com.adobe.pdf',
    });
  }

  return {
    uri,
    filename,
    savedToDownloads: false,
  };
}
