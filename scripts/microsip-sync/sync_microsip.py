#!/usr/bin/env python3
"""
=============================================================================
Karey Alimentos - Sincronizador de Inventario Microsip -> Firebase Firestore
=============================================================================
Sincroniza existencias desde Microsip (Firebird SQL o archivo CSV/Excel) 
hacia la base de datos Firestore de Karey Alimentos.

Uso:
  python sync_microsip.py --dry-run             # Prueba segura: simula cambios sin escribir
  python sync_microsip.py                       # Ejecución real única
  python sync_microsip.py --watch               # Bucle continuo cada N minutos
  python sync_microsip.py --file reporte.csv    # Carga desde archivo CSV o Excel
  python sync_microsip.py --file reporte.xlsx --dry-run
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("[ERROR] Falta 'firebase-admin'. Ejecuta: pip install firebase-admin")
    sys.exit(1)


def load_config(config_path="config.json"):
    """Carga configuración con fallback a config.example.json"""
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    elif os.path.exists("config.example.json"):
        print("[AVISO] No se encontró 'config.json'. Usando 'config.example.json'.")
        with open("config.example.json", "r", encoding="utf-8") as f:
            return json.load(f)
    else:
        raise FileNotFoundError("No se encontró archivo de configuración (config.json).")


def init_firebase(cfg):
    """Inicializa la conexión con Firestore en la base de datos nombrada."""
    fb_cfg = cfg.get("firebase", {})
    cred_path = fb_cfg.get("service_account_path", "./serviceAccountKey.json")
    project_id = fb_cfg.get("project_id", "gen-lang-client-0507212703")
    database_id = fb_cfg.get("database_id", "ai-studio-665af4d4-475a-445e-90c2-f2eb75e75d14")

    if not os.path.exists(cred_path):
        raise FileNotFoundError(
            f"No se encontró la clave de servicio en '{cred_path}'.\n"
            f"Descárgala de Firebase Console > Project Settings > Service accounts."
        )

    cred = credentials.Certificate(cred_path)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, {"projectId": project_id})
    
    try:
        db = firestore.client(database_id=database_id)
    except TypeError:
        db = firestore.client()
        
    return db


def get_microsip_inventory_firebird(cfg):
    """
    Conecta a Firebird (Microsip) y extrae las existencias.
    Aplica filtro por ejercicio y mes actual en SALDOS_IN_MES_ART para no
    acumular saldos de meses anteriores.
    """
    fb_cfg = cfg.get("firebird", {})
    host = fb_cfg.get("host", "localhost")
    port = fb_cfg.get("port", 3050)
    db_path = fb_cfg.get("database")
    user = fb_cfg.get("user", "SYSDBA")
    password = fb_cfg.get("password", "masterkey")
    charset = fb_cfg.get("charset", "ISO8859_1")
    almacen_id = fb_cfg.get("almacen_id")
    custom_query = fb_cfg.get("custom_query")

    items = []

    # Detectar conector compatible según la versión de Firebird instalada
    cursor = None
    conn = None
    try:
        from firebird.driver import connect as fb_connect
        conn = fb_connect(
            database=f"{host}/{port}:{db_path}",
            user=user,
            password=password,
            charset=charset
        )
        cursor = conn.cursor()
    except Exception as e_driver:
        try:
            import fdb
            conn = fdb.connect(
                host=host,
                port=port,
                database=db_path,
                user=user,
                password=password,
                charset=charset
            )
            cursor = conn.cursor()
        except Exception as e_fdb:
            raise ConnectionError(
                f"Error al conectar con Firebird ({host}:{port} -> {db_path}).\n"
                f"Verifica que el servicio Firebird esté corriendo y el puerto 3050 esté abierto.\n"
                f"firebird-driver: {e_driver} | fdb: {e_fdb}"
            )

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Conectado exitosamente a Firebird de Microsip.")

    if custom_query:
        query = custom_query
    else:
        almacen_filter = f"AND s.ALMACEN_ID = {almacen_id}" if almacen_id else ""
        # Nota crucial: SALDOS_IN_MES_ART guarda saldos mensuales.
        # Debe filtrarse por el ejercicio y mes actual para no inflar las existencias.
        query = f"""
            SELECT 
                TRIM(ca.CLAVE_ARTICULO) AS CODIGO,
                TRIM(a.NOMBRE) AS NOMBRE,
                COALESCE(SUM(s.EXISTENCIA), 0) AS EXISTENCIA
            FROM ARTICULOS a
            JOIN CLAVES_ARTICULOS ca ON ca.ARTICULO_ID = a.ARTICULO_ID
            LEFT JOIN SALDOS_IN_MES_ART s ON s.ARTICULO_ID = a.ARTICULO_ID 
                AND s.EJERCICIO = EXTRACT(YEAR FROM CURRENT_DATE) 
                AND s.MES = EXTRACT(MONTH FROM CURRENT_DATE)
                {almacen_filter}
            WHERE a.ESTATUS = 'A'
            GROUP BY ca.CLAVE_ARTICULO, a.NOMBRE
        """

    try:
        cursor.execute(query)
        rows = cursor.fetchall()
        for row in rows:
            codigo = str(row[0]).strip() if row[0] else ""
            nombre = str(row[1]).strip() if row[1] else ""
            existencia = float(row[2]) if row[2] is not None else 0.0
            price = float(row[3]) if len(row) > 3 and row[3] is not None else None

            if codigo:
                items.append({
                    "sku": codigo,
                    "name": nombre,
                    "stock": existencia,
                    "price": price
                })
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    return items


def load_items_from_file(file_path):
    """
    Lee existencias desde archivo CSV o Excel (.xlsx, .xls)
    Maneja codificación UTF-8 / CP1252 / Latin-1 sin perder acentos.
    """
    ext = os.path.splitext(file_path)[1].lower()
    items = []

    if ext in [".xlsx", ".xls"]:
        try:
            import pandas as pd
            df = pd.read_excel(file_path)
            # Normalizar nombres de columnas a mayúsculas
            df.columns = [str(c).strip().upper() for c in df.columns]
            
            col_sku = next((c for c in df.columns if c in ["CLAVE", "CODIGO", "SKU", "CLAVE_ARTICULO"]), None)
            col_nombre = next((c for c in df.columns if c in ["NOMBRE", "ARTICULO", "DESCRIPCION"]), None)
            col_stock = next((c for c in df.columns if c in ["EXISTENCIA", "STOCK", "CANTIDAD", "SALDO"]), None)
            col_precio = next((c for c in df.columns if c in ["PRECIO", "PRECIO_VENTA"]), None)

            if not col_sku or not col_stock:
                raise ValueError(f"El Excel debe contener columnas de Clave/Código y Existencia. Columnas encontradas: {list(df.columns)}")

            for _, row in df.iterrows():
                sku = str(row[col_sku]).strip() if pd.notna(row[col_sku]) else ""
                nombre = str(row[col_nombre]).strip() if col_nombre and pd.notna(row[col_nombre]) else ""
                try:
                    stock = float(str(row[col_stock]).replace(",", "").strip())
                except (ValueError, TypeError):
                    stock = 0.0

                precio = None
                if col_precio and pd.notna(row[col_precio]):
                    try:
                        precio = float(str(row[col_precio]).replace(",", "").replace("$", "").strip())
                    except (ValueError, TypeError):
                        precio = None

                if sku and sku != "nan":
                    items.append({"sku": sku, "name": nombre, "stock": stock, "price": precio})
            return items
        except ImportError:
            print("[AVISO] Para leer Excel directamente instala: pip install pandas openpyxl. Leyendo como texto...")

    # Lectura de CSV con detección de codificación y delimitador
    encodings_to_try = ["utf-8-sig", "cp1252", "latin-1", "iso-8859-1"]
    content = None
    used_encoding = None

    for enc in encodings_to_try:
        try:
            with open(file_path, "r", encoding=enc) as f:
                content = f.read()
                used_encoding = enc
                break
        except (UnicodeDecodeError, LookupError):
            continue

    if content is None:
        raise ValueError(f"No se pudo leer el archivo con ninguna codificación ({encodings_to_try})")

    import csv
    import io

    # Detectar delimitador (coma, punto y coma, tabulador)
    first_line = content.splitlines()[0] if content.splitlines() else ""
    delimiter = ";" if ";" in first_line and first_line.count(";") >= first_line.count(",") else ","
    if "\t" in first_line:
        delimiter = "\t"

    reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)
    # Limpiar encabezados
    if reader.fieldnames:
        reader.fieldnames = [f.strip().upper() for f in reader.fieldnames if f]

    for row in reader:
        sku = (row.get("CLAVE") or row.get("CODIGO") or row.get("SKU") or row.get("CLAVE_ARTICULO") or "").strip()
        nombre = (row.get("NOMBRE") or row.get("ARTICULO") or row.get("DESCRIPCION") or "").strip()
        stock_raw = row.get("EXISTENCIA") or row.get("STOCK") or row.get("CANTIDAD") or "0"
        price_raw = row.get("PRECIO") or row.get("PRECIO_VENTA")

        try:
            stock = float(str(stock_raw).replace(",", "").replace("$", "").strip())
        except (ValueError, TypeError):
            stock = 0.0

        precio = None
        if price_raw:
            try:
                precio = float(str(price_raw).replace(",", "").replace("$", "").strip())
            except (ValueError, TypeError):
                precio = None

        if sku:
            items.append({"sku": sku, "name": nombre, "stock": stock, "price": precio})

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Archivo leído ({used_encoding}, delimitador '{delimiter}'): {len(items)} filas.")
    return items


def sync_inventory_to_firestore(db, microsip_items, cfg, dry_run=False):
    """
    Compara y sincroniza el inventario con Firestore de forma segura:
    - Sin colisiones de diccionarios (índices separados por SKU, ID y Nombre).
    - Reporta existencias negativas en vez de ocultarlas en silencio.
    - Soporta modo --dry-run (solo lectura/simulación).
    """
    sync_opts = cfg.get("sync_options", {})
    match_by = sync_opts.get("match_by", "sku").lower()
    update_stock = sync_opts.get("update_stock", True)
    update_price = sync_opts.get("update_price", False)
    create_missing = sync_opts.get("create_missing_products", False)
    allow_negative_stock = sync_opts.get("allow_negative_stock", True)

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Consultando catálogo en Firestore...")
    products_ref = db.collection("products")
    # FIX BLOQUEANTE: stream() devuelve un generador, convertir a list()
    docs = list(products_ref.stream())

    # Índices separados para evitar colisiones
    by_sku = {}
    by_microsip_clave = {}
    by_id = {}
    by_name = {}

    for d in docs:
        pdata = d.to_dict()
        pdata["_doc_id"] = d.id
        doc_id = d.id
        by_id[doc_id] = pdata

        sku = str(pdata.get("sku", "")).strip()
        if sku:
            by_sku[sku] = pdata

        m_clave = str(pdata.get("microsipClave", "")).strip()
        if m_clave:
            by_microsip_clave[m_clave] = pdata

        name = str(pdata.get("name", "")).strip().upper()
        if name:
            by_name[name] = pdata

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Catálogo Firestore: {len(docs)} productos encontrados.")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Artículos a procesar de Microsip: {len(microsip_items)}")

    if dry_run:
        print("\n**************************************************************")
        print("   MODO SIMULACIÓN (--dry-run ACTIVADO): NO SE ESCRIBIRÁ NADA")
        print("**************************************************************\n")

    batch = db.batch()
    batch_count = 0
    total_updated = 0
    matched_items = 0
    unmatched_items = []
    sample_changes = []

    for item in microsip_items:
        sku = item["sku"]
        name = item["name"]
        raw_stock = item["stock"]
        new_price = item.get("price")

        # Advertencia de existencias negativas
        if raw_stock < 0:
            print(f"  [⚠️ AVISO NEGATIVO] Artículo '{sku}' ({name}) tiene existencia negativa en Microsip ({raw_stock}).")
            stock_val = raw_stock if allow_negative_stock else 0.0
        else:
            stock_val = raw_stock

        # Búsqueda según la estrategia configurada
        target_prod = None
        if match_by == "sku":
            target_prod = by_sku.get(sku) or by_microsip_clave.get(sku)
        elif match_by == "id":
            target_prod = by_id.get(sku)
        elif match_by == "name":
            target_prod = by_name.get(name.upper())
        else: # "smart" o cualquier otra
            target_prod = by_sku.get(sku) or by_microsip_clave.get(sku) or by_id.get(sku) or by_name.get(name.upper())

        if not target_prod:
            unmatched_items.append(item)
            if create_missing and not dry_run:
                new_ref = products_ref.document()
                new_data = {
                    "sku": sku,
                    "microsipClave": sku,
                    "name": name or f"Artículo {sku}",
                    "category": "Microsip",
                    "price": new_price if new_price is not None else 0.0,
                    "stock": stock_val,
                    "reserved": 0,
                    "unit": "Pza",
                    "lastMicrosipSync": firestore.SERVER_TIMESTAMP
                }
                batch.set(new_ref, new_data)
                batch_count += 1
                total_updated += 1
            continue

        matched_items += 1
        doc_id = target_prod["_doc_id"]
        current_stock = float(target_prod.get("stock", 0))
        current_price = float(target_prod.get("price", 0))

        fields_to_update = {}

        if update_stock and abs(current_stock - stock_val) > 0.001:
            fields_to_update["stock"] = stock_val

        if update_price and new_price is not None and abs(current_price - new_price) > 0.01:
            fields_to_update["price"] = new_price

        # Si el producto no tenía guardado el sku, aprovechar para vincularlo
        if not target_prod.get("sku"):
            fields_to_update["sku"] = sku
            fields_to_update["microsipClave"] = sku

        if fields_to_update:
            fields_to_update["lastMicrosipSync"] = firestore.SERVER_TIMESTAMP
            total_updated += 1

            if len(sample_changes) < 8:
                sample_changes.append(
                    f"  [{sku}] {target_prod.get('name')}: Stock {current_stock} -> {stock_val}"
                    + (f", Precio ${current_price} -> ${new_price}" if "price" in fields_to_update else "")
                )

            if not dry_run:
                doc_ref = products_ref.document(doc_id)
                batch.update(doc_ref, fields_to_update)
                batch_count += 1

                # Límite seguro de transacciones por lote en Firestore
                if batch_count >= 400:
                    print(f"  [Lote] Aplicando {batch_count} cambios a Firestore...")
                    batch.commit()
                    batch = db.batch()
                    batch_count = 0

    if not dry_run and batch_count > 0:
        print(f"  [Lote] Aplicando lote final de {batch_count} cambios a Firestore...")
        batch.commit()

    print("\n------------------- RESUMEN DE SINCRONIZACIÓN -------------------")
    print(f"Total leídos de Microsip      : {len(microsip_items)}")
    print(f"Coincidencias encontradas     : {matched_items}")
    print(f"Artículos que requieren cambio: {total_updated}")
    print(f"Artículos sin coincidencia    : {len(unmatched_items)}")

    if sample_changes:
        print("\nMuestra de cambios detectados:")
        for sample in sample_changes:
            print(sample)

    if unmatched_items and len(unmatched_items) <= 5:
        print("\nArtículos sin coincidencia en la app:")
        for u in unmatched_items:
            print(f"  - [{u['sku']}] {u['name']}")
    elif unmatched_items:
        print(f"\n({len(unmatched_items)} artículos de Microsip no tienen SKU coincidente en la app).")

    if dry_run:
        print("\n[OK] Simulación finalizada. Ningún dato fue modificado en la base de datos.")
    else:
        print(f"\n[OK] Base de datos actualizada con éxito ({total_updated} modificaciones guardadas).")


def main():
    parser = argparse.ArgumentParser(description="Sincronizador Microsip <-> Karey Alimentos")
    parser.add_argument("--config", default="config.json", help="Ruta al archivo config.json")
    parser.add_argument("--file", help="Ruta a un archivo CSV o Excel exportado de Microsip")
    parser.add_argument("--dry-run", action="store_true", help="Simula los cambios y muestra la comparativa sin escribir en Firestore")
    parser.add_argument("--watch", action="store_true", help="Ejecutar continuamente cada N minutos")
    args = parser.parse_args()

    cfg = load_config(args.config)
    db = init_firebase(cfg)

    interval = cfg.get("sync_options", {}).get("interval_minutes", 10)

    while True:
        try:
            print(f"\n=======================================================")
            print(f"Ciclo de sincronización: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"=======================================================")

            if args.file:
                items = load_items_from_file(args.file)
            else:
                items = get_microsip_inventory_firebird(cfg)

            sync_inventory_to_firestore(db, items, cfg, dry_run=args.dry_run)

        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')} ERROR] {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()

        if not args.watch or args.dry_run:
            break

        print(f"\nPróxima sincronización en {interval} minutos... (Ctrl+C para salir)")
        time.sleep(interval * 60)


if __name__ == "__main__":
    main()
