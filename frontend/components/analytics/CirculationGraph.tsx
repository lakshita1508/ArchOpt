"use client";
import type { Circulation } from "@/types";

const S = 18, M = 28;

/** Room connection graph: rooms = nodes (at their real centres), doors/shared walls = weighted edges (metres). */
export default function CirculationGraph({ plot, circ, route, selected, onSelect }: {
  plot: { width: number; height: number }; circ: Circulation; route: string[]; selected: string | null; onSelect: (n: string) => void;
}) {
  const nodes = circ.nodes || [];
  const pos = new Map(nodes.map((n) => [n.name, [M + n.cx * S, M + n.cy * S] as const]));
  if (circ.entrance) pos.set("ENTRANCE", [M + circ.entrance.x * S, M + circ.entrance.y * S]);
  const onRoute = new Set<string>();
  for (let i = 0; i + 1 < route.length; i++) { onRoute.add(`${route[i]}|${route[i + 1]}`); onRoute.add(`${route[i + 1]}|${route[i]}`); }
  const W = plot.width * S + 2 * M, H = plot.height * S + 2 * M;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: "60vh", display: "block" }} role="img" aria-label="Room connection graph" className="bg-card border border-line rounded-md">
      <rect x={M} y={M} width={plot.width * S} height={plot.height * S} fill="none" stroke="#CBD5E1" strokeDasharray="4 3" />
      {(circ.edges || []).map((e, i) => {
        const a = pos.get(e.a), b = pos.get(e.b);
        if (!a || !b) return null;
        const hot = onRoute.has(`${e.a}|${e.b}`);
        return (
          <g key={i}>
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={hot ? "#F97316" : "#94A3B8"} strokeWidth={hot ? 4 : 1.5} strokeLinecap="round" />
            <text x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2 - 3} fontSize={8} textAnchor="middle" fill={hot ? "#C2410C" : "#64748B"} fontWeight={hot ? 700 : 400}>{e.weight.toFixed(1)}</text>
          </g>);
      })}
      {nodes.map((n) => {
        const dis = (circ.disconnected || []).includes(n.name);
        const sel = selected === n.name, hot = route.includes(n.name);
        return (
          <g key={n.name} onClick={() => onSelect(n.name)} style={{ cursor: "pointer" }}>
            <circle cx={M + n.cx * S} cy={M + n.cy * S} r={sel ? 12 : 9} fill={dis ? "#FEE2E2" : hot ? "#FFEDD5" : n.transit ? "#E0E7FF" : "#F1F5F9"} stroke={dis ? "#DC2626" : sel ? "#4F46E5" : n.transit ? "#4F46E5" : "#475569"} strokeWidth={sel ? 3 : 2} />
            <text x={M + n.cx * S} y={M + n.cy * S + 22} fontSize={9} fontWeight={600} textAnchor="middle" fill="#1E293B">{n.name}</text>
          </g>);
      })}
      {circ.entrance && <g><rect x={M + circ.entrance.x * S - 7} y={M + circ.entrance.y * S - 7} width={14} height={14} fill="#F97316" stroke="#fff" strokeWidth={2} /><text x={M + circ.entrance.x * S + 12} y={M + circ.entrance.y * S - 8} fontSize={9} fontWeight={700} fill="#C2410C">ENTRANCE</text></g>}
    </svg>
  );
}
