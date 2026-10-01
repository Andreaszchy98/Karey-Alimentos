# Sincronizador Microsip -> Karey Alimentos (Firebase Firestore)

Este script permite sincronizar de forma automática o programada las existencias reales de inventario desde **Microsip** (base de datos Firebird `.FDB`) hacia la base de datos de tu aplicación en la nube (**Firebase Firestore**).

---

## 📁 Archivos incluidos

- `sync_microsip.py`: Script principal en Python de sincronización por lotes.
- `config.example.json`: Plantilla de configuración con la conexión a Firebird y Firebase.
- `requirements.txt`: Librerías de Python requeridas.
- `run_sync.bat`: Acceso directo para ejecutar la sincronización en Windows con doble clic.

---

## 🚀 Pasos de Instalación y Configuración

### 1. Requisitos Previos en el Servidor o PC de Microsip
1. Tener **Python 3.9 o superior** instalado en Windows (asegúrate de marcar la casilla *"Add python.exe to PATH"* durante la instalación).
2. Abrir la terminal (CMD o PowerShell) en esta carpeta y ejecutar:
   ```cmd
   pip install -r requirements.txt
   ```

---

### 2. Descargar la Clave de Firebase (`serviceAccountKey.json`)
Para que el script pueda escribir en tu base de datos de Firebase:
1. Ingresa a [Firebase Console](https://console.firebase.google.com/project/gen-lang-client-0507212703/settings/serviceaccounts/adminsdk).
2. Haz clic en el botón **"Generar nueva clave privada"** (Generate new private key).
3. Se descargará un archivo `.json`. Cámbiale el nombre a `serviceAccountKey.json` y colócalo en esta misma carpeta junto a `sync_microsip.py`.

---

### 3. Configurar la Conexión (`config.json`)
Copia `config.example.json` y renómbralo a `config.json`. Ajusta los parámetros:

```json
{
  "firebird": {
    "host": "localhost",
    "port": 3050,
    "database": "C:\\Microsip datos\\KAREY_ALIMENTOS.FDB",
    "user": "SYSDBA",
    "password": "masterkey",
    "charset": "ISO8859_1",
    "almacen_id": null
  },
  "firebase": {
    "service_account_path": "./serviceAccountKey.json",
    "project_id": "gen-lang-client-0507212703",
    "database_id": "ai-studio-665af4d4-475a-445e-90c2-f2eb75e75d14"
  },
  "sync_options": {
    "update_stock": true,
    "update_price": false,
    "interval_minutes": 10
  }
}
```

* **`database`**: La ruta al archivo `.FDB` de tu empresa en Microsip (ej. `C:\Microsip datos\EMPRESA.FDB`).
* **`almacen_id`**: Si quieres filtrar solo las existencias de un almacén específico (ej. Almacén Central), pon el ID numérico. Si pones `null`, sumará las existencias de todos los almacenes.
* **`interval_minutes`**: Cada cuántos minutos repetirá la sincronización en modo automático.

---

## ⚡ Modos de Ejecución

### Modo A: Doble Clic (Bucle Continuo)
Simplemente haz doble clic en el archivo **`run_sync.bat`**. Mantendrá una ventana abierta sincronizando el inventario cada N minutos automáticamente.

### Modo B: Tarea Programada de Windows (Ideal para Servidores)
Para que se ejecute en segundo plano sin ventanas abiertas:
1. Abre el **Programador de tareas de Windows** (`taskschd.msc`).
2. Crea una **Tarea Básica** llamada `Sincronizar Microsip Karey`.
3. Desencadenador: **Diariamente**, repetir cada **10 minutos**.
4. Acción: **Iniciar un programa**.
   - Programa o script: `python.exe`
   - Argumentos: `C:\ruta\al\script\sync_microsip.py`
   - Iniciar en: `C:\ruta\al\script\`

### Modo C: Sincronización Manual por Archivo CSV / Excel
Si aún no configuras la red de Firebird y quieres probar con un reporte exportado desde Microsip:
```cmd
python sync_microsip.py --csv reporte_existencias.csv
```
*(El archivo solo necesita tener una columna con la Clave/Código y otra con la Existencia).*

---

## 🛡️ Seguridad y Rendimiento
- **Escrituras inteligentes:** El script solo actualiza los productos cuyo stock haya cambiado en Microsip, evitando consumo innecesario de cuota en Firebase.
- **Transacciones por lotes:** Aplica las modificaciones en bloques de 400 productos por segundo.
- **Acceso seguro:** Solo lee datos de Microsip (`SELECT`), no modifica ninguna tabla interna de Microsip.
