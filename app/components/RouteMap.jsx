"use client";

import { useEffect, useMemo, useState } from "react";

const TILE_SIZE = 256;
const MAP_WIDTH = 1120;
const MAP_HEIGHT = 360;

export default function RouteMap({ route }) {
  const [zoomOffset, setZoomOffset] = useState(0);

  useEffect(() => {
    setZoomOffset(0);
  }, [route]);

  const map = useMemo(() => buildMap(route, zoomOffset), [route, zoomOffset]);
  if (!map) return null;

  return (
    <section>
      <div className="route-map-card">
        <div className="map-controls" aria-label="Map controls">
          <button type="button" onClick={() => setZoomOffset((value) => Math.min(value + 1, 3))} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => setZoomOffset((value) => Math.max(value - 1, -3))} aria-label="Zoom out">-</button>
        </div>
        <div className="map-canvas" role="img" aria-label="Workout route map">
          {map.tiles.map((tile) => (
            <img
              alt=""
              className="map-tile"
              draggable="false"
              key={`${tile.x}-${tile.y}-${tile.z}`}
              src={`https://tile.openstreetmap.org/${tile.z}/${tile.wrappedX}/${tile.y}.png`}
              style={{ left: tile.left, top: tile.top }}
            />
          ))}
          <svg className="route-overlay" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} aria-hidden="true">
            <path className="route-line" d={map.path} />
            <circle className="route-marker start" cx={map.start.x} cy={map.start.y} r="9" />
            <circle className="route-marker end" cx={map.end.x} cy={map.end.y} r="9" />
          </svg>
          <div className="map-attribution">
            © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors
          </div>
        </div>
      </div>
    </section>
  );
}

function buildMap(route, zoomOffset) {
  if (!route?.points?.length) return null;

  const fitZoom = fitRouteZoom(route.bounds);
  const zoom = clamp(fitZoom + zoomOffset, 3, 18);
  const center = {
    latitude: (route.bounds.minLatitude + route.bounds.maxLatitude) / 2,
    longitude: (route.bounds.minLongitude + route.bounds.maxLongitude) / 2,
  };
  const centerWorld = latLngToWorld(center, zoom);
  const origin = {
    x: centerWorld.x - MAP_WIDTH / 2,
    y: centerWorld.y - MAP_HEIGHT / 2,
  };
  const tiles = buildTiles(origin, zoom);
  const projectedPoints = route.points.map((point) => worldToMap(latLngToWorld(point, zoom), origin));

  return {
    tiles,
    path: buildSvgPath(projectedPoints),
    start: worldToMap(latLngToWorld(route.start, zoom), origin),
    end: worldToMap(latLngToWorld(route.end, zoom), origin),
  };
}

function fitRouteZoom(bounds) {
  const padding = 72;
  for (let zoom = 18; zoom >= 3; zoom -= 1) {
    const northwest = latLngToWorld({ latitude: bounds.maxLatitude, longitude: bounds.minLongitude }, zoom);
    const southeast = latLngToWorld({ latitude: bounds.minLatitude, longitude: bounds.maxLongitude }, zoom);
    if (Math.abs(southeast.x - northwest.x) <= MAP_WIDTH - padding * 2 && Math.abs(southeast.y - northwest.y) <= MAP_HEIGHT - padding * 2) {
      return zoom;
    }
  }
  return 3;
}

function buildTiles(origin, zoom) {
  const scale = 2 ** zoom;
  const minTileX = Math.floor(origin.x / TILE_SIZE);
  const maxTileX = Math.floor((origin.x + MAP_WIDTH) / TILE_SIZE);
  const minTileY = Math.floor(origin.y / TILE_SIZE);
  const maxTileY = Math.floor((origin.y + MAP_HEIGHT) / TILE_SIZE);
  const tiles = [];

  for (let x = minTileX; x <= maxTileX; x += 1) {
    for (let y = minTileY; y <= maxTileY; y += 1) {
      if (y < 0 || y >= scale) continue;
      tiles.push({
        x,
        y,
        z: zoom,
        wrappedX: ((x % scale) + scale) % scale,
        left: x * TILE_SIZE - origin.x,
        top: y * TILE_SIZE - origin.y,
      });
    }
  }

  return tiles;
}

function latLngToWorld(point, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const latitude = clamp(point.latitude, -85.05112878, 85.05112878);
  const latRad = (latitude * Math.PI) / 180;
  return {
    x: ((point.longitude + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale,
  };
}

function worldToMap(point, origin) {
  return { x: point.x - origin.x, y: point.y - origin.y };
}

function buildSvgPath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
