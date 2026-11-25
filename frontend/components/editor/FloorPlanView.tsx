"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { PathInfo, PlacedRoom } from "@/types";
import { colorFor } from "@/lib/colors";
import { clamp, snap as snapValue } from "@/lib/geometry";
import { useSettings } from "@/hooks/useSettings";

const S = 20; // px per metre in SVG space
const M = 34; // margin around the plot
type Corner = "nw" | "ne" | "sw" | "se";

export interface FloorPlanProps {
  plot: { width: number; height: number };
  rooms: PlacedRoom[];
  entrance?: { x: number; y: number } | null;
  paths?: PathInfo[];            // circulation routes (entrance -> every room)
  showPaths?: boolean;
  highlight?: number[][] | null; // one emphasised route (polyline in metres)
  highlightRooms?: string[];
  selected?: string | null;
  issues?: Record<string, string[]>; // room -> geometry problems (drawn in red)
  diff?: Set<string>;                // rooms that differ from the reference layout (compare view)
  interactive?: boolean;             // zoom / pan / select / drag / resize
  editable?: boolean;                // drag + resize rooms (needs interactive)
  showGrid?: boolean;
  snap?: number;                     // grid snapping in metres
  compact?: boolean;                 // thumbnail mode: smaller labels, no toolbar
  maxHeight?: number | string;
  resetKey?: number;                 // change to reset zoom/pan
  onSelect?: (name: string | null) => void;
  onChange?: (rooms: PlacedRoom[], final: boolean) => void;
}

type Drag =
  | { kind: "pan"; sx: number; sy: number; px: number; py: number; moved: boolean }
  | { kind: "move"; name: string; sx: number; sy: number; orig: PlacedRoom; moved: boolean }
  | { kind: "resize"; name: string; corner: Corner; sx: number; sy: number; orig: PlacedRoom; moved: boolean };

export default function FloorPlanView(p: FloorPlanProps) {
  const { plot, rooms, interactive = false, editable = false, showGrid = true, snap = 0.5, compact = false } = p;
  const { len, area } = useSettings();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const W = plot.width * S, H = plot.height * S;
  const vbW = W + 2 * M, vbH = H + 2 * M;

  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [p.resetKey]);

  // wheel zoom around the cursor (non-passive so the page does not scroll)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !interactive) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const fx = (e.clientX - ctm.e) / ctm.a, fy = (e.clientY - ctm.f) / ctm.d;
      setZoom((z0) => {
        const z1 = clamp(z0 * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.4, 8);
        setPan((pn) => ({ x: fx - ((fx - pn.x) * z1) / z0, y: fy - ((fy - pn.y) * z1) / z0 }));
        return z1;
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [interactive]);

  const pxScale = () => svgRef.current?.getScreenCTM()?.a || 1; // screen px per SVG unit

  const startPan = (e: React.PointerEvent) => {
    if (!interactive) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y, moved: false };
  };
  const startMove = (e: React.PointerEvent, r: PlacedRoom) => {
    if (!interactive) return;
    e.stopPropagation();
    p.onSelect?.(r.name);
    if (!editable || r.isFree) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { kind: "move", name: r.name, sx: e.clientX, sy: e.clientY, orig: { ...r }, moved: false };
  };
  const startResize = (e: React.PointerEvent, r: PlacedRoom, corner: Corner) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { kind: "resize", name: r.name, corner, sx: e.clientX, sy: e.clientY, orig: { ...r }, moved: false };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
    if (d.kind === "pan") { const k = pxScale(); setPan({ x: d.px + dx / k, y: d.py + dy / k }); return; }
    if (!d.moved) return;
    const mx = dx / (pxScale() * zoom * S), my = dy / (pxScale() * zoom * S);
    const o = d.orig;
    let n: PlacedRoom = { ...o };
    if (d.kind === "move") {
      n.x = snapValue(o.x + mx, snap); n.y = snapValue(o.y + my, snap);
    } else {
      const minS = Math.max(0.5, snap);
      let x = o.x, y = o.y, w = o.width, h = o.height;
      if (d.corner.includes("e")) w = Math.max(minS, snapValue(o.width + mx, snap));
      if (d.corner.includes("s")) h = Math.max(minS, snapValue(o.height + my, snap));
      if (d.corner.includes("w")) { const nx = Math.min(snapValue(o.x + mx, snap), o.x + o.width - minS); w = o.x + o.width - nx; x = nx; }
      if (d.corner.includes("n")) { const ny = Math.min(snapValue(o.y + my, snap), o.y + o.height - minS); h = o.y + o.height - ny; y = ny; }
      n = { ...o, x, y, width: w, height: h };
    }
    n.area = n.width * n.height;
    p.onChange?.(rooms.map((r) => (r.name === d.name ? n : r)), false);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "pan" && !d.moved) p.onSelect?.(null);
    if ((d.kind === "move" || d.kind === "resize") && d.moved) p.onChange?.(rooms, true);
  };

  const route = (poly: number[][]) => poly.map(([x, y]) => `${M + x * S},${M + y * S}`).join(" ");
  const showLabels = (w: number, h: number) => (compact ? w > 46 && h > 26 : w > 40 && h > 26);

  return (
    <div className="relative bg-card border border-line rounded-md overflow-hidden select-none">
      {interactive && !compact && (
        <div className="absolute top-2 right-2 z-10 flex gap-1">
          <button className="btn btn-sm" aria-label="Zoom in" onClick={() => setZoom((z) => clamp(z * 1.25, 0.4, 8))}><Plus size={14} /></button>
          <button className="btn btn-sm" aria-label="Zoom out" onClick={() => setZoom((z) => clamp(z / 1.25, 0.4, 8))}><Minus size={14} /></button>
          <button className="btn btn-sm" aria-label="Fit to view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Maximize2 size={14} /></button>
          <span className="badge bg-secondary text-muted border-line self-center">{Math.round(zoom * 100)}%</span>
        </div>
      )}
      <svg ref={svgRef} viewBox={`0 0 ${vbW} ${vbH}`} width="100%" role="img" aria-label="Floor plan"
        style={{ maxHeight: p.maxHeight ?? (compact ? 260 : "72vh"), touchAction: "none", cursor: interactive ? "grab" : "default", display: "block" }}
        onPointerDown={startPan} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <defs>
          <pattern id={`h${uid}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#CBD5E1" strokeWidth="1.5" /></pattern>
          <clipPath id={`c${uid}`}><rect x={0} y={0} width={vbW} height={vbH} /></clipPath>
        </defs>
        <g clipPath={`url(#c${uid})`}>
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {/* background + measurement grid */}
            <rect x={M} y={M} width={W} height={H} fill="#FFFFFF" />
            {showGrid && !compact && Array.from({ length: Math.floor(plot.width) + 1 }, (_, i) => (
              <line key={`gx${i}`} x1={M + i * S} y1={M} x2={M + i * S} y2={M + H} stroke={i % 5 === 0 ? "#CBD5E1" : "#EEF2F6"} strokeWidth={1} />))}
            {showGrid && !compact && Array.from({ length: Math.floor(plot.height) + 1 }, (_, j) => (
              <line key={`gy${j}`} x1={M} y1={M + j * S} x2={M + W} y2={M + j * S} stroke={j % 5 === 0 ? "#CBD5E1" : "#EEF2F6"} strokeWidth={1} />))}

            {rooms.map((r) => {
              const x = M + r.x * S, y = M + r.y * S, w = r.width * S, h = r.height * S;
              const bad = p.issues?.[r.name];
              const sel = p.selected === r.name;
              const hl = p.highlightRooms?.includes(r.name);
              const differs = p.diff?.has(r.name);
              if (r.isFree) {
                return (
                  <g key={r.name} onPointerDown={(e) => startMove(e, r)}>
                    <rect x={x} y={y} width={w} height={h} fill={`url(#h${uid})`} stroke="#94A3B8" strokeDasharray="4 3" />
                    {!compact && w > 90 && h > 30 && <text x={x + w / 2} y={y + h / 2} fontSize={10} fill="#64748B" textAnchor="middle">Unallocated / open space</text>}
                  </g>
                );
              }
              return (
                <g key={r.name} onPointerDown={(e) => startMove(e, r)} style={{ cursor: editable ? "move" : interactive ? "pointer" : "default" }}>
                  <title>{r.name}{bad ? `\n${bad.join("\n")}` : ""}</title>
                  <rect x={x} y={y} width={w} height={h} fill={bad ? "#FEE2E2" : hl ? "#E0E7FF" : colorFor(r.type)} fillOpacity={bad ? 0.9 : 1}
                    stroke={bad ? "#DC2626" : sel ? "#4F46E5" : differs ? "#EA580C" : "#334155"} strokeWidth={sel ? 3 : bad || differs ? 2.5 : 1.5} strokeDasharray={differs && !bad ? "6 3" : undefined} />
                  {showLabels(w, h) && (
                    <>
                      <text x={x + w / 2} y={y + h / 2 - (compact ? 0 : 3)} fontSize={compact ? 9 : w > 80 && h > 44 ? 11 : 9} fontWeight={600} fill="#1E293B" textAnchor="middle" pointerEvents="none">{r.name}</text>
                      {!compact && <text x={x + w / 2} y={y + h / 2 + 11} fontSize={8.5} fill="#64748B" textAnchor="middle" pointerEvents="none">{len(r.width)} × {len(r.height)} · {area(r.width * r.height)}</text>}
                    </>
                  )}
                </g>
              );
            })}

            <rect x={M} y={M} width={W} height={H} fill="none" stroke="#172554" strokeWidth={3} pointerEvents="none" />

            {p.showPaths && p.paths?.filter((q) => q.reachable && q.polyline.length > 1).map((q) => (
              <polyline key={q.room} points={route(q.polyline)} fill="none" stroke="#4F46E5" strokeOpacity={0.45} strokeWidth={2} strokeDasharray="5 3" pointerEvents="none" />))}
            {p.highlight && p.highlight.length > 1 && (
              <>
                <polyline points={route(p.highlight)} fill="none" stroke="#F97316" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
                {p.highlight.map(([x, y], i) => <circle key={i} cx={M + x * S} cy={M + y * S} r={3.5} fill="#F97316" pointerEvents="none" />)}
              </>
            )}
            {p.entrance && (
              <g pointerEvents="none">
                <circle cx={M + p.entrance.x * S} cy={M + p.entrance.y * S} r={7} fill="#4F46E5" stroke="#fff" strokeWidth={2} />
                {!compact && <text x={M + p.entrance.x * S + 11} y={M + p.entrance.y * S + (p.entrance.y >= plot.height - 0.01 ? -8 : 14)} fontSize={10} fontWeight={700} fill="#4F46E5">ENTRANCE</text>}
              </g>
            )}
            {!compact && (
              <g fontSize={10} fill="#64748B" pointerEvents="none">
                <text x={M + W / 2} y={M - 12} textAnchor="middle">{len(plot.width)}</text>
                <text x={M - 12} y={M + H / 2} textAnchor="middle" transform={`rotate(-90 ${M - 12} ${M + H / 2})`}>{len(plot.height)}</text>
              </g>
            )}
            {editable && p.selected && (() => {
              const r = rooms.find((q) => q.name === p.selected);
              if (!r || r.isFree) return null;
              const pts: [Corner, number, number][] = [["nw", r.x, r.y], ["ne", r.x + r.width, r.y], ["sw", r.x, r.y + r.height], ["se", r.x + r.width, r.y + r.height]];
              return pts.map(([c, cx, cy]) => (
                <rect key={c} x={M + cx * S - 5 / zoom} y={M + cy * S - 5 / zoom} width={10 / zoom} height={10 / zoom} fill="#FFFFFF" stroke="#4F46E5" strokeWidth={2 / zoom}
                  style={{ cursor: c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize" }} onPointerDown={(e) => startResize(e, r, c)} />));
            })()}
          </g>
        </g>
      </svg>
    </div>
  );
}
