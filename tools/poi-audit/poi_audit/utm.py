"""UTM coordinates to WGS84 latitude / longitude, in pure Python (no pyproj, no GDAL).

Spanish public data publish "UTM" coordinates without always saying which datum they use, and the two
that matter differ by about 235 m in Navarra:

* ETRS89 / UTM 30N   (EPSG:25830), the legal system since 2007 and what IDENA (the Navarra map
  infrastructure) uses today. ETRS89 and WGS84 agree to better than a metre, so no shift is applied.
* ED50 / UTM 30N     (EPSG:23030), the old European Datum 1950. A Helmert shift to ETRS89 is needed.
* WGS84 / UTM 30N    (EPSG:32630), for completeness.

The ED50 shift is the 7-parameter Position Vector set EPSG:1588 ("ED50 to ETRS89 (1)", Spain, "1 m
level of accuracy"), without the NTv2 grid (which is not available offline). The accuracy against
reality is therefore the accuracy of that parameter set, about 1 to 3 m, not of this code.

The transverse Mercator inverse is the Krueger series to 4th order (error well under a millimetre
inside a UTM zone). Checked against PROJ (pyproj 3.8.0) on 2,000 random points of Navarra and 7
fixed ones: the largest difference was 0.003 mm for ETRS89, WGS84 and the ED50 pipeline.
"""
from __future__ import annotations

import math

# (semi-major axis in metres, flattening)
INTERNATIONAL_1924 = (6378388.0, 1 / 297.0)
GRS80 = (6378137.0, 1 / 298.257222101)
WGS84 = (6378137.0, 1 / 298.257223563)

# EPSG:1588 ED50 to ETRS89 (1), Position Vector. Rotations are in radians (PROJ lists 4.327, 4.464 and
# -4.444 microradians), the scale is in parts per one (-3.52 ppm).
HELMERT_ED50_TO_ETRS89 = dict(tx=-116.641, ty=-56.931, tz=-110.559, rx=4.327e-6, ry=4.464e-6, rz=-4.444e-6, ds=-3.52e-6)

K0 = 0.9996  # UTM scale factor on the central meridian
FALSE_EASTING = 500000.0
FALSE_NORTHING_SOUTH = 10000000.0


def datum_and_zone(epsg: str | int) -> tuple[str, int, bool]:
    """('ETRS89' | 'ED50' | 'WGS84', zone, northern hemisphere) for a UTM EPSG code, or ValueError.

    25828-25838 ETRS89 / UTM 28N-38N, 23028-23038 ED50 / UTM 28N-38N, 32601-32660 WGS84 / UTM 1N-60N."""
    code = int(str(epsg).upper().replace("EPSG:", ""))
    if 25828 <= code <= 25838:
        return "ETRS89", code - 25800, True
    if 23028 <= code <= 23038:
        return "ED50", code - 23000, True
    if 32601 <= code <= 32660:
        return "WGS84", code - 32600, True
    raise ValueError(f"EPSG:{code} is not a UTM system this module knows (ETRS89, ED50 or WGS84, northern hemisphere)")


def _tm_inverse(easting: float, northing: float, zone: int, ellipsoid: tuple[float, float], north: bool) -> tuple[float, float]:
    """Transverse Mercator on the UTM grid to geodetic latitude, longitude (degrees) on the same ellipsoid."""
    a, f = ellipsoid
    n = f / (2 - f)
    big_a = a / (1 + n) * (1 + n ** 2 / 4 + n ** 4 / 64)
    beta = (n / 2 - 2 * n ** 2 / 3 + 37 * n ** 3 / 96 - n ** 4 / 360,
            n ** 2 / 48 + n ** 3 / 15 - 437 * n ** 4 / 1440,
            17 * n ** 3 / 480 - 37 * n ** 4 / 840,
            4397 * n ** 4 / 161280)
    delta = (2 * n - 2 * n ** 2 / 3 - 2 * n ** 3 + 116 * n ** 4 / 45,
             7 * n ** 2 / 3 - 8 * n ** 3 / 5 - 227 * n ** 4 / 45,
             56 * n ** 3 / 15 - 136 * n ** 4 / 35,
             4279 * n ** 4 / 630)
    xi = (northing - (0.0 if north else FALSE_NORTHING_SOUTH)) / (K0 * big_a)
    eta = (easting - FALSE_EASTING) / (K0 * big_a)
    xi_p, eta_p = xi, eta
    for j, b in enumerate(beta, start=1):
        xi_p -= b * math.sin(2 * j * xi) * math.cosh(2 * j * eta)
        eta_p -= b * math.cos(2 * j * xi) * math.sinh(2 * j * eta)
    chi = math.asin(math.sin(xi_p) / math.cosh(eta_p))
    lat = chi + sum(d * math.sin(2 * j * chi) for j, d in enumerate(delta, start=1))
    lon = math.radians(zone * 6 - 183) + math.atan2(math.sinh(eta_p), math.cos(xi_p))
    return math.degrees(lat), math.degrees(lon)


def _to_cartesian(lat: float, lon: float, ellipsoid: tuple[float, float]) -> tuple[float, float, float]:
    a, f = ellipsoid
    e2 = f * (2 - f)
    p, l = math.radians(lat), math.radians(lon)
    nu = a / math.sqrt(1 - e2 * math.sin(p) ** 2)
    return nu * math.cos(p) * math.cos(l), nu * math.cos(p) * math.sin(l), nu * (1 - e2) * math.sin(p)


def _to_geodetic(x: float, y: float, z: float, ellipsoid: tuple[float, float]) -> tuple[float, float]:
    a, f = ellipsoid
    e2 = f * (2 - f)
    p = math.hypot(x, y)
    lat = math.atan2(z, p * (1 - e2))
    for _ in range(8):  # converges to far below a micrometre in 3 or 4 rounds
        nu = a / math.sqrt(1 - e2 * math.sin(lat) ** 2)
        lat = math.atan2(z + e2 * nu * math.sin(lat), p)
    return math.degrees(lat), math.degrees(math.atan2(y, x))


def _helmert(x: float, y: float, z: float, tx: float, ty: float, tz: float, rx: float, ry: float, rz: float, ds: float):
    """Position Vector convention (EPSG method 9606)."""
    s = 1 + ds
    return (tx + s * (x - rz * y + ry * z),
            ty + s * (rz * x + y - rx * z),
            tz + s * (-ry * x + rx * y + z))


def utm_to_wgs84(easting: float, northing: float, epsg: str | int = "EPSG:25830") -> tuple[float, float]:
    """(latitude, longitude) in degrees, WGS84, for UTM metres in the system `epsg`.

    Pass the datum the data really use: reading ED50 metres as ETRS89 moves every point about 235 m."""
    datum, zone, north = datum_and_zone(epsg)
    if datum == "ETRS89":
        return _tm_inverse(easting, northing, zone, GRS80, north)
    if datum == "WGS84":
        return _tm_inverse(easting, northing, zone, WGS84, north)
    lat, lon = _tm_inverse(easting, northing, zone, INTERNATIONAL_1924, north)
    x, y, z = _helmert(*_to_cartesian(lat, lon, INTERNATIONAL_1924), **HELMERT_ED50_TO_ETRS89)
    return _to_geodetic(x, y, z, WGS84)  # ETRS89 and WGS84 are the same to better than a metre
