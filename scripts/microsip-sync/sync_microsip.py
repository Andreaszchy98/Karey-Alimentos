#!/usr/bin/env python3
"""
=============================================================================
Karey Alimentos - Sincronizador de Inventario Microsip -> Firebase Firestore
=============================================================================
Este script se ejecuta en la red local o servidor de Microsip (Windows).
Lee las existencias reales desde la base de datos Firebird (.FDB) de Microsip
y actualiza el inventario en tiempo real en la base de datos de Firebase.

Requisitos:
  pip install -r requirements.txt
Uso:
  python sync_microsip.py             # Ejecución única (para Tareas Programadas)
  python sync_microsip.py --watch     # Modo continuo cada N minutos
  python sync_microsip.py --csv file  # Sincronización desde reporte CSV/Excel
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
    """Carga la configuración desde config.json o config.example.json"""
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    elif os.path.exists("config.example.json"):
        print("[AVISO] No se encontró 'config.json'. Usando 'config.example.json' como plantilla.")
        with open("config.example.json", "r", encoding="utf-8") as f:
            return json.load(f)
    else:
        raise FileNotFoundError("No se encontró archivo de configuración (config.json).")


def init_firebase(cfg):
    """Inicializa la conexión con Firestore usando Firebase Admin SDK."""
    fb_cfg = cfg.get("firebase", {})
    cred_path = fb_cfg.get("service_account_path", "./serviceAccountKey.json")
    project_id = fb_cfg.get("project_id", "gen-lang-client-0507212703")
    database_id = fb_cfg.get("database_id", "ai-studio-665af4d4-475a-445e-90c2-f2eb75e75d14")

    if not os.path.exists(cred_path):
        raise FileNotFoundError(
            f"No se encontró el archivo de credenciales de Firebase en '{cred_path}'.\n"
            f"Descárgalo desde Firebase Console > Configuración del Proyecto > Cuentas de servicio."
        )

    cred = credentials.Certificate(cred_path)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, {"projectId": project_id})
    
    # Firestore con soporte para base de datos nombrada
    try:
        db = firestore.client(database_id=database_id)
    except TypeError:
        # Versiones antiguas de firebase-admin sin argumento database_id
        db = firestore.client()
        
    return db


def get_microsip_inventory_firebird(cfg):
    """
    Se conecta a la base de datos Firebird de Microsip y extrae los artículos
    con su clave/código principal y existencias actuales.
    """
    fb_cfg = cfg.get("firebird", {})
    host = fb_cfg.get("host", "localhost")
    port = fb_cfg.get("port", 3050)
    db_path = fb_cfg.get("database")
    user = fb_cfg.get("user", "SYSDBA")
    password = fb_cfg.get("password", "masterkey")
    charset = fb_cfg.get("charset", "ISO8859_1")
    almacen_id = fb_cfg.get("almacen_id")

    items = []

    # Intento 1: Usando la librería oficial 'firebird-driver'
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
        # Intento 2: Usando la librería legacy 'fdb'
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
                f"firebird-driver error: {e_driver}\n"
                f"fdb error: {e_fdb}"
            )

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Conectado a Microsip Firebird exitosamente.")

    # Consulta estándar para obtener artículos, clave principal y saldo de existencias
    almacen_filter = f"AND s.ALMACEN_ID = {almacen_id}" if almacen_id else ""
    
    query = f"""
        SELECT 
            TRIM(ca.CLAVE_ARTICULO) AS CODIGO,
            TRIM(a.NOMBRE) AS NOMBRE,
            COALESCE(SUM(s.EXISTENCIA), 0) AS EXISTENCIA
        FROM ARTICULOS a
        JOIN CLAVES_ARTICULOS ca ON ca.ARTICULO_ID = a.ARTICULO_ID
        LEFT JOIN SALDOS_IN_MES_ART s ON s.ARTICULO_ID = a.ARTICULO_ID {almacen_filter}
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
            if codigo:
                items.append({
                    "sku": codigo,
                    "name": nombre,
                    "stock": max(0.0, existencia)
                })
    finally:
        cursor.close()
        conn.close()

    return items


def get_microsip_inventory_csv(file_path):
    """
    Permite sincronizar a partir de un archivo CSV o Excel exportado desde Microsip.
    Columnas esperadas: Clave / Código / SKU, Nombre / Descripción, Existencia / Stock
    """
    items = []
    import csv

    with open(file_path, mode="r", encoding="utf-8-sig", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Buscar variaciones comunes de nombres de columnas
            sku = (
                row.get("CLAVE") or row.get("Clave") or 
                row.get("CODIGO") or row.get("Codigo") or 
                row.get("SKU") or row.get("sku") or ""
            ).strip()
            
            name = (
                row.get("NOMBRE") or row.get("Nombre") or 
                row.get("ARTICULO") or row.get("Articulo") or 
                row.get("DESCRIPCION") or ""
            ).strip()
            
            stock_raw = (
                row.get("EXISTENCIA") or row.get("Existencia") or 
                row.get("STOCK") or row.get("Stock") or 
                row.get("CANTIDAD") or "0"
            )
            try:
                stock = float(str(stock_raw).replace(",", "").strip())
            except ValueError:
                stock = 0.0

            if sku:
                items.append({
                    "sku": sku,
                    "name": name,
                    "stock": max(0.0, stock)
                })
    return items


def sync_inventory_to_firestore(db, microsip_items, cfg):
    """
    Compara el inventario extraído con los productos en Firestore
    y aplica las actualizaciones por lotes (batches de hasta 400 escrituras).
    """
    sync_opts = cfg.get("sync_options", {})
    update_stock = sync_opts.get("update_stock", True)
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Leyendo catálogo actual de Firebase Firestore...")
    products_ref = db.collection("products")
    docs = products_ref.stream()

    firebase_products = {}
    for d in docs:
        data = d.to_dict()
        data["_doc_id"] = d.id
        # Mapear por ID de documento
        firebase_products[d.id] = data
        # Mapear por SKU si existe
        if "sku" in data and data["sku"]:
            firebase_products[str(data["sku"]).strip()] = data
        # Mapear por nombre en mayúsculas como fallback
        if "name" in data and data["name"]:
            firebase_products[data["name"].strip().upper()] = data

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Se encontraron {len(docs)} productos en Firebase.")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Procesando {len(microsip_items)} artículos de Microsip...")

    batch = db.batch()
    batch_count = 0
    total_updated = 0
    matched_items = 0

    for item in microsip_items:
        sku = item["sku"]
        name = item["name"]
        new_stock = item["stock"]

        # Buscar coincidencia: 1) por SKU/Clave, 2) por ID, 3) por Nombre
        target_prod = (
            firebase_products.get(sku) or 
            firebase_products.get(name.upper())
        )

        if not target_prod:
            continue

        matched_items += 1
        doc_id = target_prod["_doc_id"]
        current_stock = float(target_prod.get("stock", 0))

        # Solo actualizar si el stock realmente cambió
        if update_stock and abs(current_stock - new_stock) > 0.001:
            doc_ref = products_ref.document(doc_id)
            batch.update(doc_ref, {
                "stock": new_stock,
                "lastMicrosipSync": firestore.SERVER_TIMESTAMP
            })
            batch_count += 1
            total_updated += 1
            print(f"  -> Actualizando [{sku}] {target_prod.get('name')}: {current_stock} -> {new_stock}")

            # Limite de Firestore: 500 operaciones por batch (usamos 400 por seguridad)
            if batch_count >= 400:
                print(f"  [Lote] Guardando lote de {batch_count} cambios en Firebase...")
                batch.commit()
                batch = db.batch()
                batch_count = 0

    # Guardar cambios pendientes restantes
    if batch_count > 0:
        print(f"  [Lote] Guardando lote final de {batch_count} cambios...")
        batch.commit()

    print(
        f"[{datetime.now().strftime('%H:%M:%S')}] Sincronización completada con éxito:\n"
        f"  - Artículos leídos de Microsip: {len(microsip_items)}\n"
        f"  - Coincidencias encontradas: {matched_items}\n"
        f"  - Productos actualizados en Firebase: {total_updated}"
    )


def main():
    parser = argparse.ArgumentParser(description="Sincronizador Microsip <-> Karey Alimentos")
    parser.add_argument("--config", default="config.json", help="Ruta al archivo config.json")
    parser.add_argument("--csv", help="Ruta a un archivo CSV para sincronizar en modo manual")
    parser.add_argument("--watch", action="store_true", help="Ejecutar en bucle continuo cada N minutos")
    args = parser.parse_args()

    cfg = load_config(args.config)
    db = init_firebase(cfg)

    interval = cfg.get("sync_options", {}).get("interval_minutes", 10)

    while True:
        try:
            print(f"\n=======================================================")
            print(f"Iniciando ciclo de sincronización ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')})")
            print(f"=======================================================")

            if args.csv:
                items = get_microsip_inventory_csv(args.csv)
            else:
                items = get_microsip_inventory_firebird(cfg)

            sync_inventory_to_firestore(db, items, cfg)

        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')} ERROR] Falló la sincronización: {e}", file=sys.stderr)

        if not args.watch:
            break

        print(f"\nEsperando {interval} minutos para la siguiente sincronización... (Presiona Ctrl+C para detener)")
        time.sleep(interval * 60)


if __name__ == "__main__":
    main()
