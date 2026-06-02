"use client";

import { useState } from "react";

export default function CopyWorkoutButton({ summary }) {
  const [status, setStatus] = useState("idle");
  const disabled = !summary;

  async function copyWorkout() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(buildWorkoutMarkdown(summary));
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1600);
    } catch {
      setStatus("failed");
      window.setTimeout(() => setStatus("idle"), 2200);
    }
  }

  return (
    <button className="copy-button" type="button" disabled={disabled} onClick={copyWorkout}>
      {status === "copied" ? "Copied" : status === "failed" ? "Copy Failed" : "Copy"}
    </button>
  );
}

function buildWorkoutMarkdown(summary) {
  const lines = [
    "# Workout Summary",
    "",
    "## File",
    `- Name: ${summary.file?.name || "-"}`,
    `- Uploaded: ${summary.file?.uploadedAt || "-"}`,
    "",
    "## Details",
    `- Activity: ${summary.details?.activity || "-"}`,
    `- Date: ${summary.details?.date || "-"}`,
    "",
    "## Metrics",
    metricLine("Duration", summary.metrics?.duration),
    metricLine("Distance", summary.metrics?.distance),
    metricLine("Average heart rate", summary.metrics?.avgHeartRate),
    metricLine("Max heart rate", summary.metrics?.maxHeartRate),
    metricLine("Average pace", summary.metrics?.avgPace),
    metricLine("Average speed", summary.metrics?.avgSpeed),
    metricLine("Max speed", summary.metrics?.maxSpeed),
    metricLine("Average power", summary.metrics?.avgPower),
    metricLine("Max power", summary.metrics?.maxPower),
    metricLine("Elevation", summary.metrics?.elevation),
    metricLine("Calories", summary.metrics?.calories),
    metricLine("Average cadence", summary.metrics?.avgCadence),
    "",
  ];

  if (summary.route) {
    lines.push(
      "## Route",
      `- Start: ${formatCoordinate(summary.route.start)}`,
      `- End: ${formatCoordinate(summary.route.end)}`,
      `- Route points shown on map: ${summary.route.points.length}`,
      "",
    );
  }

  if (summary.chart) {
    lines.push(
      "## Metrics Over Distance",
      `- Distance range: 0 to ${lastChartDistance(summary.chart)}`,
      `- Series: ${summary.chart.series.map((series) => series.label).join(", ") || "-"}`,
      "",
      "| Distance | Heart Rate | Elevation | Speed | Power | Cadence |",
      "|---:|---:|---:|---:|---:|---:|",
      ...sampleChartPoints(summary.chart.tooltipPoints, 0.25).map(chartPointRow),
      "",
    );
  }

  if (summary.laps?.length) {
    lines.push(
      "## Laps",
      "",
      "| # | Duration | Distance | Avg Speed | Max Speed | Avg HR | Max HR | Avg Cadence |",
      "|---|---:|---:|---:|---:|---:|---:|---:|",
      ...summary.laps.map((lap) => (
        `| ${lap.index} | ${lap.duration} | ${lap.distance} | ${lap.avgSpeed} | ${lap.maxSpeed} | ${lap.avgHeartRate} | ${lap.maxHeartRate} | ${lap.avgCadence} |`
      )),
      "",
    );
  }

  return lines.filter((line) => line !== null).join("\n");
}

function metricLine(label, metric) {
  if (!metric) return `- ${label}: -`;
  return `- ${label}: ${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function lastChartDistance(chart) {
  const lastPoint = chart.tooltipPoints?.at(-1);
  return lastPoint?.distance || "-";
}

function chartPointRow(point) {
  const metrics = new Map(point.metrics.map((metric) => [metric.label, metric.value]));
  return [
    point.distance,
    metrics.get("Heart Rate") || "-",
    metrics.get("Elevation") || "-",
    metrics.get("Speed") || "-",
    metrics.get("Power") || "-",
    metrics.get("Cadence") || "-",
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function sampleChartPoints(points = [], intervalMiles) {
  if (!points.length) return [];

  const sampled = [];
  const used = new Set();
  const maxDistance = parseDistanceMiles(points.at(-1).distance);

  for (let target = 0; target <= maxDistance; target += intervalMiles) {
    const index = nearestPointIndex(points, target);
    if (!used.has(index)) {
      sampled.push(points[index]);
      used.add(index);
    }
  }

  const finalIndex = points.length - 1;
  if (!used.has(finalIndex)) sampled.push(points[finalIndex]);

  return sampled;
}

function nearestPointIndex(points, targetMiles) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  points.forEach((point, index) => {
    const distance = Math.abs(parseDistanceMiles(point.distance) - targetMiles);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function parseDistanceMiles(value) {
  return Number.parseFloat(String(value).replace(" mi", "")) || 0;
}

function formatCoordinate(point) {
  if (!point) return "-";
  return `${point.latitude}, ${point.longitude}`;
}
