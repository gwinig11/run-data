const DISPLAY_TIME_ZONE = process.env.ACTIVITY_TIME_ZONE || "America/New_York";

export function summarizeFit(buffer, latest) {
  const parsed = parseFit(buffer);
  return buildActivitySummary(parsed, latest);
}

function parseFit(buffer) {
  const headerSize = buffer.readUInt8(0);
  const dataSize = buffer.readUInt32LE(4);
  const dataType = buffer.subarray(8, 12).toString("ascii");

  if (dataType !== ".FIT") throw new Error("This does not look like a FIT file.");

  const end = headerSize + dataSize;
  const definitions = new Map();
  const counts = new Map();
  const lastByGlobal = new Map();
  const recordsByGlobal = new Map();
  let offset = headerSize;

  while (offset < end) {
    const header = buffer.readUInt8(offset);
    offset += 1;

    if (header & 0x40) {
      const localMessageType = header & 0x0f;
      const hasDeveloperData = Boolean(header & 0x20);
      offset += 1;
      const littleEndian = buffer.readUInt8(offset) === 0;
      offset += 1;
      const globalMessageNumber = readUInt16(buffer, offset, littleEndian);
      offset += 2;

      const fields = [];
      const fieldCount = buffer.readUInt8(offset);
      offset += 1;
      for (let index = 0; index < fieldCount; index += 1) {
        fields.push({
          number: buffer.readUInt8(offset),
          size: buffer.readUInt8(offset + 1),
          baseType: buffer.readUInt8(offset + 2),
        });
        offset += 3;
      }

      const developerFields = [];
      if (hasDeveloperData) {
        const developerFieldCount = buffer.readUInt8(offset);
        offset += 1;
        for (let index = 0; index < developerFieldCount; index += 1) {
          developerFields.push({ size: buffer.readUInt8(offset + 1) });
          offset += 3;
        }
      }

      definitions.set(localMessageType, { globalMessageNumber, littleEndian, fields, developerFields });
      continue;
    }

    const localMessageType = header & 0x80 ? (header >> 5) & 0x03 : header & 0x0f;
    const definition = definitions.get(localMessageType);
    if (!definition) throw new Error(`Missing FIT definition for local message ${localMessageType}.`);

    const fields = {};
    for (const field of definition.fields) {
      fields[field.number] = readFitValue(buffer, offset, field, definition.littleEndian);
      offset += field.size;
    }

    for (const field of definition.developerFields) offset += field.size;

    const globalNumber = definition.globalMessageNumber;
    counts.set(globalNumber, (counts.get(globalNumber) || 0) + 1);
    lastByGlobal.set(globalNumber, fields);
    if ([0, 18, 19, 20, 49].includes(globalNumber)) {
      if (!recordsByGlobal.has(globalNumber)) recordsByGlobal.set(globalNumber, []);
      recordsByGlobal.get(globalNumber).push(fields);
    }
  }

  return { counts, lastByGlobal, recordsByGlobal };
}

function buildActivitySummary(parsed, latest) {
  const session = lastMessage(parsed, 18) || {};
  const fileId = lastMessage(parsed, 0) || {};
  const fileCreator = lastMessage(parsed, 49) || {};
  const records = parsed.recordsByGlobal.get(20) || [];
  const laps = parsed.recordsByGlobal.get(19) || [];
  const derived = deriveFromRecords(records);
  const sport = firstNumber(session[5], fileId[0]);
  const isRunning = sport === 1;
  const startTime = firstNumber(session[2], fileId[4], records[0]?.[253]);
  const durationSeconds = scaled(firstNumber(session[7], session[8], derived.durationSeconds), 1000);
  const distanceMeters = scaled(firstNumber(session[9], derived.distanceMeters), 100);
  const avgCadence = firstNumber(session[18], derived.avgCadence);
  const avgSpeedMps = scaled(firstNumber(session[14], derived.avgSpeed), 1000);

  return {
    file: latest,
    details: {
      activity: sportName(sport),
      date: startTime ? formatFitDate(startTime) : formatDate(latest.uploadedAt),
      records: formatInteger(parsed.counts.get(20) || records.length),
    },
    metrics: {
      duration: metric(formatDuration(durationSeconds), ""),
      distance: metric(formatDecimal(metersToMiles(distanceMeters), 2), "mi"),
      avgHeartRate: metric(displayValue(firstNumber(session[16], derived.avgHeartRate)), "bpm"),
      maxHeartRate: metric(displayValue(firstNumber(session[17], derived.maxHeartRate)), "bpm"),
      avgPace: metric(formatPaceFromMps(avgSpeedMps), "min/mi"),
      avgSpeed: metric(formatDecimal(mpsToMph(avgSpeedMps), 1), "mph"),
      maxSpeed: metric(formatDecimal(mpsToMph(scaled(firstNumber(session[15], derived.maxSpeed), 1000)), 1), "mph"),
      avgPower: metric(displayValue(firstNumber(session[20], derived.avgPower)), "W"),
      maxPower: metric(displayValue(firstNumber(session[21], derived.maxPower)), "W"),
      elevation: metric(formatInteger(metersToFeet(firstNumber(session[22], derived.elevationMeters))), "ft"),
      calories: metric(displayValue(firstNumber(session[11])), "kcal"),
      avgCadence: metric(displayValue(isRunning && avgCadence ? avgCadence * 2 : avgCadence), isRunning ? "spm" : "rpm"),
    },
    laps: buildLapRows(laps, isRunning),
    route: buildRouteMap(records),
    chart: buildDistanceChart(records, isRunning),
  };
}

function buildLapRows(laps, isRunning) {
  return laps.map((lap, index) => {
    const avgCadence = firstNumber(lap[17]);
    return {
      index: String(index + 1),
      duration: formatDuration(scaled(firstNumber(lap[7], lap[8]), 1000)),
      distance: `${formatDecimal(metersToMiles(scaled(lap[9], 100)), 2)} mi`,
      avgSpeed: `${formatDecimal(mpsToMph(scaled(lap[13], 1000)), 1)} mph`,
      maxSpeed: `${formatDecimal(mpsToMph(scaled(lap[14], 1000)), 1)} mph`,
      avgHeartRate: displayValue(lap[15]),
      maxHeartRate: displayValue(lap[16]),
      avgCadence: displayValue(isRunning && avgCadence ? avgCadence * 2 : avgCadence),
    };
  });
}

function buildDistanceChart(records, isRunning) {
  const points = records
    .map((record) => {
      const distanceMeters = scaled(record[5], 100);
      if (distanceMeters === null) return null;
      const cadence = validNumber(record[4]);
      return {
        distance: metersToMiles(distanceMeters),
        heartRate: validNumber(record[3]),
        elevation: metersToFeet(scaled(record[78] ?? record[2], 5, 500)),
        speed: mpsToMph(scaled(record[73] ?? record[6], 1000)),
        power: validNumber(record[7]),
        cadence: cadence === null ? null : isRunning ? cadence * 2 : cadence,
      };
    })
    .filter((point) => point && point.distance !== null);

  if (points.length < 2) return null;

  const smoothed = smoothChartMetric(points, "elevation", 45);
  const downsampled = downsamplePoints(smoothed, 420);
  const width = 1120;
  const height = 330;
  const plot = { x: 28, y: 28, width: 1044, height: 256 };
  const maxDistance = Math.max(...downsampled.map((point) => point.distance));
  const definitions = [
    { key: "heartRate", label: "Heart Rate", color: "#ef4444", emphasis: true },
    { key: "elevation", label: "Elevation", color: "#94a3b8" },
    { key: "speed", label: "Speed", color: "#a7c7ff" },
    { key: "power", label: "Power", color: "#ffd596" },
    { key: "cadence", label: "Cadence", color: "#a7e3c7" },
  ];
  const series = definitions.map((definition) => buildChartSeries(definition, downsampled, plot, maxDistance)).filter(Boolean);
  const heartRateSeries = series.find((item) => item.key === "heartRate");

  return {
    width,
    height,
    plot,
    grid: [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const y = Math.round(plot.y + ratio * plot.height);
      return { x1: plot.x, y1: y, x2: plot.x + plot.width, y2: y };
    }),
    xLabels: buildXAxisLabels(plot, maxDistance),
    yLabels: [180, 135, 90, 45, 0].map((value) => ({
      text: String(value),
      x: plot.x + plot.width + 12,
      y: Math.round(plot.y + plot.height - (value / 180) * plot.height + 5),
    })),
    series,
    tooltipPoints: buildTooltipPoints(downsampled, series, plot, maxDistance),
    areaPath: heartRateSeries ? buildAreaPath(heartRateSeries.points, plot) : "",
  };
}

function buildRouteMap(records) {
  const points = records
    .map((record) => {
      const latitude = semicirclesToDegrees(record[0], 90);
      const longitude = semicirclesToDegrees(record[1], 180);
      if (latitude === null || longitude === null) return null;
      return { latitude, longitude };
    })
    .filter(Boolean);

  if (points.length < 2) return null;

  const downsampled = downsamplePoints(points, 700);
  const latitudes = downsampled.map((point) => point.latitude);
  const longitudes = downsampled.map((point) => point.longitude);

  return {
    points: downsampled.map((point) => ({
      latitude: roundCoordinate(point.latitude),
      longitude: roundCoordinate(point.longitude),
    })),
    start: {
      latitude: roundCoordinate(downsampled[0].latitude),
      longitude: roundCoordinate(downsampled[0].longitude),
    },
    end: {
      latitude: roundCoordinate(downsampled.at(-1).latitude),
      longitude: roundCoordinate(downsampled.at(-1).longitude),
    },
    bounds: {
      minLatitude: roundCoordinate(Math.min(...latitudes)),
      maxLatitude: roundCoordinate(Math.max(...latitudes)),
      minLongitude: roundCoordinate(Math.min(...longitudes)),
      maxLongitude: roundCoordinate(Math.max(...longitudes)),
    },
  };
}

function semicirclesToDegrees(value, maxAbsDegrees) {
  const number = validNumber(value);
  if (number === null) return null;
  const degrees = (number * 180) / 2147483648;
  return Math.abs(degrees) <= maxAbsDegrees ? degrees : null;
}

function roundCoordinate(value) {
  return Number(value.toFixed(6));
}

function buildChartSeries(definition, points, plot, maxDistance) {
  const values = points.map((point) => point[definition.key]).filter(Number.isFinite);
  if (values.length < 2) return null;
  const range = chartRange(definition.key, values);
  const mapped = points
    .map((point) => {
      const value = point[definition.key];
      if (!Number.isFinite(value)) return null;
      return { x: plot.x + (point.distance / maxDistance) * plot.width, y: chartYForValue(value, range, plot) };
    })
    .filter(Boolean);
  return { ...definition, range, points: mapped, path: buildLinePath(mapped) };
}

function buildTooltipPoints(points, series, plot, maxDistance) {
  return points.map((point) => ({
    x: roundSvg(plot.x + (point.distance / maxDistance) * plot.width),
    distance: `${formatDecimal(point.distance, 2)} mi`,
    metrics: series
      .map((item) => {
        const value = point[item.key];
        if (!Number.isFinite(value)) return null;
        return {
          key: item.key,
          label: item.label,
          color: item.color,
          value: formatChartTooltipValue(item.key, value),
          y: roundSvg(chartYForValue(value, item.range, plot)),
        };
      })
      .filter(Boolean),
  }));
}

function readFitValue(buffer, offset, field, littleEndian) {
  const baseType = field.baseType & 0x1f;
  const size = field.size;
  if (baseType === 7) return buffer.subarray(offset, offset + size).toString("utf8").replace(/\0+$/g, "");
  const unitSize = baseTypeUnitSize(baseType);
  if (size > unitSize && size % unitSize === 0) {
    const values = [];
    for (let at = offset; at < offset + size; at += unitSize) {
      const value = readSingleFitValue(buffer, at, baseType, littleEndian);
      if (!isInvalidFitValue(value, baseType, unitSize)) values.push(value);
    }
    return values;
  }
  const value = readSingleFitValue(buffer, offset, baseType, littleEndian);
  return isInvalidFitValue(value, baseType, size) ? null : value;
}

function readSingleFitValue(buffer, offset, baseType, littleEndian) {
  if ([0, 2, 10, 13].includes(baseType)) return buffer.readUInt8(offset);
  if (baseType === 1) return buffer.readInt8(offset);
  if (baseType === 3) return littleEndian ? buffer.readInt16LE(offset) : buffer.readInt16BE(offset);
  if ([4, 11].includes(baseType)) return readUInt16(buffer, offset, littleEndian);
  if (baseType === 5) return littleEndian ? buffer.readInt32LE(offset) : buffer.readInt32BE(offset);
  if ([6, 12].includes(baseType)) return littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
  if (baseType === 8) return littleEndian ? buffer.readFloatLE(offset) : buffer.readFloatBE(offset);
  if (baseType === 9) return littleEndian ? buffer.readDoubleLE(offset) : buffer.readDoubleBE(offset);
  return buffer.readUInt8(offset);
}

function readUInt16(buffer, offset, littleEndian) {
  return littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

function isInvalidFitValue(value, baseType, size) {
  if (value === null || value === undefined) return true;
  if ([0, 2, 10, 13].includes(baseType) && size === 1) return value === 0xff;
  if ([4, 11].includes(baseType) && size === 2) return value === 0xffff;
  if ([6, 12].includes(baseType) && size === 4) return value === 0xffffffff;
  if (baseType === 1 && size === 1) return value === 0x7f;
  if (baseType === 3 && size === 2) return value === 0x7fff;
  if (baseType === 5 && size === 4) return value === 0x7fffffff;
  return false;
}

function baseTypeUnitSize(baseType) {
  if ([3, 4, 11].includes(baseType)) return 2;
  if ([5, 6, 8, 12].includes(baseType)) return 4;
  if (baseType === 9) return 8;
  return 1;
}

function deriveFromRecords(records) {
  const heartRates = [];
  const powers = [];
  const speeds = [];
  const cadences = [];
  const elevations = [];
  let firstTimestamp = null;
  let lastTimestamp = null;
  let distanceMeters = null;
  for (const record of records) {
    firstTimestamp ??= validNumber(record[253]);
    lastTimestamp = validNumber(record[253]) ?? lastTimestamp;
    distanceMeters = scaled(record[5], 100) ?? distanceMeters;
    pushNumber(heartRates, record[3]);
    pushNumber(powers, record[7]);
    pushNumber(speeds, record[73] ?? record[6]);
    pushNumber(cadences, record[4]);
    pushNumber(elevations, scaled(record[78] ?? record[2], 5, 500));
  }
  return {
    durationSeconds: firstTimestamp && lastTimestamp ? (lastTimestamp - firstTimestamp) * 1000 : null,
    distanceMeters,
    avgHeartRate: average(heartRates),
    maxHeartRate: max(heartRates),
    avgPower: average(powers),
    maxPower: max(powers),
    avgSpeed: average(speeds),
    maxSpeed: max(speeds),
    avgCadence: average(cadences),
    elevationMeters: positiveGain(elevations),
  };
}

function lastMessage(parsed, globalNumber) {
  return parsed.recordsByGlobal.get(globalNumber)?.at(-1) || parsed.lastByGlobal.get(globalNumber);
}

function firstNumber(...values) {
  for (const value of values) {
    const number = validNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function validNumber(value) {
  const number = Array.isArray(value) ? value[0] : value;
  return Number.isFinite(number) ? number : null;
}

function pushNumber(values, value) {
  const number = validNumber(value);
  if (number !== null) values.push(number);
}

function scaled(value, scale, offset = 0) {
  const number = validNumber(value);
  return number === null ? null : number / scale - offset;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function max(values) {
  return values.length ? Math.max(...values) : null;
}

function positiveGain(values) {
  let gain = 0;
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    if (delta > 0) gain += delta;
  }
  return gain || null;
}

function chartYForValue(value, range, plot) {
  return plot.y + plot.height - normalizeForChart(value, range) * plot.height;
}

function chartRange(key, values) {
  if (key === "heartRate" || key === "cadence") return { min: 0, max: 180 };
  if (key === "speed") return { min: 0, max: Math.max(15, max(values) || 15) };
  if (key === "power") return { min: 0, max: Math.max(500, max(values) || 500) };
  if (key === "elevation") return paddedChartRange(values, 300, 0.12);
  return paddedChartRange(values, 16, 0.18);
}

function paddedChartRange(values, minimumSpan, paddingRatio) {
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = Math.max((maxValue - minValue) * (1 + paddingRatio * 2), minimumSpan);
  const center = (minValue + maxValue) / 2;
  return { min: center - span / 2, max: center + span / 2 };
}

function normalizeForChart(value, range) {
  if (range.max === range.min) return 0.5;
  return Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
}

function buildLinePath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${roundSvg(point.x)} ${roundSvg(point.y)}`).join(" ");
}

function buildAreaPath(points, plot) {
  if (!points.length) return "";
  return `${buildLinePath(points)} L ${roundSvg(points.at(-1).x)} ${roundSvg(plot.y + plot.height)} L ${roundSvg(points[0].x)} ${roundSvg(plot.y + plot.height)} Z`;
}

function buildXAxisLabels(plot, maxDistance) {
  const lastMile = Math.max(0, Math.floor(maxDistance));
  return Array.from({ length: lastMile + 1 }, (_, distance) => ({
    text: `${distance}mi`,
    x: Math.round(plot.x + (maxDistance ? distance / maxDistance : 0) * plot.width),
    y: plot.y + plot.height + 28,
  }));
}

function formatChartTooltipValue(key, value) {
  if (key === "heartRate") return `${formatInteger(value)} bpm`;
  if (key === "elevation") return `${formatInteger(value)} ft`;
  if (key === "speed") return `${formatDecimal(value, 1)} mph`;
  if (key === "power") return `${formatInteger(value)} W`;
  if (key === "cadence") return `${formatInteger(value)} spm`;
  return formatDecimal(value, 1);
}

function downsamplePoints(points, limit) {
  if (points.length <= limit) return points;
  const result = [];
  for (let index = 0; index < limit; index += 1) {
    result.push(points[Math.floor((index / (limit - 1)) * (points.length - 1))]);
  }
  return result;
}

function smoothChartMetric(points, key, windowSize) {
  const halfWindow = Math.floor(windowSize / 2);
  return points.map((point, index) => {
    const values = [];
    for (let sampleIndex = Math.max(0, index - halfWindow); sampleIndex <= Math.min(points.length - 1, index + halfWindow); sampleIndex += 1) {
      const value = points[sampleIndex][key];
      if (Number.isFinite(value)) values.push(value);
    }
    return values.length ? { ...point, [key]: average(values) } : point;
  });
}

function roundSvg(value) {
  return Number(value).toFixed(1);
}

function sportName(value) {
  return new Map([
    [0, "Generic"],
    [1, "Running"],
    [2, "Cycling"],
    [5, "Swimming"],
    [11, "Walking"],
    [15, "Training"],
    [17, "Hiking"],
  ]).get(value) || "Activity";
}

function metric(value, unit) {
  return { value: value || "-", unit };
}

function displayValue(value) {
  const number = validNumber(value);
  return number === null ? "-" : formatInteger(number);
}

function formatDuration(seconds) {
  const number = validNumber(seconds);
  if (number === null) return "-";
  const totalSeconds = Math.round(number);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatFitDate(seconds) {
  return formatDate(new Date((seconds + 631065600) * 1000).toISOString());
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(value));
}

function formatInteger(value) {
  const number = validNumber(value);
  return number === null ? "-" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(number);
}

function formatDecimal(value, digits) {
  const number = validNumber(value);
  return number === null ? "-" : number.toFixed(digits);
}

function formatPaceFromMps(value) {
  const metersPerSecond = validNumber(value);
  if (!metersPerSecond || metersPerSecond <= 0) return "-";
  const secondsPerMile = 1609.344 / metersPerSecond;
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.round(secondsPerMile % 60);
  if (seconds === 60) return `${minutes + 1}:00`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function metersToMiles(value) {
  const number = validNumber(value);
  return number === null ? null : number / 1609.344;
}

function mpsToMph(value) {
  const number = validNumber(value);
  return number === null ? null : number * 2.2369362920544;
}

function metersToFeet(value) {
  const number = validNumber(value);
  return number === null ? null : number * 3.280839895;
}
