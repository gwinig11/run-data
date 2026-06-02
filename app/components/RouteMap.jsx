"use client";

import { useEffect, useRef, useState } from "react";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export default function RouteMap({ route }) {
  const containerRef = useRef(null);
  const leafletRef = useRef(null);
  const mapRef = useRef(null);
  const mileMarkerLayerRef = useRef(null);
  const [showMileMarkers, setShowMileMarkers] = useState(true);

  useEffect(() => {
    if (!route?.points?.length || !containerRef.current) return undefined;

    let cancelled = false;

    async function mountMap() {
      const leaflet = await import("leaflet");
      const L = leaflet.default ?? leaflet;
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        mileMarkerLayerRef.current = null;
      }

      const map = L.map(containerRef.current, {
        attributionControl: true,
        fadeAnimation: true,
        inertia: true,
        markerZoomAnimation: true,
        maxZoom: 19,
        scrollWheelZoom: true,
        wheelDebounceTime: 24,
        wheelPxPerZoomLevel: 72,
        zoomAnimation: true,
        zoomDelta: 0.5,
        zoomSnap: 0.25,
      });
      mapRef.current = map;

      L.tileLayer(TILE_URL, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        detectRetina: true,
        maxZoom: 19,
      }).addTo(map);

      const coordinates = route.points
        .map((point) => [point.latitude, point.longitude])
        .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude));

      if (!coordinates.length) return;

      const routeLine = L.polyline(coordinates, {
        color: "#ef4444",
        lineCap: "round",
        lineJoin: "round",
        opacity: 0.92,
        weight: 5,
      }).addTo(map);

      const mileMarkerLayer = L.layerGroup().addTo(map);
      mileMarkerLayerRef.current = mileMarkerLayer;
      if (showMileMarkers) addMileMarkers(L, mileMarkerLayer, route.points);

      L.circleMarker(coordinates[0], markerOptions("#22c55e")).addTo(map);
      L.circleMarker(coordinates[coordinates.length - 1], markerOptions("#ef4444")).addTo(map);

      map.fitBounds(routeLine.getBounds(), {
        animate: false,
        maxZoom: 15,
        padding: [42, 42],
      });

      window.requestAnimationFrame(() => map.invalidateSize());
    }

    mountMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        mileMarkerLayerRef.current = null;
      }
    };
  }, [route]);

  useEffect(() => {
    const L = leafletRef.current;
    const mileMarkerLayer = mileMarkerLayerRef.current;
    if (!L || !mileMarkerLayer || !route?.points?.length) return;

    mileMarkerLayer.clearLayers();
    if (showMileMarkers) addMileMarkers(L, mileMarkerLayer, route.points);
  }, [route, showMileMarkers]);

  if (!route?.points?.length) return null;

  return (
    <section>
      <div className="route-map-card">
        <button
          type="button"
          className={`mile-marker-toggle${showMileMarkers ? " is-active" : ""}`}
          aria-pressed={showMileMarkers}
          onClick={() => setShowMileMarkers((value) => !value)}
        >
          Mile markers
        </button>
        <div ref={containerRef} className="route-leaflet-map" aria-label="Workout route map" />
      </div>
    </section>
  );
}

function markerOptions(fillColor) {
  return {
    color: "#ffffff",
    fillColor,
    fillOpacity: 1,
    opacity: 1,
    radius: 9,
    weight: 4,
  };
}

function addMileMarkers(L, layer, points) {
  for (const marker of buildMileMarkers(points)) {
    L.marker([marker.latitude, marker.longitude], {
      icon: L.divIcon({
        className: "mile-marker-icon",
        html: String(marker.mile),
        iconAnchor: [11, 11],
        iconSize: [22, 22],
      }),
      interactive: false,
      keyboard: false,
    }).addTo(layer);
  }
}

function buildMileMarkers(points) {
  const enriched = [];
  let distance = validDistance(points[0]?.distance) ?? 0;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const fitDistance = validDistance(point.distance);
    if (fitDistance !== null) {
      distance = fitDistance;
    } else if (index > 0) {
      distance += distanceBetweenMiles(points[index - 1], point);
    }
    enriched.push({ ...point, distance });
  }

  const totalDistance = enriched.at(-1)?.distance ?? 0;
  const fullMiles = Math.floor(totalDistance);
  const markers = [];

  for (let mile = 1; mile <= fullMiles; mile += 1) {
    const point = pointAtDistance(enriched, mile);
    if (point) markers.push({ mile, latitude: point.latitude, longitude: point.longitude });
  }

  return markers;
}

function pointAtDistance(points, targetDistance) {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous.distance <= targetDistance && current.distance >= targetDistance) {
      const segmentDistance = current.distance - previous.distance;
      const ratio = segmentDistance > 0 ? (targetDistance - previous.distance) / segmentDistance : 0;
      return {
        latitude: previous.latitude + (current.latitude - previous.latitude) * ratio,
        longitude: previous.longitude + (current.longitude - previous.longitude) * ratio,
      };
    }
  }
  return null;
}

function distanceBetweenMiles(start, end) {
  if (!isFiniteCoordinate(start) || !isFiniteCoordinate(end)) return 0;
  const earthRadiusMiles = 3958.7613;
  const startLat = toRadians(start.latitude);
  const endLat = toRadians(end.latitude);
  const deltaLat = toRadians(end.latitude - start.latitude);
  const deltaLng = toRadians(end.longitude - start.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isFiniteCoordinate(point) {
  return Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude);
}

function validDistance(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}
