"use client";

import { useMemo, useRef, useState } from "react";

export default function DistanceChart({ chart }) {
  const svgRef = useRef(null);
  const [active, setActive] = useState(null);
  const viewBox = `0 0 ${chart.width} ${chart.height}`;

  const nearestPoint = useMemo(
    () => (svgX) => {
      let best = chart.tooltipPoints[0];
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const point of chart.tooltipPoints) {
        const distance = Math.abs(Number(point.x) - svgX);
        if (distance < bestDistance) {
          best = point;
          bestDistance = distance;
        }
      }
      return best;
    },
    [chart.tooltipPoints],
  );

  function handlePointerMove(event) {
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const svgX = ratio * chart.width;
    const point = nearestPoint(svgX);
    const cardRect = event.currentTarget.closest(".chart-card").getBoundingClientRect();
    const tooltipWidth = 260;
    const leftCandidate = event.clientX - cardRect.left + 18;
    setActive({
      ...point,
      left: leftCandidate + tooltipWidth > cardRect.width ? event.clientX - cardRect.left - tooltipWidth - 18 : leftCandidate,
      top: Math.max(12, event.clientY - cardRect.top - 110),
    });
  }

  return (
    <section>
      <div className="chart-card">
        <div className="chart-head">
          <h2 className="chart-title">Metrics Over Distance</h2>
          <div className="legend">
            {chart.series.map((series) => (
              <span className="legend-item" key={series.key}>
                <span className="legend-dot" style={{ "--dot": series.color }} />
                {series.label}
              </span>
            ))}
          </div>
        </div>
        <div className="chart-wrap">
          <svg
            className="chart-svg"
            ref={svgRef}
            viewBox={viewBox}
            role="img"
            aria-label="Metrics over distance chart"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setActive(null)}
          >
            <defs>
              <linearGradient id="heartRateFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.26" />
                <stop offset="78%" stopColor="#ef4444" stopOpacity="0.03" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
              </linearGradient>
            </defs>
            {chart.grid.map((line, index) => (
              <line className="chart-grid" key={index} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
            ))}
            {chart.areaPath ? <path className="chart-area" d={chart.areaPath} /> : null}
            {chart.series.map((series) => (
              <path
                className="chart-line"
                d={series.path}
                key={series.key}
                style={{
                  "--series": series.color,
                  "--width": series.emphasis ? 3 : 2.25,
                  "--opacity": series.emphasis ? 1 : 0.72,
                }}
              />
            ))}
            {chart.xLabels.map((label) => (
              <text className="chart-axis-text" key={label.text} x={label.x} y={label.y} textAnchor="middle">
                {label.text}
              </text>
            ))}
            {chart.yLabels.map((label) => (
              <text className="chart-axis-text" key={label.text} x={label.x} y={label.y} textAnchor="start">
                {label.text}
              </text>
            ))}
            {active ? (
              <g>
                <line className="chart-hover-line" x1={active.x} y1={chart.plot.y} x2={active.x} y2={chart.plot.y + chart.plot.height} />
                {active.metrics.map((metric) => (
                  <circle className="chart-hover-dot" key={metric.key} r="5" cx={active.x} cy={metric.y} fill={metric.color} />
                ))}
              </g>
            ) : null}
            <rect
              className="chart-hitbox"
              x={chart.plot.x}
              y={chart.plot.y}
              width={chart.plot.width}
              height={chart.plot.height}
            />
          </svg>
        </div>
        {active ? (
          <div className="chart-tooltip" style={{ left: active.left, top: active.top }}>
            <div className="tooltip-distance">{active.distance}</div>
            {active.metrics.map((metric) => (
              <div className="tooltip-row" key={metric.key}>
                <span className="tooltip-dot" style={{ "--dot": metric.color }} />
                <span className="tooltip-label">{metric.label}</span>
                <span className="tooltip-value">{metric.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
