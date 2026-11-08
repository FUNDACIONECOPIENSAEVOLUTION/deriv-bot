#!/usr/bin/env python3
"""Publicación local Windows: +0,1 por versión, ZIP reproducible y manifest SHA-256.
La ejecución sigue siendo exclusiva del PC. GitHub SOLO guarda código y paquetes.
"""
import base64
import datetime as dt
import hashlib
import io
import json
import pathlib
import re
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
app = root / "local-demo"
manifest_path = root / "pc-release.json"
current = json.loads(manifest_path.read_text(encoding="utf-8"))
local_path = app / "local-release.json"
local = json.loads(local_path.read_text(encoding="utf-8"))
pattern = re.compile(r"^([0-9]+)\.([0-9])$")
version = str(current["version"])
match = pattern.fullmatch(version)
assert match is not None, "Invalid one-decimal version"
assert local["version"] == version, "PC and GitHub baseline do not match"
new_i = int(match.group(1)) * 10 + int(match.group(2)) + 1
new_version = f"{new_i // 10}.{new_i % 10}"
local.update(
    version=new_version,
    channel="pc-local",
    execution="windows-only",
    trading="demo-owner-authorized-bursts",
    summary="Compras DEMO 1-10, OHLC, P&L, CSV, MCP privado y actualización automática",
    notes=[
        "Solo el PC ejecuta el bot; GitHub es fuente y respaldo del código.",
        "Compras secuenciales DEMO con aprobación local explícita; REAL inaccesible.",
        "MCP localhost con Bearer privado permite análisis y solicitudes, NO compras directas.",
        "Velas OHLC de 10 ticks, historial SQLite, cronología de compras y CSV.",
        "Actualización en reposo con SHA-256 y reinicio supervisado; nunca durante contrato abierto.",
        "No hay garantías de rentabilidad, tasa de acierto ni latencia.",
    ],
)
local_path.write_text(json.dumps(local, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
package_path = app / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["version"] = new_version + ".0"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
# Actualiza también la versión visible en el HTML que usan las pruebas iniciales.
html_path = app / "public" / "index.html"
html_source = html_path.read_text(encoding="utf-8")
html_source, match_count = re.subn(
    r'<h1 id="version-title">Deriv DEMO · aplicación local(?: v[0-9]+\.[0-9])?</h1>',
    f'<h1 id="version-title">Deriv DEMO · aplicación local v{new_version}</h1>',
    html_source,
    count=1,
)
assert match_count == 1, "No se encuentra titulo de version en panel"
html_path.write_text(html_source, encoding="utf-8")
changes = app / "CHANGELOG-LOCAL.md"
entry = (f"## v{new_version} · {dt.date.today().isoformat()}\n\n"
         "- Bot DEMO permite tandas autorizadas de 1 a 10 contratos, uno a uno; REAL bloqueada.\n"
         "- Selección automática de señales frescas SMA/RSI, pausa en caso de incertidumbre.\n"
         "- Velas OHLC por ticks, gráfico P&L, tabla de resultados y CSV de tandas.\n"
         "- Métricas de latencia y confirmación de contratos en SQLite local.\n"
         "- MCP local de lectura y solicitud de compra con aprobación humana local.\n"
         "- Actualización automática cuando el bot no tiene contratos pendientes, sin borrar tokens.\n\n")
old = changes.read_text(encoding="utf-8")
changes.write_text(entry + old, encoding="utf-8")
release_path = app / "local-release.json"
assert json.loads(release_path.read_text(encoding="utf-8"))["version"] == new_version

# Archivo solo con fuentes de la app. Exclusión explícita de credenciales y datos de usuario.
paths = []
for path in sorted(app.rglob("*")):
    if not path.is_file():
        continue
    rel = path.relative_to(root)
    if any(part in {"data", "node_modules", ".git", "__pycache__"} for part in rel.parts):
        continue
    if path.name.startswith(".") or path.suffix in {".sqlite", ".db", ".csv", ".env", ".key"}:
        continue
    paths.append(path)
assert len(paths) >= 22, "Faltan fuentes necesarias en el paquete"
assert (app / "server.mjs") in paths
assert (app / "demo-trading.mjs") in paths
assert (app / "demo-burst.mjs") in paths
assert (app / "mcp-local.mjs") in paths
assert (app / "Actualizar-Desde-GitHub.ps1") in paths
archive_bytes = io.BytesIO()
with zipfile.ZipFile(archive_bytes, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in paths:
        archive.write(path, arcname=path.relative_to(root).as_posix())
data = archive_bytes.getvalue()
digest = hashlib.sha256(data).hexdigest()
b64 = base64.b64encode(data).decode("ascii")
parts = [b64[i:i + 50000] for i in range(0, len(b64), 50000)]
assert 1 <= len(parts) <= 24
bundle_dir = root / "pc-bundles"
bundle_dir.mkdir(parents=True, exist_ok=True)
for i, part in enumerate(parts):
    (bundle_dir / f"ecopiensa-local-{new_version}.zip.b64.part{i:02}").write_text(part + "\n", encoding="ascii")
current.update(
    version=new_version,
    channel="pc-local",
    archiveSha256=digest,
    archive=f"pc-bundles/ecopiensa-local-{new_version}.zip.b64.part00",
    parts=len(parts),
    trading="demo-owner-authorized-bursts",
    summary=local["summary"],
    updatedAt=dt.date.today().isoformat(),
)
manifest_path.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"PC_PUBLISHED v{version} -> v{new_version} files={len(paths)} parts={len(parts)} sha256={digest}")
