// Computational geometry primitives for axis-aligned rectangles.
#pragma once
#include <algorithm>
#include <cmath>

#include "types.hpp"

namespace archopt::geom {

constexpr double EPS = 1e-6;

inline double area(const Rect& r) { return r.w * r.h; }

// Strict interior intersection (touching edges is NOT an overlap).
inline bool intersects(const Rect& a, const Rect& b) {
    return a.x < b.right() - EPS && b.x < a.right() - EPS && a.y < b.bottom() - EPS && b.y < a.bottom() - EPS;
}

inline double intersectionArea(const Rect& a, const Rect& b) {
    double w = std::min(a.right(), b.right()) - std::max(a.x, b.x);
    double h = std::min(a.bottom(), b.bottom()) - std::max(a.y, b.y);
    return (w > 0 && h > 0) ? w * h : 0.0;
}

inline bool insideRect(const Rect& inner, const Rect& outer) {
    return inner.x >= outer.x - EPS && inner.y >= outer.y - EPS && inner.right() <= outer.right() + EPS &&
           inner.bottom() <= outer.bottom() + EPS;
}

inline bool containsPoint(const Rect& r, const Point& p) {
    return p.x >= r.x - EPS && p.x <= r.right() + EPS && p.y >= r.y - EPS && p.y <= r.bottom() + EPS;
}

// Area of `r` that lies outside `plot` (boundary violation magnitude).
inline double outsideArea(const Rect& r, const Rect& plot) { return std::max(0.0, r.area() - intersectionArea(r, plot)); }

// Shortest distance between two rectangles (0 if they touch or overlap).
inline double rectDistance(const Rect& a, const Rect& b) {
    double dx = std::max({0.0, a.x - b.right(), b.x - a.right()});
    double dy = std::max({0.0, a.y - b.bottom(), b.y - a.bottom()});
    return std::hypot(dx, dy);
}

// Length of the wall segment two rectangles share (0 if they only touch at a corner or are apart).
inline double sharedWall(const Rect& a, const Rect& b, Point* mid = nullptr) {
    double len = 0;
    Point m{};
    if (std::fabs(a.right() - b.x) < EPS || std::fabs(b.right() - a.x) < EPS) {  // vertical shared wall
        double lo = std::max(a.y, b.y), hi = std::min(a.bottom(), b.bottom());
        if (hi - lo > EPS) {
            len = hi - lo;
            m = {std::fabs(a.right() - b.x) < EPS ? a.right() : a.x, (lo + hi) / 2};
        }
    }
    if (len <= 0 && (std::fabs(a.bottom() - b.y) < EPS || std::fabs(b.bottom() - a.y) < EPS)) {  // horizontal wall
        double lo = std::max(a.x, b.x), hi = std::min(a.right(), b.right());
        if (hi - lo > EPS) {
            len = hi - lo;
            m = {(lo + hi) / 2, std::fabs(a.bottom() - b.y) < EPS ? a.bottom() : a.y};
        }
    }
    if (mid) *mid = m;
    return len;
}

inline double aspect(const Rect& r) {
    double s = std::min(r.w, r.h), l = std::max(r.w, r.h);
    return s <= EPS ? 1e9 : l / s;
}

// Minimum-dimension shortfall; rooms may be rotated by 90 degrees.
inline double dimensionShortfall(const Rect& r, double minW, double minH) {
    double s1 = std::max(0.0, minW - r.w) + std::max(0.0, minH - r.h);
    double s2 = std::max(0.0, minH - r.w) + std::max(0.0, minW - r.h);
    return std::min(s1, s2);
}

inline double dist(const Point& a, const Point& b) { return std::hypot(a.x - b.x, a.y - b.y); }

inline double pointToRectDistance(const Point& p, const Rect& r) {
    double dx = std::max({0.0, r.x - p.x, p.x - r.right()});
    double dy = std::max({0.0, r.y - p.y, p.y - r.bottom()});
    return std::hypot(dx, dy);
}

}  // namespace archopt::geom
