"""SVG / PDF / metrics-report generation for layouts (pure functions; no web framework needed)."""
import io, json
from typing import Any, Dict, List
from xml.sax.saxutils import escape

TYPE_COLORS = {
    "Reception": "#DBEAFE", "Living Room": "#FEF3C7", "Bedroom": "#EDE9FE", "Kitchen": "#FFE4E6", "Dining Area": "#FDE68A",
    "Classroom": "#D1FAE5", "Office": "#E0E7FF", "Conference Room": "#CFFAFE", "Meeting Room": "#CCFBF1", "Toilet": "#E2E8F0",
    "Storage": "#F1F5F9", "Corridor": "#FFFFFF", "Staircase": "#F8FAFC", "Open Area": "#ECFCCB", "Balcony": "#DCFCE7",
    "Custom Room": "#FAE8FF", "Open Space": "#F8FAFC",
}
BADGE_COLORS = {"LIVE RESULT": "#15803D", "DEMO RESULT": "#C2410C", "MANUAL EDIT": "#4F46E5", "OPTIMIZATION FAILED": "#B91C1C"}


def _fmt(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def layout_to_svg(project: Dict[str, Any], layout: Dict[str, Any], scale: float = 22.0, show_paths: bool = True) -> str:
    W, H = project["plot_width"], project["plot_height"]
    m, top, bottom = 40.0, 56.0, 70.0
    width, height = W * scale + 2 * m, H * scale + top + bottom
    badge = layout.get("result_badge", "LIVE RESULT")
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" viewBox="0 0 {width:.0f} {height:.0f}" font-family="Inter, Arial, sans-serif">',
           f'<title>{escape(project["name"])} - {escape(layout.get("name", ""))}</title>',
           '<defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#CBD5E1" stroke-width="1.5"/></pattern></defs>',
           f'<rect width="{width:.0f}" height="{height:.0f}" fill="#FFFFFF"/>',
           f'<text x="{m}" y="28" font-size="16" font-weight="700" fill="#172554">{escape(project["name"])} - {escape(layout.get("name", ""))}</text>',
           f'<text x="{m}" y="46" font-size="11" fill="#64748B">Plot {_fmt(W)} x {_fmt(H)} m ({_fmt(W * H)} m2)</text>',
           f'<rect x="{width - m - 130:.0f}" y="14" width="130" height="24" fill="{BADGE_COLORS.get(badge, "#475569")}"/>',
           f'<text x="{width - m - 65:.0f}" y="30" font-size="11" font-weight="700" fill="#FFFFFF" text-anchor="middle">{escape(badge)}</text>']
    ox, oy = m, top
    # grid every metre (light) and every 5 m (stronger)
    for i in range(int(W) + 1):
        out.append(f'<line x1="{ox + i * scale:.1f}" y1="{oy}" x2="{ox + i * scale:.1f}" y2="{oy + H * scale:.1f}" stroke="{"#E2E8F0" if i % 5 == 0 else "#F1F5F9"}" stroke-width="1"/>')
    for j in range(int(H) + 1):
        out.append(f'<line x1="{ox}" y1="{oy + j * scale:.1f}" x2="{ox + W * scale:.1f}" y2="{oy + j * scale:.1f}" stroke="{"#E2E8F0" if j % 5 == 0 else "#F1F5F9"}" stroke-width="1"/>')
    for r in layout["rooms"]:
        x, y, w, h = ox + r["x"] * scale, oy + r["y"] * scale, r["width"] * scale, r["height"] * scale
        if r.get("isFree"):
            out.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="url(#hatch)" stroke="#94A3B8" stroke-dasharray="4 3"/>')
            if w > 70 and h > 30:
                out.append(f'<text x="{x + w / 2:.1f}" y="{y + h / 2:.1f}" font-size="10" fill="#64748B" text-anchor="middle">Unallocated / open space</text>')
            continue
        out.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{TYPE_COLORS.get(r.get("type", ""), "#F1F5F9")}" stroke="#334155" stroke-width="1.5"/>')
        fs = 11 if w > 80 and h > 44 else 9
        if w > 36 and h > 26:
            out.append(f'<text x="{x + w / 2:.1f}" y="{y + h / 2 - 3:.1f}" font-size="{fs}" font-weight="600" fill="#1E293B" text-anchor="middle">{escape(r["name"])}</text>')
            out.append(f'<text x="{x + w / 2:.1f}" y="{y + h / 2 + fs + 1:.1f}" font-size="{fs - 1}" fill="#64748B" text-anchor="middle">{_fmt(r["width"])} x {_fmt(r["height"])} m | {_fmt(r["width"] * r["height"])} m2</text>')
    out.append(f'<rect x="{ox}" y="{oy}" width="{W * scale:.1f}" height="{H * scale:.1f}" fill="none" stroke="#172554" stroke-width="3"/>')
    circ = layout.get("circulation") or {}
    if show_paths and circ.get("paths"):
        for p in circ["paths"]:
            if p.get("reachable") and len(p["polyline"]) > 1:
                pts = " ".join(f'{ox + a * scale:.1f},{oy + b * scale:.1f}' for a, b in p["polyline"])
                out.append(f'<polyline points="{pts}" fill="none" stroke="#4F46E5" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="5 3"/>')
    ent = circ.get("entrance")
    if ent:
        ex, ey = ox + ent["x"] * scale, oy + ent["y"] * scale
        out.append(f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="7" fill="#4F46E5" stroke="#FFFFFF" stroke-width="2"/>')
        out.append(f'<text x="{ex + 12:.1f}" y="{ey + (-6 if ey > oy + H * scale - 1 else 14):.1f}" font-size="10" font-weight="700" fill="#4F46E5">ENTRANCE</text>')
    mt = layout.get("metrics", {})
    ty = oy + H * scale + 28
    out.append(f'<text x="{m}" y="{ty:.0f}" font-size="11" fill="#1E293B">Area efficiency {_fmt(mt.get("areaEfficiency", 0))}%  |  Adjacency {_fmt(mt.get("adjacencySatisfaction", 0))}%  |  Circulation {_fmt(mt.get("circulationScore", 0))}  |  Accessibility {_fmt(mt.get("accessibilityScore", 0))}%  |  Violations {mt.get("violations", 0)}</text>')
    out.append(f'<text x="{m}" y="{ty + 18:.0f}" font-size="10" fill="#64748B">Source: {escape(badge)} - {"precomputed, verified sample result (not newly calculated)" if badge == "DEMO RESULT" else "calculated by the ArchOpt C++ engine" if badge == "LIVE RESULT" else "edited manually and validated by the engine"}</text>')
    out.append("</svg>")
    return "\n".join(out)


def metrics_report(project: Dict[str, Any], layout: Dict[str, Any]) -> Dict[str, Any]:
    return {"project": {"name": project["name"], "type": project["project_type"], "plot_width": project["plot_width"],
                        "plot_height": project["plot_height"], "plot_area": project["plot_width"] * project["plot_height"]},
            "layout": {"id": layout["id"], "label": layout["label"], "name": layout["name"], "algorithm": layout["algorithm"],
                       "result_badge": layout["result_badge"], "source": layout["source"], "valid": layout["is_valid"]},
            "metrics": layout["metrics"],
            "rooms": [{k: r.get(k) for k in ("name", "type", "x", "y", "width", "height", "area")} for r in layout["rooms"]],
            "validation": layout["validation"],
            "note": {"live": "Results calculated by the live ArchOpt C++ optimisation engine.",
                     "demo": "DEMO RESULT: predefined, verified sample results - not newly calculated.",
                     "manual": "Manually edited layout validated by the ArchOpt engine."}.get(layout["source"], "")}


def layout_to_pdf(project: Dict[str, Any], layout: Dict[str, Any]) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    pw, ph = landscape(A4)
    c = canvas.Canvas(buf, pagesize=(pw, ph))
    c.setTitle(f'{project["name"]} - {layout["name"]}')
    navy, slate = colors.HexColor("#172554"), colors.HexColor("#64748B")
    badge = layout.get("result_badge", "LIVE RESULT")

    def header(title):
        c.setFillColor(navy); c.setFont("Helvetica-Bold", 16); c.drawString(36, ph - 40, title)
        c.setFillColor(colors.HexColor(BADGE_COLORS.get(badge, "#475569"))); c.rect(pw - 36 - 120, ph - 48, 120, 20, fill=1, stroke=0)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 9); c.drawCentredString(pw - 36 - 60, ph - 42, badge)
        c.setFillColor(slate); c.setFont("Helvetica", 9)

    W, H = project["plot_width"], project["plot_height"]
    header(f'ArchOpt - {project["name"]}')
    c.drawString(36, ph - 58, f'Layout {layout["label"]} ({layout["name"]})  |  Project type: {project["project_type"]}  |  Plot: {_fmt(W)} x {_fmt(H)} m = {_fmt(W * H)} m2  |  Algorithm: {layout.get("algorithm") or "n/a"}')
    box_w, box_h = pw - 72, ph - 190
    s = min(box_w * 0.62 / W, box_h / H)
    ox, oy = 36, 80
    for r in layout["rooms"]:
        x, y, w, h = ox + r["x"] * s, oy + (H - r["y"] - r["height"]) * s, r["width"] * s, r["height"] * s
        if r.get("isFree"):
            c.setFillColor(colors.HexColor("#F1F5F9")); c.setStrokeColor(colors.HexColor("#94A3B8")); c.setDash(3, 2)
        else:
            c.setFillColor(colors.HexColor(TYPE_COLORS.get(r.get("type", ""), "#F1F5F9"))); c.setStrokeColor(colors.HexColor("#334155")); c.setDash()
        c.rect(x, y, w, h, fill=1, stroke=1)
        c.setDash()
        if not r.get("isFree") and w > 30 and h > 20:
            c.setFillColor(colors.HexColor("#1E293B")); c.setFont("Helvetica-Bold", 7 if w < 70 else 8)
            c.drawCentredString(x + w / 2, y + h / 2 + 2, r["name"])
            c.setFont("Helvetica", 6.5); c.setFillColor(slate)
            c.drawCentredString(x + w / 2, y + h / 2 - 7, f'{_fmt(r["width"])}x{_fmt(r["height"])} m, {_fmt(r["width"] * r["height"])} m2')
    c.setStrokeColor(navy); c.setLineWidth(2); c.rect(ox, oy, W * s, H * s, fill=0, stroke=1); c.setLineWidth(1)
    ent = (layout.get("circulation") or {}).get("entrance")
    if ent:
        c.setFillColor(colors.HexColor("#4F46E5")); c.circle(ox + ent["x"] * s, oy + (H - ent["y"]) * s, 4, fill=1, stroke=0)
    # metrics + room list (right column)
    mt = layout["metrics"]
    tx = ox + W * s + 24
    y = ph - 90
    c.setFillColor(navy); c.setFont("Helvetica-Bold", 10); c.drawString(tx, y, "Metrics"); y -= 14
    c.setFont("Helvetica", 8.5); c.setFillColor(colors.HexColor("#1E293B"))
    for label, val in [("Area efficiency", f'{_fmt(mt.get("areaEfficiency", 0))} %'), ("Adjacency satisfaction", f'{_fmt(mt.get("adjacencySatisfaction", 0))} %'),
                       ("Circulation score", _fmt(mt.get("circulationScore", 0))), ("Accessibility score", f'{_fmt(mt.get("accessibilityScore", 0))} %'),
                       ("Usable area", f'{_fmt(mt.get("usableArea", 0))} m2'), ("Circulation area", f'{_fmt(mt.get("circulationArea", 0))} m2'),
                       ("Unused area", f'{_fmt(mt.get("unusedArea", 0))} m2'), ("Optimisation cost", _fmt(mt.get("totalCost", 0))),
                       ("Constraint violations", str(mt.get("violations", 0)))]:
        c.drawString(tx, y, label); c.drawRightString(pw - 36, y, val); y -= 12
    y -= 8
    c.setFont("Helvetica-Bold", 10); c.setFillColor(navy); c.drawString(tx, y, "Rooms"); y -= 13
    c.setFont("Helvetica", 8); c.setFillColor(colors.HexColor("#1E293B"))
    for r in layout["rooms"]:
        if r.get("isFree"):
            continue
        if y < 60:
            break
        c.drawString(tx, y, r["name"][:26]); c.drawRightString(pw - 36, y, f'{_fmt(r["width"])} x {_fmt(r["height"])} m  ({_fmt(r["width"] * r["height"])} m2)'); y -= 11
    c.setFillColor(slate); c.setFont("Helvetica-Oblique", 8)
    note = {"demo": "DEMO RESULT - predefined, verified sample result. Not newly calculated.",
            "live": "LIVE RESULT - calculated by the ArchOpt C++20 optimisation engine.",
            "manual": "MANUAL EDIT - validated by the ArchOpt engine."}.get(layout["source"], "")
    c.drawString(36, 36, note)
    c.showPage()
    c.save()
    return buf.getvalue()
