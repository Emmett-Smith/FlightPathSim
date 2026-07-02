import JSZip from "jszip";

// Mirrors extract_all_linestring_coords in generate_tour.py: pulls every
// <LineString><coordinates> block and returns [[lat, lon, alt], ...] segments.
export function extractSegmentsFromKmlText(kmlText) {
  const doc = new DOMParser().parseFromString(kmlText, "text/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Could not parse KML: malformed XML");
  }

  const coordNodes = doc.getElementsByTagNameNS(
    "http://www.opengis.net/kml/2.2",
    "coordinates",
  );

  const lineStringCoordNodes = Array.from(coordNodes).filter(
    (node) => node.parentElement?.localName === "LineString",
  );

  if (lineStringCoordNodes.length === 0) {
    throw new Error("No LineStrings found in this file");
  }

  return lineStringCoordNodes.map((node) => {
    const raw = node.textContent.trim();
    return raw.split(/\s+/).map((triplet) => {
      const [lon, lat, alt] = triplet.split(",").map(Number);
      return [lat, lon, alt || 0];
    });
  });
}

export async function extractSegmentsFromFile(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith(".kml")) {
    const text = await file.text();
    return extractSegmentsFromKmlText(text);
  }

  if (name.endsWith(".kmz")) {
    const zip = await JSZip.loadAsync(file);
    const kmlEntry = Object.values(zip.files).find((f) =>
      f.name.toLowerCase().endsWith(".kml"),
    );
    if (!kmlEntry) {
      throw new Error("No KML found inside this KMZ");
    }
    const text = await kmlEntry.async("text");
    return extractSegmentsFromKmlText(text);
  }

  throw new Error("Input must be a .kml or .kmz file");
}
