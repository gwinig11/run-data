"use client";

import { useEffect, useRef } from "react";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export default function RouteMap({ route }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!route?.points?.length || !containerRef.current) return undefined;

    let cancelled = false;

    async function mountMap() {
      const leaflet = await import("leaflet");
      const L = leaflet.default ?? leaflet;
      if (cancelled || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
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
      }
    };
  }, [route]);

  if (!route?.points?.length) return null;

  return (
    <section>
      <div className="route-map-card">
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
