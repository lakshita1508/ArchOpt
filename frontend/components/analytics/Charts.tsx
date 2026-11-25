"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LayoutData } from "@/types";
import { CHART_COLORS } from "@/lib/colors";

const axis = { fontSize: 11, fill: "#64748B" };
const tip = { contentStyle: { borderRadius: 4, border: "1px solid #E2E8F0", fontSize: 12 } };

export function RoomAreaChart({ layout }: { layout: LayoutData }) {
  const data = layout.rooms.filter((r) => !r.isFree).map((r) => ({ name: r.name, Allocated: +(r.width * r.height).toFixed(1), Required: r.requiredArea ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 40 }}>
        <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={axis} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={axis} unit=" m²" width={56} />
        <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Required" fill="#94A3B8" /><Bar dataKey="Allocated" fill="#4F46E5" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function UtilizationChart({ layout }: { layout: LayoutData }) {
  const m = layout.metrics;
  const data = [
    { name: "Usable rooms", value: +m.usableArea.toFixed(1) },
    { name: "Circulation", value: +m.circulationArea.toFixed(1) },
    { name: "Unused / open space", value: +m.unusedArea.toFixed(1) },
  ].filter((d) => d.value > 0);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} label={(e) => `${e.value} m²`}>
          {data.map((_, i) => <Cell key={i} fill={["#4F46E5", "#14B8A6", "#CBD5E1"][i % 3]} />)}
        </Pie>
        <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function AdjacencyChart({ layout }: { layout: LayoutData }) {
  const data = layout.validation.filter((c) => c.id === "relationship").map((c) => {
    const m = /score ([0-9.]+)/.exec(c.message);
    return { name: c.message.split(" (")[0], score: c.status === "passed" ? 100 : Math.round((m ? parseFloat(m[1]) : 0) * 100), hard: c.category === "hard" };
  });
  if (data.length === 0) return <p className="text-sm text-muted py-10 text-center">No adjacency relationships defined for this project.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
        <XAxis type="number" domain={[0, 100]} tick={axis} unit="%" />
        <YAxis type="category" dataKey="name" tick={axis} width={150} />
        <Tooltip {...tip} />
        <Bar dataKey="score" name="Satisfaction %">{data.map((d, i) => <Cell key={i} fill={d.score >= 99 ? "#16A34A" : d.score >= 50 ? "#F59E0B" : "#DC2626"} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CirculationChart({ layout }: { layout: LayoutData }) {
  const data = (layout.circulation.paths || []).filter((p) => p.reachable).map((p) => ({ name: p.room, distance: +p.distance.toFixed(1) })).sort((a, b) => b.distance - a.distance);
  if (data.length === 0) return <p className="text-sm text-muted py-10 text-center">No circulation data stored for this layout.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 28 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
        <XAxis type="number" tick={axis} unit=" m" />
        <YAxis type="category" dataKey="name" tick={axis} width={130} />
        <Tooltip {...tip} />
        <Bar dataKey="distance" name="Walking distance from entrance (m)" fill="#0EA5E9" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EfficiencyByProjectChart({ data }: { data: { project: string; avg_efficiency: number; layouts: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 30 }}>
        <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
        <XAxis dataKey="project" tick={axis} interval={0} angle={-20} textAnchor="end" />
        <YAxis tick={axis} unit="%" domain={[0, 100]} width={44} />
        <Tooltip {...tip} />
        <Bar dataKey="avg_efficiency" name="Avg area efficiency %">{data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CountChart({ data, nameKey, valueKey, color = "#4F46E5" }: { data: Record<string, any>[]; nameKey: string; valueKey: string; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
        <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
        <XAxis dataKey={nameKey} tick={axis} /><YAxis tick={axis} allowDecimals={false} />
        <Tooltip {...tip} /><Bar dataKey={valueKey} fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
}
