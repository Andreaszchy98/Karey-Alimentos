import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Button } from '../../components/ui';
import { Order } from '../../types';

export function StoreTicketView({ order, onDone }: { order: Order; onDone: () => void }) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadTicket = async () => {
    if (!ticketRef.current) return;
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(ticketRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          const styleOverride = clonedDoc.createElement('style');
          styleOverride.innerHTML = `
            * {
              -webkit-print-color-adjust: exact;
            }
            #thermal-ticket-content, #thermal-ticket-content * {
              color: #000000 !important;
              background-color: #ffffff !important;
              border-color: #000000 !important;
              box-shadow: none !important;
              text-shadow: none !important;
            }
            .thermal-bold {
              font-weight: 900 !important;
            }
          `;
          clonedDoc.head.appendChild(styleOverride);
          clonedDoc.querySelectorAll('button').forEach(btn => btn.remove());
            
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach(el => {
            const htmlEl = el as HTMLElement;
            const inlineStyle = htmlEl.getAttribute('style') || '';
            if (inlineStyle.includes('oklch')) {
              if (htmlEl.style.color.includes('oklch')) htmlEl.style.color = '#000000';
              if (htmlEl.style.backgroundColor.includes('oklch')) htmlEl.style.backgroundColor = '#ffffff';
              if (htmlEl.style.borderColor.includes('oklch')) htmlEl.style.borderColor = '#000000';
            }

            try {
              const style = window.getComputedStyle(htmlEl);
              if (style.color.includes('oklch')) htmlEl.style.setProperty('color', '#000000', 'important');
              if (style.backgroundColor.includes('oklch')) htmlEl.style.setProperty('background-color', '#ffffff', 'important');
              if (style.borderColor.includes('oklch')) htmlEl.style.setProperty('border-color', '#000000', 'important');
            } catch {}
          });
        }
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, 160]
      });
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`TICKET-${order.id.slice(-6).toUpperCase()}.pdf`);
    } catch (error) {
      console.error("Error al generar PDF térmico:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-md mx-auto space-y-6 pb-20"
    >
      <div 
        ref={ticketRef} 
        id="thermal-ticket-content"
        className="mx-auto w-[300px] bg-white p-4 border border-gray-100 shadow-sm font-mono text-black"
        style={{ color: '#000000', backgroundColor: '#ffffff', borderColor: '#e5e7eb' }}
      >
        <div className="text-center space-y-1 mb-4 border-b border-black pb-4">
          <h1 className="text-xl font-black uppercase tracking-tighter thermal-bold">KAREY ALIMENTOS</h1>
          <p className="text-[10px] leading-tight font-bold">Karey Alimentos S.A. de C.V.</p>
          <p className="text-[9px]">Calle toma de torreón 2220</p>
          <p className="text-[9px]">Col. Francisco Villa, C.P. 82127</p>
        </div>

        <div className="space-y-1 mb-4 text-[11px]">
          <div className="flex justify-between">
            <span className="font-bold">ORDEN:</span>
            <span>#{order.id.slice(-6).toUpperCase()}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold">FECHA:</span>
            <span>{new Date().toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold">CLIENTE:</span>
            <span className="uppercase">{order.userName}</span>
          </div>
        </div>

        <div className="border-t border-b border-black border-dashed py-2 mb-4">
          <div className="grid grid-cols-[1fr_2fr_1fr] text-[10px] font-bold mb-1 border-b border-black pb-1">
            <span>CANT</span>
            <span>PRODUCTO</span>
            <span className="text-right">TOTAL</span>
          </div>
          <div className="space-y-1 pt-1">
            {order.items.map((item, i) => {
              const itemTotal = item.unit === 'Kg' 
                ? (item.price * (item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0)))
                : (item.price * item.quantity);
              
              return (
                <div key={i} className="grid grid-cols-[1fr_2fr_1fr] text-[10px] leading-tight items-start">
                  <span>{item.quantity}{item.unit === 'Kg' ? 'kg' : 'pz'}</span>
                  <div className="flex flex-col">
                    <span className="font-bold uppercase">{item.name}</span>
                    {item.unit === 'Kg' && (item.loaderWeight || item.preparerWeight) && (
                      <span className="text-[8px] italic">Surtido: {item.loaderWeight || item.preparerWeight}kg</span>
                    )}
                  </div>
                  <span className="text-right">${itemTotal.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-1 mb-6">
          <div className="flex justify-between text-[11px]">
            <span>SUBTOTAL</span>
            <span>${(order.adjustedTotal ?? order.total).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-black border-t border-black pt-1 thermal-bold">
            <span>TOTAL</span>
            <span>${(order.adjustedTotal ?? order.total).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-[9px] pt-1">
            <span>METODO PAGO:</span>
            <span className="uppercase font-bold">{order.paymentMethod === 'cash' ? 'EFECTIVO' : 'TARJETA'}</span>
          </div>
        </div>

        <div className="text-center pt-2 space-y-1 border-t border-dashed border-black mt-2">
          <div className="py-1 flex items-center justify-center border border-black text-[10px] font-bold uppercase mb-1 mt-2">
            PAGADO - GRACIAS
          </div>
          <p className="text-[8px] italic text-gray-400">Este no es un comprobante fiscal</p>
        </div>
      </div>

      <div className="space-y-3 px-4">
        <Button 
          onClick={downloadTicket}
          disabled={isDownloading}
          className="w-full h-14 bg-black hover:bg-zinc-800 text-white rounded-2xl font-bold flex items-center justify-center gap-2"
        >
          {isDownloading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Download className="w-5 h-5" />
              Descargar Ticket PDF (80mm)
            </>
          )}
        </Button>
        
        <Button 
          variant="outline"
          className="w-full h-14 rounded-2xl bg-gray-50 border-none font-bold text-gray-600"
          onClick={onDone}
        >
          Finalizar y Volver
        </Button>
      </div>

      <div className="text-center">
        <p className="text-xs text-gray-400">Gracias por su compra en Karey Alimentos</p>
      </div>
    </motion.div>
  );
}
