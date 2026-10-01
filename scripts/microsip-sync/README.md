# Sincronizador Microsip -> Karey Alimentos (Firebase Firestore)

Módulo puente para sincronizar las existencias reales de inventario desde **Microsip** (base de datos Firebird `.FDB` o reportes Excel/CSV) hacia la base de datos de tu app en **Firebase Firestore**.

---

## 🔒 Seguridad
- **Archivos protegidos:** Tanto `serviceAccountKey.json` como `config.json` y archivos `.fdb`/`.csv` están protegidos en `.gitignore` para evitar que se suban a repositorios de código.
- **Usuario de Firebird:** Se recomienda encarecidamente crear un usuario de **solo lectura** en Firebird para este script (en lugar de `SYSDBA` con `masterkey`). El script únicamente requiere permisos `SELECT` sobre las tablas de artículos y existencias.

---

## 📁 Archivos del Paquete
- `sync_microsip.py`: Script principal de sincronización (admite `--dry-run`, `--file`, `--watch`).
- `config.example.json`: Plantilla de configuración.
- `requirements.txt`: Dependencias (`firebase-admin`, `firebird-driver`, `pandas`, `openpyxl`).
- `run_sync.bat`: Acceso directo para Windows.

---

## 🛠️ Instalación Rápida

1. Instalar dependencias en la máquina con Windows:
   ```cmd
   pip install -r requirements.txt
   ```
2. Obtener la clave de Firebase:
   - Descárgala desde [Firebase Console > Cuentas de servicio](https://console.firebase.google.com/project/gen-lang-client-0507212703/settings/serviceaccounts/adminsdk).
   - Guárdala como `serviceAccountKey.json` en esta misma carpeta.
3. Copiar `config.example.json` a `config.json` y ajustar la ruta de la base de datos o credenciales.

---

## 🧪 Pruebas Iniciales Recomendadas (Paso a Paso)

### Paso 1: Prueba de simulación con archivo exportado (Sin tocar Firebird)
Exporta un reporte de inventario desde Microsip a CSV o Excel y corre:
```cmd
python sync_microsip.py --file reporte_microsip.csv --dry-run
```
> **Nota:** El parámetro `--dry-run` solo simula. Te mostrará en pantalla cuántos artículos coincidieron por clave (SKU), cuáles no, y qué cambios se harían, **sin modificar un solo dato en Firestore**.

### Paso 2: Prueba de simulación directa contra Firebird
Una vez configurado `config.json` con la ruta a la base de datos `.FDB`:
```cmd
python sync_microsip.py --dry-run
```
Verifica en pantalla la muestra de 5 u 8 productos y compáralos contra la pantalla de Microsip Inventarios para asegurar que las existencias coinciden al 100%.

### Paso 3: Sincronización real
Una vez confirmada la coincidencia:
```cmd
python sync_microsip.py
```
O en bucle continuo:
```cmd
python sync_microsip.py --watch
```

---

## ⚠️ Aspectos de Diseño a Definir con el Cliente

1. **Dos fuentes de verdad para el stock:**
   - La app descuenta inventario en tiempo real cuando se levantan y entregan pedidos.
   - Si Microsip se sincroniza cada 10 minutos, pero en la oficina física aún no han capturado la factura o remisión del pedido, la sincronización volvería a inflar temporalmente el stock en la app.
   - *Recomendación:* Definir si Microsip es la autoridad absoluta (y el personal factura de inmediato), o si la app descuenta localmente y Microsip solo realiza ajustes de corte diario/turnos.
2. **Unidades de Medida:**
   - La app maneja `Kg`, `Paq`, `Pza`, además de cajas y piezas por jaba.
   - Hay que asegurar que la clave del artículo en Microsip corresponda a la misma unidad de venta en la app (por ejemplo, si en la app se vende por Kg, que en Microsip la existencia esté en Kg y no en paquetes).
3. **Existencias negativas:**
   - Si en Microsip se captura una venta sin existencia previa, el sistema puede registrar saldo negativo. El script emite una advertencia `[⚠️ AVISO NEGATIVO]` para identificar artículos con desajuste de captura en el ERP.
