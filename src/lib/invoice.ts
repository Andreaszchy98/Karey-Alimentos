import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Order } from '../types';

export const generateInvoicePDF = (order: Order) => {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(20);
  doc.setTextColor(220, 38, 38); // red-600
  doc.text('FACTURA DE COMPRA', 105, 20, { align: 'center' });

  // Company Info
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('KAREY ALIMENTOS', 20, 35);
  doc.text('Karey Alimentos S.A. de C.V.', 20, 40);
  doc.text('RFC: KAL840101XYZ', 20, 45); // RFC Karey Alimentos
  doc.text('Toma de Torreón 2220, Francisco Villa, 82127 Mazatlán, Sin.', 20, 50);

  // Order Info
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text(`Pedido ID: #${order.id.toUpperCase()}`, 20, 65);
  
  const date = order.createdAt?.seconds 
    ? new Date(order.createdAt.seconds * 1000).toLocaleString() 
    : new Date().toLocaleString();
  doc.text(`Fecha: ${date}`, 20, 72);
  doc.text(`Estado: ${order.status.toUpperCase()}`, 20, 79);

  // Customer Info
  doc.setFontSize(11);
  doc.text('CLIENTE:', 140, 65);
  doc.setFontSize(10);
  doc.text(order.userName, 140, 72);
  doc.text(order.userEmail, 140, 77);
  if (order.userPhone) doc.text(order.userPhone, 140, 82);
  doc.text('Dirección:', 140, 89);
  doc.setFontSize(9);
  const splitAddress = doc.splitTextToSize(order.address, 50);
  doc.text(splitAddress, 140, 94);

  const tableStartY = Math.max(115, 94 + (splitAddress.length * 5));

  // Table
  const tableData = order.items.map(item => {
    const unitLabel = item.unit === 'Kg' ? 'Kg' : 'Paq';
    let detail = '';
    if (item.unit === 'Kg') {
      const weight = item.loaderWeight || item.preparerWeight;
      detail = weight ? `${item.quantity} pza(s) - ${weight.toFixed(2)} Kg` : `${item.quantity} pza(s) - Pend.`;
    } else {
      detail = `${item.quantity} ${unitLabel}`;
    }

    const nameWithDescription = item.name; // Could add description if we had it in OrderItem, but OrderItem only has productId, name, quantity, price, unit, etc.

    return [
      nameWithDescription,
      detail,
      `$${item.price.toFixed(2)} / ${unitLabel}`,
      `$${(item.unit === 'Kg' 
        ? item.price * (item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0))
        : item.price * item.quantity).toFixed(2)}`
    ];
  });

  autoTable(doc, {
    startY: tableStartY,
    head: [['Producto', 'Cant / Peso', 'Precio Unit.', 'Subtotal']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [220, 38, 38] },
    margin: { top: tableStartY }
  });

  // Totals
  const finalY = (doc as any).lastAutoTable.finalY || 115;
  const targetTotal = order.adjustedTotal ?? order.total;
  const returnDiscount = order.hasReturns ? (order.total - targetTotal) : 0;
  const subtotal = targetTotal / 1.16;
  const iva = targetTotal - subtotal;
  const deliveryFee = order.deliveryFee || 0;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  let currentY = finalY + 10;

  doc.text(`Subtotal Original:`, 140, currentY);
  doc.text(`$${order.total.toFixed(2)}`, 190, currentY, { align: 'right' });

  if (order.hasReturns) {
    currentY += 6;
    doc.setTextColor(200, 0, 0); // specialized red for discount
    doc.text(`Descuento Devolución:`, 140, currentY);
    doc.text(`-$${returnDiscount.toFixed(2)}`, 190, currentY, { align: 'right' });
    doc.setTextColor(0);
  }
  
  currentY += 6;
  doc.text(`IVA Incluido (16%):`, 140, currentY);
  doc.text(`$${iva.toFixed(2)}`, 190, currentY, { align: 'right' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL FINAL: $${targetTotal.toFixed(2)}`, 190, currentY + 10, { align: 'right' });

  // Payment Info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Método de Pago: ${order.paymentMethod === 'card' ? 'Tarjeta' : 'Efectivo'}`, 20, finalY + 10);
  doc.text(`Estado del Pago: ${order.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'}`, 20, finalY + 15);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Gracias por su compra. Esta es una factura generada automáticamente.', 105, 285, { align: 'center' });

  // Save
  doc.save(`Factura_${order.id.slice(-6).toUpperCase()}.pdf`);
};
