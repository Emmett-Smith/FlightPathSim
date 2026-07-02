import math
import zipfile
import tempfile
import os
from lxml import etree


# =========================
# KMZ / KML LOADER
# =========================
def extract_kml_from_kmz(path):
    if path.endswith(".kml"):
        return path

    if not path.endswith(".kmz"):
        raise ValueError("Input must be .kml or .kmz")

    tmp_dir = tempfile.mkdtemp()

    with zipfile.ZipFile(path, "r") as z:
        z.extractall(tmp_dir)

    for root, _, files in os.walk(tmp_dir):
        for f in files:
            if f.endswith(".kml"):
                return os.path.join(root, f)

    raise ValueError("No KML found inside KMZ")


# =========================
# GEOMETRY
# =========================
def bearing(lat1, lon1, lat2, lon2):
    lat1 = math.radians(lat1)
    lat2 = math.radians(lat2)
    dlon = math.radians(lon2 - lon1)

    y = math.sin(dlon) * math.cos(lat2)
    x = (math.cos(lat1) * math.sin(lat2) -
         math.sin(lat1) * math.cos(lat2) * math.cos(dlon))

    brng = math.degrees(math.atan2(y, x))
    return (brng + 360) % 360


def distance(lat1, lon1, lat2, lon2):
    R = 6371000  # meters

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = (math.sin(dphi/2)**2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2)

    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# =========================
# EXTRACT LINESTRING
# =========================

def extract_all_linestring_coords(kml_file):
    tree = etree.parse(kml_file)
    ns = {"kml": "http://www.opengis.net/kml/2.2"}

    line_strings = tree.xpath("//kml:LineString/kml:coordinates", namespaces=ns)

    if not line_strings:
        raise ValueError("No LineStrings found")

    segments = []

    for ls in line_strings:
        raw = ls.text.strip()

        segment = []

        for line in raw.split():
            lon, lat, *alt = line.split(",")

            segment.append((
                float(lat),
                float(lon),
                float(alt[0]) if alt else 0.0
            ))

        segments.append(segment)

    return segments



# =========================
# DENSIFY PATH (KEY UPGRADE)
# =========================
def interpolate(p1, p2, step_m=5.0):
    lat1, lon1, alt1 = p1
    lat2, lon2, alt2 = p2

    d = distance(lat1, lon1, lat2, lon2)
    steps = max(int(d / step_m), 1)

    result = []

    for i in range(steps):
        t = i / steps
        lat = lat1 + (lat2 - lat1) * t
        lon = lon1 + (lon2 - lon1) * t
        alt = alt1 + (alt2 - alt1) * t
        result.append((lat, lon, alt))

    return result


def densify_path(points, step_m=5.0):
    dense = []
    for i in range(len(points) - 1):
        dense.extend(interpolate(points[i], points[i + 1], step_m))
    dense.append(points[-1])
    return dense


def total_path_length(segments):
    total = 0.0
    for seg in segments:
        for i in range(len(seg) - 1):
            lat1, lon1, _ = seg[i]
            lat2, lon2, _ = seg[i + 1]
            total += distance(lat1, lon1, lat2, lon2)
    return total


# Google Earth Pro chokes on tours with too many gx:FlyTo waypoints (huge
# file size, multi-hour playback). Scale the interpolation step to the
# total flight path length so any input caps out around this many points.
MAX_TOTAL_POINTS = 5000
MIN_STEP_M = 5.0


def choose_step_m(segments):
    length = total_path_length(segments)
    return max(MIN_STEP_M, length / MAX_TOTAL_POINTS)


# =========================
# SMOOTH HEADING (KEY UPGRADE)
# =========================
def compute_headings(points):
    headings = []

    for i in range(len(points) - 1):
        lat1, lon1, _ = points[i]
        lat2, lon2, _ = points[i + 1]
        headings.append(bearing(lat1, lon1, lat2, lon2))

    headings.append(headings[-1])
    return headings


def smooth(values, alpha=0.25):
    # Headings wrap at 360 degrees, so a plain lerp swings the long way
    # around through 180 whenever a turn crosses due north (e.g. 359 -> 1).
    # Blend across the shorter arc instead.
    out = [values[0]]
    for i in range(1, len(values)):
        prev = out[i - 1]
        diff = ((values[i] - prev + 540) % 360) - 180
        out.append((prev + alpha * diff) % 360)
    return out


# =========================
# BUILD GX TOUR
# =========================
def build_tour(points, headings, output_file):
    gx = "http://www.google.com/kml/ext/2.2"

    kml = etree.Element("kml", nsmap={"gx": gx})
    doc = etree.SubElement(kml, "Document")

    tour = etree.SubElement(doc, "{%s}Tour" % gx)
    name = etree.SubElement(tour, "name")
    name.text = "Drone Flythrough V2"

    playlist = etree.SubElement(tour, "{%s}Playlist" % gx)

    tilt = 85
    range_ = 18

    # gx:FlyTo defaults to flyToMode "bounce", which decelerates to a stop
    # and re-accelerates at every single waypoint. With thousands of
    # closely-spaced waypoints that reads as robotic/jumpy motion instead
    # of a continuous glide, so force "smooth" and speed the base pace up.
    base_duration = 0.12
    speed_multiplier = 1.75
    duration = base_duration / speed_multiplier

    for i in range(len(points)):
        lat, lon, alt = points[i]
        heading = headings[i]

        flyto = etree.SubElement(playlist, "{%s}FlyTo" % gx)

        etree.SubElement(flyto, "{%s}duration" % gx).text = str(duration)
        etree.SubElement(flyto, "{%s}flyToMode" % gx).text = "smooth"

        lookat = etree.SubElement(flyto, "LookAt")

        etree.SubElement(lookat, "longitude").text = str(lon)
        etree.SubElement(lookat, "latitude").text = str(lat)
        etree.SubElement(lookat, "altitude").text = str(alt)

        etree.SubElement(lookat, "heading").text = str(heading)
        etree.SubElement(lookat, "tilt").text = str(tilt)
        etree.SubElement(lookat, "range").text = str(range_)
        etree.SubElement(lookat, "altitudeMode").text = "absolute"

    etree.ElementTree(kml).write(
        output_file,
        pretty_print=True,
        xml_declaration=True,
        encoding="UTF-8"
    )


# =========================
# MAIN
# =========================
if __name__ == "__main__":
    input_file = "input.kmz"
    output_file = "drone_tour1.kml"

    kml_path = extract_kml_from_kmz(input_file)
    

    segments = extract_all_linestring_coords(kml_path)

    step_m = choose_step_m(segments)
    print(f"Using step size: {step_m:.1f} m")

    dense_points = []
    dense_headings = []

    for seg in segments:

        if len(seg) < 2:
            continue

        d = densify_path(seg, step_m=step_m)

        h = compute_headings(d)
        h = smooth(h, alpha=0.25)

        dense_points.extend(d)
        dense_headings.extend(h)


    build_tour(dense_points, dense_headings, output_file)

    print("Generated:", output_file)
    print("Open in Google Earth Pro and press Play Tour.")