import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { currency } from "../utils/format";

const colors = ["#00d4ff", "#a855f7", "#f59e0b", "#34d399", "#f87171", "#818cf8"];

const tooltipStyle = {
  background: "rgba(10,10,10,0.92)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "0.625rem",
  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
  color: "#f1f5f9",
  fontSize: "0.8125rem",
};

const axisStyle = { fill: "rgba(255,255,255,0.35)", fontSize: 11 };

export function SpendBar({ data, dataKey = "value", nameKey = "name" }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 12, right: 16, bottom: 20, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey={nameKey} tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} tick={axisStyle} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value) => currency(value)}
          contentStyle={tooltipStyle}
          itemStyle={{ color: "#22d3ee" }}
          labelStyle={{ color: "rgba(255,255,255,0.6)", marginBottom: 4 }}
          cursor={{ fill: "rgba(0,212,255,0.05)" }}
        />
        <Bar dataKey={dataKey} radius={[5, 5, 0, 0]} fill="url(#barGrad)">
          <defs>
            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#0891b2" stopOpacity={0.7} />
            </linearGradient>
          </defs>
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryPie({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={58}
          outerRadius={96}
          paddingAngle={3}
          strokeWidth={0}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={colors[index % colors.length]} opacity={0.85} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => currency(value)}
          contentStyle={tooltipStyle}
          itemStyle={{ color: "#f1f5f9" }}
          labelStyle={{ color: "rgba(255,255,255,0.6)", marginBottom: 4 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SpendLine({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 12, right: 16, bottom: 20, left: 10 }}>
        <defs>
          <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f87171" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} tick={axisStyle} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value) => currency(value)}
          contentStyle={tooltipStyle}
          itemStyle={{ color: "#f87171" }}
          labelStyle={{ color: "rgba(255,255,255,0.6)", marginBottom: 4 }}
          cursor={{ stroke: "rgba(248,113,113,0.3)", strokeWidth: 1 }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#f87171"
          strokeWidth={2.5}
          dot={{ r: 4, fill: "#f87171", strokeWidth: 0 }}
          activeDot={{ r: 6, fill: "#f87171", strokeWidth: 2, stroke: "rgba(248,113,113,0.4)" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
