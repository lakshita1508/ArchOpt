#include "archopt/evaluate.hpp"

#include <algorithm>
#include <cmath>
#include <set>

#include "archopt/geometry.hpp"

namespace archopt {

bool isCirculationType(const std::string& t) { return t == "Corridor" || t == "Staircase"; }
bool isTransitType(const std::string& t) {
    static const std::set<std::string> s = {"Reception", "Living Room", "Dining Area", "Corridor", "Staircase", "Open Area"};
    return s.count(t) > 0;
}

namespace {

struct RelScore {
    double score = 1;     // 0..1
    bool hardFail = false;
    std::string text;
};

RelScore scoreRelationship(const Problem& p, const std::vector<Room>& rooms, size_t k) {
    const Relationship& rel = p.relationships[k];
    auto [ia, ib] = p.relIdx[k];
    RelScore rs;
    if (ia == -2 || ib == -2 || rel.type == RelType::NoPreference) return rs;
    const Constraints& c = p.constraints;
    double dist, wall = 0;
    if (ib == -1 || ia == -1) {  // relationship with the entrance
        int ri = ib == -1 ? ia : ib;
        Point ep = p.entrance.point(p.plot);
        dist = geom::pointToRectDistance(ep, rooms[ri].r);
        wall = dist < geom::EPS ? c.doorWidth : 0;
    } else {
        dist = geom::rectDistance(rooms[ia].r, rooms[ib].r);
        wall = geom::sharedWall(rooms[ia].r, rooms[ib].r);
    }
    switch (rel.type) {
        case RelType::MustAdjacent:
        case RelType::PreferAdjacent: {
            bool ok = wall + geom::EPS >= c.doorWidth;
            rs.score = ok ? 1.0 : (wall > geom::EPS ? 0.5 : 0.4 * std::max(0.0, 1.0 - dist / c.nearDistance));
            rs.hardFail = (rel.type == RelType::MustAdjacent) && !ok;
            break;
        }
        case RelType::PreferNearby:
            rs.score = std::max(0.0, 1.0 - dist / c.nearDistance);
            break;
        case RelType::MustSeparate: {
            bool ok = dist + geom::EPS >= c.separateDistance;
            rs.score = ok ? 1.0 : std::max(0.0, dist / c.separateDistance) * 0.8;
            rs.hardFail = !ok;
            break;
        }
        default: break;
    }
    return rs;
}

double priorityMul(const std::string& pr, const char* term) {
    std::string t = term;
    if (pr == "max_area_efficiency" && t == "unused") return 4;
    if (pr == "better_adjacency" && t == "adjacency") return 3;
    if (pr == "shorter_circulation" && (t == "circulation" || t == "corridor")) return 3;
    if (pr == "better_accessibility" && t == "circulation") return 1.5;
    return 1;
}

}  // namespace

Layout evaluate(const Problem& p, const std::vector<Room>& rooms, bool detailed) {
    Layout L;
    L.rooms = rooms;
    Metrics& m = L.metrics;
    const Constraints& c = p.constraints;
    const Weights& w = p.weights;
    const Rect plotR = p.plot.rect();
    const size_t n = rooms.size();
// Messages are only built when a detailed report is requested (keeps the search loop fast).
#define ADD(...) do { if (detailed) L.checks.push_back(CheckItem{__VA_ARGS__}); } while (0)
    auto f1 = [](double v) { char b[32]; std::snprintf(b, sizeof b, "%.2f", v); return std::string(b); };

    double hard = 0;
    int violations = 0;

    // ---- overlap & boundary --------------------------------------------------------------
    double overlap = 0, outside = 0;
    for (size_t i = 0; i < n; ++i) {
        double o = geom::outsideArea(rooms[i].r, plotR);
        outside += o;
        if (o > geom::EPS) { ++violations; ADD("boundary", "hard", "failed", rooms[i].name, "Room extends outside the plot boundary by " + f1(o) + " m2."); }
        else ADD("boundary", "hard", "passed", rooms[i].name, "Inside the plot boundary.");
        for (size_t j = i + 1; j < n; ++j) {
            double a = geom::intersectionArea(rooms[i].r, rooms[j].r);
            if (a > geom::EPS) {
                overlap += a;
                ++violations;
                ADD("overlap", "hard", "failed", rooms[i].name, "Overlaps " + rooms[j].name + " by " + f1(a) + " m2.");
            }
        }
    }
    if (overlap <= geom::EPS) ADD("overlap", "hard", "passed", "", "No two rooms overlap.");

    // ---- per-room dimension / area / aspect ---------------------------------------------
    double realArea = 0, freeArea = 0, usable = 0, circArea = 0;
    int realRooms = 0;
    for (size_t i = 0; i < n; ++i) {
        const Room& r = rooms[i];
        double clipped = geom::intersectionArea(r.r, plotR);
        if (r.isFree) { freeArea += clipped; continue; }
        ++realRooms;
        realArea += clipped;
        (isCirculationType(r.type) ? circArea : usable) += clipped;

        double ds = geom::dimensionShortfall(r.r, r.minWidth, r.minHeight);
        if (ds > geom::EPS) { hard += ds; ++violations; ADD("min_dimensions", "hard", "failed", r.name, "Dimensions " + f1(r.r.w) + " x " + f1(r.r.h) + " m are below the minimum " + f1(r.minWidth) + " x " + f1(r.minHeight) + " m."); }
        else ADD("min_dimensions", "hard", "passed", r.name, "Minimum dimensions satisfied (" + f1(r.r.w) + " x " + f1(r.r.h) + " m).");

        double need = r.requiredArea * (1.0 - c.areaTolerance);
        double as = std::max(0.0, need - r.r.area());
        if (as > geom::EPS) { hard += as * 0.3; ++violations; ADD("required_area", "hard", "failed", r.name, "Area " + f1(r.r.area()) + " m2 is below the required " + f1(r.requiredArea) + " m2."); }
        else ADD("required_area", "hard", "passed", r.name, "Area " + f1(r.r.area()) + " m2 meets the required " + f1(r.requiredArea) + " m2.");

        if (r.type == "Corridor") {
            double cw = std::min(r.r.w, r.r.h);
            double cs = std::max(0.0, c.minCorridorWidth - cw);
            double asp = geom::aspect(r.r);
            if (cs > geom::EPS) { hard += cs * 3; ++violations; ADD("corridor_width", "hard", "failed", r.name, "Corridor width " + f1(cw) + " m is below the minimum " + f1(c.minCorridorWidth) + " m."); }
            else ADD("corridor_width", "hard", "passed", r.name, "Corridor width " + f1(cw) + " m is sufficient.");
            if (asp > c.maxCorridorAspect) { hard += asp - c.maxCorridorAspect; ++violations; ADD("aspect_ratio", "hard", "failed", r.name, "Corridor is too elongated (" + f1(asp) + ":1)."); }
        } else {
            double asp = geom::aspect(r.r);
            if (asp > c.maxAspect + geom::EPS) { hard += asp - c.maxAspect; ++violations; ADD("aspect_ratio", "hard", "failed", r.name, "Aspect ratio " + f1(asp) + ":1 exceeds " + f1(c.maxAspect) + ":1."); }
            else if (asp > c.maxAspect * 0.8) ADD("aspect_ratio", "soft", "warning", r.name, "Aspect ratio " + f1(asp) + ":1 is close to the limit.");
        }
    }

    // ---- circulation graph ---------------------------------------------------------------
    Graph g = buildGraph(rooms, p.plot, p.entrance, c);
    ShortestPaths sp = dijkstra(g, g.entranceNode());
    auto unreach = unreachableRooms(g, sp);
    double sumD = 0, maxD = 0;
    int reached = 0;
    const double penaltyDist = p.plot.width + p.plot.height;
    for (size_t i = 0; i < n; ++i) {
        if (rooms[i].isFree) continue;
        double d = sp.dist[i];
        if (d == INF) { sumD += penaltyDist; maxD = std::max(maxD, penaltyDist); }
        else { sumD += d; maxD = std::max(maxD, d); ++reached; }
    }
    m.avgWalk = realRooms ? sumD / realRooms : 0;
    m.maxWalk = maxD;
    for (int i : unreach) L.disconnected.push_back(rooms[i].name);
    if (c.requireConnectivity) {
        for (int i : unreach) {
            hard += 3;
            ++violations;
            ADD("connectivity", "hard", "failed", rooms[i].name, "Room cannot be reached from the entrance through circulation spaces.");
        }
        if (unreach.empty()) ADD("connectivity", "hard", "passed", "", "All rooms are reachable from the entrance.");
    }

    // ---- relationships -------------------------------------------------------------------
    double wSum = 0, wScore = 0, badAdj = 0;
    for (size_t k = 0; k < p.relationships.size(); ++k) {
        const Relationship& rel = p.relationships[k];
        if (rel.type == RelType::NoPreference || p.relIdx[k].first == -2 || p.relIdx[k].second == -2) continue;
        RelScore rs = scoreRelationship(p, rooms, k);
        wSum += rel.weight;
        wScore += rel.weight * rs.score;
        badAdj += rel.weight * (1.0 - rs.score);
        if (rs.hardFail) { hard += 2; ++violations; }
        std::string label = rel.a + " / " + rel.b;
        static const char* names[] = {"must be adjacent", "prefers adjacency", "prefers to be nearby", "no preference", "must be separated"};
        std::string rt = names[static_cast<int>(rel.type)];
        bool hardRel = rel.type == RelType::MustAdjacent || rel.type == RelType::MustSeparate;
        if (rs.score >= 0.999) ADD("relationship", hardRel ? "hard" : "soft", "passed", rel.a, label + " (" + rt + ") satisfied.");
        else ADD("relationship", hardRel ? "hard" : "soft", hardRel ? "failed" : "warning", rel.a, label + " (" + rt + ") not fully satisfied (score " + f1(rs.score) + ").");
    }
    m.adjacencySatisfaction = wSum > 0 ? 100.0 * wScore / wSum : 100.0;

    // ---- open space requirement ----------------------------------------------------------
    double plotArea = p.plot.totalArea();
    double unusedTotal = std::max(0.0, plotArea - realArea);
    if (c.openSpaceRatio > 0) {
        double have = unusedTotal / plotArea;
        if (have + 1e-9 < c.openSpaceRatio) {
            hard += (c.openSpaceRatio - have) * plotArea * 0.1;
            ++violations;
            ADD("open_space", "hard", "failed", "", "Open space " + f1(have * 100) + "% is below the required " + f1(c.openSpaceRatio * 100) + "%.");
        } else ADD("open_space", "hard", "passed", "", "Open-space requirement satisfied.");
    }

    // ---- cost terms ----------------------------------------------------------------------
    double excessCorr = 0;
    for (const Room& r : rooms)
        if (!r.isFree && r.type == "Corridor") {
            excessCorr += std::max(0.0, r.r.area() - 1.3 * r.requiredArea) + r.requiredArea * 0.5 * std::max(0.0, 2.0 - geom::aspect(r.r));
        }
    double poorCirc = m.avgWalk + 0.5 * m.maxWalk;
    double unusedPenalty = std::max(0.0, unusedTotal - c.openSpaceRatio * plotArea);

    m.costOverlap = w.overlap * overlap;
    m.costBoundary = w.boundary * outside;
    m.costAdjacency = w.adjacency * priorityMul(p.priority, "adjacency") * badAdj;
    m.costCorridor = w.corridor * priorityMul(p.priority, "corridor") * excessCorr;
    m.costCirculation = w.circulation * priorityMul(p.priority, "circulation") * poorCirc;
    m.costUnused = w.unused * priorityMul(p.priority, "unused") * unusedPenalty;
    m.costHard = w.hard * hard;
    m.totalCost = m.costOverlap + m.costBoundary + m.costAdjacency + m.costCorridor + m.costCirculation + m.costUnused + m.costHard;

    m.plotArea = plotArea;
    m.usableArea = usable;
    m.circulationArea = circArea;
    m.unusedArea = unusedTotal;
    m.areaEfficiency = plotArea > 0 ? 100.0 * realArea / plotArea : 0;
    m.circulationScore = 100.0 * std::max(0.0, 1.0 - m.avgWalk / penaltyDist);
    m.accessibilityScore = realRooms ? 100.0 * reached / realRooms : 0;
    m.violations = violations;
    m.feasible = overlap <= geom::EPS && outside <= geom::EPS && hard <= 1e-9;
    (void)freeArea;
    return L;
}

CirculationReport analyzeCirculation(const Problem& p, const std::vector<Room>& rooms) {
    CirculationReport R;
    Graph g = buildGraph(rooms, p.plot, p.entrance, p.constraints);
    const int n = g.n;
    R.entrance = g.pos[n];
    for (int i = 0; i < n; ++i)
        if (g.active[i]) R.nodes.push_back({rooms[i].name, g.pos[i].x, g.pos[i].y, rooms[i].transit});
    auto nameOf = [&](int i) { return i == n ? std::string("ENTRANCE") : rooms[i].name; };
    for (int u = 0; u <= n; ++u)
        for (const Edge& e : g.adj[u])
            if (u < e.to) R.edges.push_back({nameOf(u), nameOf(e.to), e.w, e.door});
    R.components = connectedComponents(g);

    ShortestPaths sp = dijkstra(g, n);
    std::vector<int> load(n + 1, 0);
    double sum = 0;
    int cnt = 0;
    int real = 0;
    for (int i = 0; i < n; ++i) {
        if (!g.active[i]) continue;
        ++real;
        PathInfo pi;
        pi.room = rooms[i].name;
        auto path = reconstructPath(sp, i);
        if (path.empty()) {
            R.disconnected.push_back(pi.room);
        } else {
            pi.reachable = true;
            pi.distance = sp.dist[i];
            sum += pi.distance;
            R.maxDistance = std::max(R.maxDistance, pi.distance);
            ++cnt;
            for (size_t k = 0; k < path.size(); ++k) {
                pi.route.push_back(nameOf(path[k]));
                if (k == 0) { pi.polyline.push_back(g.pos[n]); continue; }
                int u = path[k - 1], v = path[k];
                if (u != n) {
                    for (const Edge& e : g.adj[u]) if (e.to == v) { pi.polyline.push_back(e.door); break; }
                }
                pi.polyline.push_back(g.pos[v]);
                if (k + 1 < path.size()) ++load[v];  // v is an intermediate room
            }
        }
        R.paths.push_back(std::move(pi));
    }
    R.avgDistance = cnt ? sum / cnt : 0;
    int thr = std::max(3, static_cast<int>(std::ceil(0.4 * real)));
    for (int i = 0; i < n; ++i)
        if (g.active[i] && load[i] >= thr) R.bottlenecks.emplace_back(rooms[i].name, load[i]);
    std::sort(R.bottlenecks.begin(), R.bottlenecks.end(), [](auto& a, auto& b) { return a.second > b.second; });
    R.fullyConnected = R.disconnected.empty();

    // room-to-room distance matrix via A*
    std::vector<int> idx;
    for (int i = 0; i < n; ++i) if (g.active[i]) idx.push_back(i);
    for (int i : idx) R.matrixNames.push_back(rooms[i].name);
    R.matrix.assign(idx.size(), std::vector<double>(idx.size(), 0));
    for (size_t a = 0; a < idx.size(); ++a)
        for (size_t b = a + 1; b < idx.size(); ++b) {
            double d = astar(g, idx[a], idx[b]);
            R.matrix[a][b] = R.matrix[b][a] = d;
        }
    return R;
}

std::vector<std::string> precheck(const Problem& p) {
    std::vector<std::string> out;
    char b[200];
    double sum = 0;
    for (const Room& r : p.rooms) {
        sum += r.requiredArea;
        if (r.minWidth * r.minHeight > r.requiredArea * (1.0 + 1e-9) + 1e-9) {
            std::snprintf(b, sizeof b, "%s: minimum dimensions (%.1f x %.1f = %.1f m2) exceed its required area (%.1f m2).", r.name.c_str(), r.minWidth, r.minHeight, r.minWidth * r.minHeight, r.requiredArea);
            // not impossible by itself (room can grow) - only warn through the area check below
        }
        bool fits = (r.minWidth <= p.plot.width + 1e-9 && r.minHeight <= p.plot.height + 1e-9) || (r.minHeight <= p.plot.width + 1e-9 && r.minWidth <= p.plot.height + 1e-9);
        if (!fits) {
            std::snprintf(b, sizeof b, "%s: minimum dimensions %.1f x %.1f m do not fit inside the %.1f x %.1f m plot.", r.name.c_str(), r.minWidth, r.minHeight, p.plot.width, p.plot.height);
            out.push_back(b);
        }
    }
    double need = 0;
    for (const Room& r : p.rooms) need += std::max(r.requiredArea * (1 - p.constraints.areaTolerance), r.minWidth * r.minHeight);
    double avail = p.plot.totalArea() * (1.0 - p.constraints.openSpaceRatio);
    if (need > avail + 1e-9) {
        std::snprintf(b, sizeof b, "Total required room area (%.1f m2) exceeds the available plot area (%.1f m2). The requirements are mathematically impossible.", need, avail);
        out.push_back(b);
    }
    (void)sum;
    return out;
}

}  // namespace archopt
