import Link from "next/link";
import { redirect } from "next/navigation";
import DatabaseSetupNotice from "app/components/DatabaseSetupNotice.jsx";
import ScrollToEnd from "app/components/ScrollToEnd.jsx";
import UnlockScreen from "app/components/UnlockScreen.jsx";
import { hasDashboardCookie } from "lib/auth.js";
import { hasDatabaseUrl } from "lib/db.js";
import { listAllRuns } from "lib/run-store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_START_OFFSET = 1;
const DISTANCE_BINS = [
  { label: "0-3", min: 0, max: 3 },
  { label: "3-5", min: 3, max: 5 },
  { label: "5-8", min: 5, max: 8 },
  { label: "8-10", min: 8, max: 10 },
  { label: "10+", min: 10, max: Infinity },
];

export default async function DashboardPage({ searchParams }) {
  const params = await searchParams;
  if (params?.key) redirect(`/api/auth?key=${encodeURIComponent(params.key)}`);

  const isAuthed = await hasDashboardCookie();
  if (!isAuthed) return <UnlockScreen />;
  if (!hasDatabaseUrl()) return <DatabaseSetupNotice />;

  const runs = await listAllRuns();
  const dashboard = buildDashboard(runs);

  return (
    <main>
      <div className="dashboard training-dashboard">
        <div className="topbar">
          <div>
            <h1>Run Dashboard</h1>
            <div className="meta">{dashboard.rangeLabel}</div>
          </div>
          <div className="actions">
            <Link className="action-button" href="/">Latest</Link>
            <Link className="action-button" href="/runs">History</Link>
          </div>
        </div>

        {dashboard.runs.length ? <DashboardContent dashboard={dashboard} /> : <EmptyDashboard />}
      </div>
    </main>
  );
}

function DashboardContent({ dashboard }) {
  return (
    <>
      <section>
        <div className="dashboard-kpis">
          {dashboard.cards.map((card) => (
            <div className="dashboard-kpi" key={card.label}>
              <div className="label">{card.label}</div>
              <div className="dashboard-kpi-value">{card.value}</div>
              <div className="unit">{card.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <ChartPanel title="Weekly Mileage" subtitle={dashboard.weeklySubtitle}>
          <BarChart data={dashboard.weeklyMileage} valueSuffix=" mi" yTickInterval={15} minColumnWidth={62} scrollToEnd />
        </ChartPanel>
      </section>

      <section className="dashboard-grid">
        <ChartPanel title="Monthly Mileage" subtitle="Total distance by calendar month">
          <BarChart data={dashboard.monthlyMileage} valueSuffix=" mi" compact tooltipPlacement="top" />
        </ChartPanel>
        <ChartPanel title="Cumulative Miles" subtitle={dashboard.cumulativeSubtitle}>
          <LineChart data={dashboard.cumulativeMiles} valueSuffix=" mi" />
        </ChartPanel>
      </section>

      <section className="dashboard-grid">
        <ChartPanel title="Pace Trend" subtitle="Weekly weighted average pace">
          <LineChart data={dashboard.weeklyPace} formatter={formatPace} invert valueSuffix="/mi" />
        </ChartPanel>
        <ChartPanel title="Effort Trend" subtitle="Weekly average heart rate">
          <LineChart data={dashboard.weeklyHeartRate} valueSuffix=" bpm" />
        </ChartPanel>
      </section>

      <section>
        <ChartPanel title="Run Calendar" subtitle="Daily mileage intensity">
          <Heatmap weeks={dashboard.heatmapWeeks} maxMiles={dashboard.maxDailyMiles} />
        </ChartPanel>
      </section>

      <section className="dashboard-grid">
        <ChartPanel title="Distance Distribution" subtitle="Runs by distance bucket">
          <BarChart data={dashboard.distanceDistribution} valueSuffix=" runs" compact />
        </ChartPanel>
        <ChartPanel title="Long Run Trend" subtitle="Longest run per week">
          <LineChart data={dashboard.longRunTrend} valueSuffix=" mi" yTickInterval={3} />
        </ChartPanel>
      </section>
    </>
  );
}

function ChartPanel({ title, subtitle, children }) {
  return (
    <div className="dashboard-panel">
      <div className="dashboard-panel-head">
        <h2>{title}</h2>
        <div className="meta">{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function BarChart({
  data,
  valueSuffix = "",
  compact = false,
  tooltipPlacement = "bar",
  yTickInterval = null,
  minColumnWidth = null,
  scrollToEnd = false,
}) {
  const baseWidth = 760;
  const height = compact ? 250 : 310;
  const padding = { top: 24, right: 22, bottom: 54, left: yTickInterval ? 64 : 42 };
  const gap = minColumnWidth ? 14 : compact ? 10 : 8;
  const width = minColumnWidth
    ? Math.max(baseWidth, padding.left + padding.right + data.length * minColumnWidth - gap)
    : baseWidth;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.map((item) => item.value));
  const axisMax = yTickInterval ? Math.max(yTickInterval, Math.ceil(maxValue / yTickInterval) * yTickInterval) : maxValue;
  const yTicks = yTickInterval
    ? Array.from({ length: Math.floor(axisMax / yTickInterval) + 1 }, (_, index) => index * yTickInterval)
    : null;
  const barWidth = minColumnWidth
    ? Math.max(8, minColumnWidth - gap)
    : Math.max(8, (plotWidth - gap * Math.max(0, data.length - 1)) / Math.max(1, data.length));
  const labelStep = data.length > 12 ? Math.ceil(data.length / 8) : 1;
  const bars = data.map((item, index) => {
    const valueRatio = item.value / axisMax;
    const x = padding.left + index * (barWidth + gap);
    const barHeight = Math.max(2, valueRatio * plotHeight);
    const y = padding.top + plotHeight - barHeight;
    const tooltipText = `${item.label}: ${formatNumber(item.value, 1)}${valueSuffix}`;
    const tooltipWidth = Math.max(92, tooltipText.length * 7.2 + 28);
    const tooltipHeight = 38;
    const barCenter = x + barWidth / 2;
    let tooltipX = Math.min(width - padding.right - tooltipWidth, Math.max(padding.left, barCenter - tooltipWidth / 2));
    if (tooltipPlacement === "top" && barCenter > width - padding.right - tooltipWidth / 2) {
      tooltipX = Math.max(padding.left, x - tooltipWidth - 8);
    }
    if (tooltipPlacement === "top" && barCenter < padding.left + tooltipWidth / 2) {
      tooltipX = Math.min(width - padding.right - tooltipWidth, x + barWidth + 8);
    }
    const tooltipY = tooltipPlacement === "top" ? padding.top + 10 : Math.max(6, y - tooltipHeight - 16);
    const arrowX = Math.min(tooltipX + tooltipWidth - 14, Math.max(tooltipX + 14, barCenter));
    const arrowY = tooltipY + tooltipHeight;
    return { ...item, index, x, y, barHeight, tooltipText, tooltipWidth, tooltipHeight, tooltipX, tooltipY, arrowX, arrowY };
  });

  const ChartScroll = scrollToEnd ? ScrollToEnd : "div";

  return (
    <ChartScroll className="dashboard-chart-scroll">
      <svg
        className="dashboard-chart"
        style={minColumnWidth ? { minWidth: `${width}px` } : undefined}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
      >
        {(yTicks || [0, 0.25, 0.5, 0.75, 1]).map((tick) => {
          const y = yTicks
            ? padding.top + plotHeight - (tick / axisMax) * plotHeight
            : padding.top + tick * plotHeight;
          return (
            <g key={tick}>
              <line className="dashboard-grid-line" x1={padding.left} y1={y} x2={width - padding.right} y2={y} />
              {yTicks && tick > 0 ? (
                <text className="dashboard-axis-text" x={padding.left - 8} y={y + 5} textAnchor="end">
                  {`${formatNumber(tick)}${valueSuffix}`}
                </text>
              ) : null}
            </g>
          );
        })}
        {bars.map((bar) => (
          <rect className="dashboard-bar" key={bar.key || bar.label} x={bar.x} y={bar.y} width={barWidth} height={bar.barHeight} rx="4" />
        ))}
        {bars.map((bar) => (
          bar.index % labelStep === 0 || bar.index === data.length - 1 ? (
            <text className="dashboard-axis-text" key={`${bar.key || bar.label}-label`} x={bar.x + barWidth / 2} y={height - 28} textAnchor="middle">{bar.label}</text>
          ) : null
        ))}
        {yTicks ? null : <text className="dashboard-axis-text" x={padding.left} y={18}>{`${formatNumber(maxValue, 1)}${valueSuffix}`}</text>}
        {bars.map((bar) => (
          bar.value > 0 ? (
            <g className="dashboard-bar-tooltip-target" key={`${bar.key || bar.label}-tooltip`}>
              <rect className="dashboard-bar-hitbox" x={bar.x} y={bar.y} width={barWidth} height={bar.barHeight} rx="4" />
              <g className="dashboard-svg-tooltip">
                <rect className="dashboard-svg-tooltip-box" x={bar.tooltipX} y={bar.tooltipY} width={bar.tooltipWidth} height={bar.tooltipHeight} rx="8" />
                <path className="dashboard-svg-tooltip-arrow" d={`M ${round(bar.arrowX - 7)} ${round(bar.arrowY)} L ${round(bar.arrowX + 7)} ${round(bar.arrowY)} L ${round(bar.arrowX)} ${round(bar.arrowY + 8)} Z`} />
                <text className="dashboard-svg-tooltip-text" x={bar.tooltipX + bar.tooltipWidth / 2} y={bar.tooltipY + 24} textAnchor="middle">{bar.tooltipText}</text>
                <title>{bar.tooltipText}</title>
              </g>
            </g>
          ) : null
        ))}
      </svg>
    </ChartScroll>
  );
}

function LineChart({ data, valueSuffix = "", formatter = formatNumber, invert = false, yTickInterval = null }) {
  const width = 760;
  const height = 280;
  const padding = { top: 28, right: 38, bottom: 48, left: yTickInterval ? 58 : 46 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = data.map((item) => item.value).filter(Number.isFinite);
  const minRaw = Math.min(...values, 0);
  const maxRaw = Math.max(...values, 1);
  const axisMax = yTickInterval ? Math.max(yTickInterval, Math.ceil(maxRaw / yTickInterval) * yTickInterval) : null;
  const yTicks = yTickInterval
    ? Array.from({ length: Math.floor(axisMax / yTickInterval) + 1 }, (_, index) => index * yTickInterval)
    : null;
  const minValue = yTickInterval ? 0 : invert ? Math.max(0, minRaw - (maxRaw - minRaw) * 0.12) : 0;
  const maxValue = yTickInterval ? axisMax : maxRaw + Math.max(1, (maxRaw - minValue) * 0.12);
  const points = data.map((item, index) => {
    const x = padding.left + (data.length === 1 ? plotWidth : (index / (data.length - 1)) * plotWidth);
    const ratio = (item.value - minValue) / Math.max(1, maxValue - minValue);
    const y = padding.top + plotHeight - ratio * plotHeight;
    return { ...item, x, y };
  });
  const path = points.map((point, index) => `${index ? "L" : "M"} ${round(point.x)} ${round(point.y)}`).join(" ");
  const pointStep = points.length > 36 ? Math.ceil(points.length / 24) : 1;

  return (
    <div className="dashboard-chart-scroll dashboard-line-chart-wrap">
      <svg className="dashboard-chart" viewBox={`0 0 ${width} ${height}`} role="img">
        {(yTicks || [0, 0.25, 0.5, 0.75, 1]).map((tick) => {
          const y = yTicks
            ? padding.top + plotHeight - (tick / maxValue) * plotHeight
            : padding.top + tick * plotHeight;
          return (
            <g key={tick}>
              <line className="dashboard-grid-line" x1={padding.left} y1={y} x2={width - padding.right} y2={y} />
              {yTicks && tick > 0 ? (
                <text className="dashboard-axis-text" x={padding.left - 8} y={y + 5} textAnchor="end">
                  {`${formatNumber(tick)}${valueSuffix}`}
                </text>
              ) : null}
            </g>
          );
        })}
        {path ? <path className="dashboard-line" d={path} /> : null}
        {points.map((point, index) => (
          index % pointStep === 0 || index === points.length - 1 ? (
            <g key={point.key || `${point.label}-${index}`}>
              <circle className="dashboard-point" cx={point.x} cy={point.y} r="4" />
              <title>{`${point.label}: ${formatter(point.value)}${valueSuffix}`}</title>
            </g>
          ) : null
        ))}
        {points.length ? (
          <>
            {yTicks ? null : <text className="dashboard-axis-text" x={padding.left} y={18}>{`${formatter(maxRaw)}${valueSuffix}`}</text>}
            <text className="dashboard-axis-text" x={padding.left} y={height - 18}>{points[0].label}</text>
            <text className="dashboard-axis-text" x={width - padding.right} y={height - 18} textAnchor="end">{points.at(-1).label}</text>
          </>
        ) : null}
      </svg>
    </div>
  );
}

function Heatmap({ weeks, maxMiles }) {
  const monthLabels = heatmapMonthLabels(weeks);

  return (
    <div className="heatmap-scroll">
      <div className="heatmap-frame" style={{ "--weeks": weeks.length }}>
        <div className="heatmap-months">
          {monthLabels.map((label) => (
            <div className="heatmap-month" key={`${label.month}-${label.weekIndex}`} style={{ gridColumn: `${label.weekIndex + 1} / span ${label.span}` }}>
              {label.month}
            </div>
          ))}
        </div>
        <div className="heatmap">
          {weeks.flatMap((week, weekIndex) =>
            week.days.map((day, dayIndex) => (
              <div
                className={`heatmap-cell heat-${heatLevel(day.miles, maxMiles)}`}
                data-tooltip={`${formatNumber(day.miles, 1)} mi on ${day.label}`}
                key={`${weekIndex}-${dayIndex}`}
                title={`${day.label}: ${formatNumber(day.miles, 1)} mi`}
              />
            )),
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyDashboard() {
  return (
    <div className="empty">
      <div>
        <h2>No Runs Yet</h2>
        <p className="note">Upload FIT files to build aggregate training stats.</p>
      </div>
    </div>
  );
}

function buildDashboard(rawRuns) {
  const runs = rawRuns.map(normalizeRun).filter(Boolean).sort((left, right) => left.date - right.date);
  const totalMiles = sum(runs.map((run) => run.distance));
  const totalSeconds = sum(runs.map((run) => run.durationSeconds));
  const latestDate = runs.at(-1)?.date || null;
  const earliestDate = runs[0]?.date || null;
  const weekCount = countCalendarWeeks(earliestDate, latestDate);
  const currentMonthKey = latestDate ? monthKey(latestDate) : null;
  const currentMonthMiles = sum(runs.filter((run) => monthKey(run.date) === currentMonthKey).map((run) => run.distance));
  const longestRun = runs.reduce((best, run) => (run.distance > (best?.distance || 0) ? run : best), null);
  const weekly = groupRuns(runs, weekKey, weekLabel);
  const monthly = groupRuns(runs, monthKey, monthLabel);

  return {
    runs,
    rangeLabel: runs.length ? `${formatDate(earliestDate)} - ${formatDate(latestDate)} | ${runs.length} stored runs` : "No runs stored yet.",
    cards: [
      { label: "Total Miles", value: formatNumber(totalMiles, 1), detail: "mi logged" },
      { label: "Weekly Avg", value: formatNumber(totalMiles / Math.max(1, weekCount), 1), detail: "mi/week" },
      { label: "Runs", value: String(runs.length), detail: `${weekCount} calendar weeks` },
      { label: "Avg Pace", value: formatPace(totalSeconds / Math.max(totalMiles, 0.01)), detail: "weighted by miles" },
      { label: "Total Time", value: formatDuration(totalSeconds), detail: "moving time" },
      { label: "Longest Run", value: `${formatNumber(longestRun?.distance || 0, 1)} mi`, detail: longestRun ? formatDate(longestRun.date) : "-" },
      { label: "Run Streak", value: String(currentRunStreak(runs)), detail: "run days through latest" },
      { label: "This Month", value: formatNumber(currentMonthMiles, 1), detail: currentMonthKey || "-" },
    ],
    weeklySubtitle: `${formatNumber(average(weekly.map((item) => item.distance)), 1)} mi average per active week`,
    cumulativeSubtitle: `${formatNumber(totalMiles, 1)} total miles`,
    weeklyMileage: weekly.map((item) => ({ key: item.key, label: shortWeekLabel(item.start), value: item.distance })),
    monthlyMileage: monthly.map((item) => ({ key: item.key, label: item.label, value: item.distance })),
    cumulativeMiles: cumulativeRuns(runs),
    weeklyPace: weekly.map((item) => ({
      key: item.key,
      label: shortWeekLabel(item.start),
      value: item.durationSeconds / Math.max(item.distance, 0.01),
    })),
    weeklyHeartRate: weekly
      .filter((item) => item.heartRateSamples > 0)
      .map((item) => ({
        key: item.key,
        label: shortWeekLabel(item.start),
        value: item.heartRateLoad / item.heartRateSamples,
      })),
    heatmapWeeks: heatmapWeeks(runs),
    maxDailyMiles: Math.max(1, ...dailyMiles(runs).map((day) => day.miles)),
    distanceDistribution: distanceDistribution(runs),
    longRunTrend: weekly.map((item) => ({
      key: item.key,
      label: shortWeekLabel(item.start),
      value: item.longestRun,
    })),
  };
}

function normalizeRun(run) {
  const date = parseRunDate(run);
  const distance = parseNumber(run.metrics?.distance?.value);
  if (!date || distance === null) return null;
  return {
    id: run.file?.id,
    date,
    distance,
    durationSeconds: parseDuration(run.metrics?.duration?.value),
    avgHeartRate: parseNumber(run.metrics?.avgHeartRate?.value),
  };
}

function parseRunDate(run) {
  const value = run.details?.sortDate || run.run?.activityDate || run.details?.date || run.file?.uploadedAt;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? date : null;
}

function groupRuns(runs, keyFn, labelFn) {
  const groups = new Map();
  for (const run of runs) {
    const key = keyFn(run.date);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: labelFn(run.date),
        start: weekStart(run.date),
        distance: 0,
        durationSeconds: 0,
        runCount: 0,
        longestRun: 0,
        heartRateLoad: 0,
        heartRateSamples: 0,
      });
    }
    const group = groups.get(key);
    group.distance += run.distance;
    group.durationSeconds += run.durationSeconds;
    group.runCount += 1;
    group.longestRun = Math.max(group.longestRun, run.distance);
    if (run.avgHeartRate !== null) {
      group.heartRateLoad += run.avgHeartRate * Math.max(1, run.durationSeconds || run.distance);
      group.heartRateSamples += Math.max(1, run.durationSeconds || run.distance);
    }
  }
  return [...groups.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function cumulativeRuns(runs) {
  let total = 0;
  return runs.map((run) => {
    total += run.distance;
    return { key: run.id, label: formatShortDate(run.date), value: total };
  });
}

function distanceDistribution(runs) {
  return DISTANCE_BINS.map((bin) => ({
    key: bin.label,
    label: bin.label,
    value: runs.filter((run) => run.distance >= bin.min && run.distance < bin.max).length,
  }));
}

function heatmapWeeks(runs) {
  const days = dailyMiles(runs);
  if (!days.length) return [];
  const byKey = new Map(days.map((day) => [dateKey(day.date), day]));
  const start = weekStart(days[0].date);
  const end = addDays(weekStart(days.at(-1).date), 6);
  const weeks = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 7)) {
    weeks.push({
      days: Array.from({ length: 7 }, (_, index) => {
        const date = addDays(cursor, index);
        const found = byKey.get(dateKey(date));
        return { date, miles: found?.miles || 0, label: formatDate(date) };
      }),
    });
  }
  return weeks;
}

function heatmapMonthLabels(weeks) {
  const labels = [];
  for (let index = 0; index < weeks.length; index += 1) {
    const monthStart = weeks[index].days.find((day) => day.date.getDate() <= 7) || weeks[index].days[0];
    const month = monthLabel(monthStart.date);
    const previous = labels.at(-1);
    if (!previous || previous.month !== month) {
      labels.push({ month, weekIndex: index, span: 1 });
    } else {
      previous.span += 1;
    }
  }
  return labels;
}

function dailyMiles(runs) {
  const byDay = new Map();
  for (const run of runs) {
    const key = dateKey(run.date);
    const current = byDay.get(key) || { date: startOfDay(run.date), miles: 0 };
    current.miles += run.distance;
    byDay.set(key, current);
  }
  return [...byDay.values()].sort((left, right) => left.date - right.date);
}

function currentRunStreak(runs) {
  const days = new Set(runs.map((run) => dateKey(run.date)));
  if (!days.size) return 0;
  let cursor = startOfDay(runs.at(-1).date);
  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function countCalendarWeeks(start, end) {
  if (!start || !end) return 0;
  return Math.max(1, Math.floor((weekStart(end) - weekStart(start)) / (7 * DAY_MS)) + 1);
}

function weekKey(date) {
  return dateKey(weekStart(date));
}

function weekLabel(date) {
  return `Week of ${formatDate(weekStart(date))}`;
}

function shortWeekLabel(date) {
  return formatShortDate(date);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

function weekStart(date) {
  const result = startOfDay(date);
  const day = result.getDay();
  const diff = (day - WEEK_START_OFFSET + 7) % 7;
  result.setDate(result.getDate() - diff);
  return result;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseNumber(value) {
  const number = Number.parseFloat(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(number) ? number : null;
}

function parseDuration(value) {
  const parts = String(value || "").split(":").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? sum(valid) / valid.length : 0;
}

function heatLevel(miles, maxMiles) {
  if (!miles) return 0;
  return Math.max(1, Math.min(4, Math.ceil((miles / Math.max(1, maxMiles)) * 4)));
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPace(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

function formatDuration(seconds) {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function round(value) {
  return Number(value.toFixed(1));
}
