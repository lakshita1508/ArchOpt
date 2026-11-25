#include "archopt/io.hpp"

#include <algorithm>
#include <stdexcept>

namespace archopt {

RelType relTypeFromString(const std::string& s) {
    if (s == "must_adjacent") return RelType::MustAdjacent;
    if (s == "prefer_adjacent") return RelType::PreferAdjacent;
    if (s == "prefer_nearby") return RelType::PreferNearby;
    if (s == "must_separate") return RelType::MustSeparate;
    if (s == "no_preference" || s.empty()) return RelType::NoPreference;
    throw std::runtime_error("Unknown relationship type: " + s);
}

std::string relTypeToString(RelType t) {
    switch (t) {
        case RelType::MustAdjacent: return "must_adjacent";
        case RelType::PreferAdjacent: return "prefer_adjacent";
        case RelType::PreferNearby: return "prefer_nearby";
        case RelType::MustSeparate: return "must_separate";
        default: return "no_preference";
    }
}

static double numOr(const Json& j, const std::string& k, double d) { return j.has(k) && j[k].isNumber() ? j[k].num() : d; }

Problem problemFromJson(const Json& j) {
    Problem p;
    if (!j.has("plot")) throw std::runtime_error("Missing 'plot'");
    p.plot.width = j["plot"]["width"].num();
    p.plot.height = j["plot"]["height"].num();
    if (p.plot.width <= 0 || p.plot.height <= 0) throw std::runtime_error("Plot width and height must be positive");

    const Json& e = j["entrance"];
    std::string side = e["side"].str("south");
    p.entrance.side = side == "north" ? Side::North : side == "east" ? Side::East : side == "west" ? Side::West : Side::South;
    p.entrance.offset = std::min(1.0, std::max(0.0, numOr(e, "offset", 0.5)));

    if (!j["rooms"].isArray() || j["rooms"].items().empty()) throw std::runtime_error("At least one room is required");
    for (const Json& rj : j["rooms"].items()) {
        Room r;
        r.name = rj["name"].str();
        if (r.name.empty()) throw std::runtime_error("Every room needs a name");
        r.type = rj["type"].str("Custom Room");
        r.requiredArea = numOr(rj, "requiredArea", 0);
        r.minWidth = numOr(rj, "minWidth", 0);
        r.minHeight = numOr(rj, "minHeight", 0);
        r.prefWidth = numOr(rj, "prefWidth", 0);
        r.prefHeight = numOr(rj, "prefHeight", 0);
        r.priority = static_cast<int>(numOr(rj, "priority", 1));
        r.transit = rj.has("transit") ? rj["transit"].boolean() : isTransitType(r.type);
        if (r.requiredArea <= 0) throw std::runtime_error("Room '" + r.name + "' needs a positive requiredArea");
        for (const Room& o : p.rooms) if (o.name == r.name) throw std::runtime_error("Duplicate room name: " + r.name);
        p.rooms.push_back(r);
    }
    for (const Json& rl : j["relationships"].items()) {
        Relationship r;
        r.a = rl["a"].str();
        r.b = rl["b"].str();
        r.type = relTypeFromString(rl["type"].str("no_preference"));
        r.weight = numOr(rl, "weight", 1.0);
        p.relationships.push_back(r);
    }
    const Json& c = j["constraints"];
    Constraints& k = p.constraints;
    k.minCorridorWidth = numOr(c, "minCorridorWidth", k.minCorridorWidth);
    k.doorWidth = numOr(c, "doorWidth", k.doorWidth);
    k.areaTolerance = numOr(c, "areaTolerance", k.areaTolerance);
    k.maxAspect = numOr(c, "maxAspect", k.maxAspect);
    k.maxCorridorAspect = numOr(c, "maxCorridorAspect", k.maxCorridorAspect);
    k.nearDistance = numOr(c, "nearDistance", k.nearDistance);
    k.separateDistance = numOr(c, "separateDistance", k.separateDistance);
    k.maxExpansion = numOr(c, "maxExpansion", k.maxExpansion);
    k.openSpaceRatio = numOr(c, "openSpaceRatio", k.openSpaceRatio);
    k.snap = numOr(c, "snap", k.snap);
    k.requireConnectivity = c.has("requireConnectivity") ? c["requireConnectivity"].boolean(true) : true;

    const Json& w = j["options"]["weights"];
    Weights& W = p.weights;
    W.overlap = numOr(w, "overlap", W.overlap);
    W.boundary = numOr(w, "boundary", W.boundary);
    W.adjacency = numOr(w, "adjacency", W.adjacency);
    W.corridor = numOr(w, "corridor", W.corridor);
    W.circulation = numOr(w, "circulation", W.circulation);
    W.unused = numOr(w, "unused", W.unused);
    p.priority = j["options"]["priority"].str("balanced");
    p.prepare();
    return p;
}

Options optionsFromJson(const Json& j) {
    Options o;
    const Json& x = j["options"];
    std::string a = x["algorithm"].str("simulated_annealing");
    if (a != "simulated_annealing" && a != "genetic" && a != "constraint_based") throw std::runtime_error("Unknown algorithm: " + a);
    o.algorithm = a;
    o.candidates = std::max(1, std::min(20, static_cast<int>(numOr(x, "candidates", 4))));
    o.maxIterations = std::max(1, static_cast<int>(numOr(x, "maxIterations", 6000)));
    o.seed = static_cast<uint64_t>(numOr(x, "seed", 42));
    o.threads = static_cast<int>(numOr(x, "threads", 0));
    o.population = static_cast<int>(numOr(x, "population", 48));
    return o;
}

std::vector<Room> placementFromJson(const Json& arr, const Problem& p) {
    std::vector<Room> rooms;
    for (const Json& rj : arr.items()) {
        Room r;
        r.name = rj["name"].str();
        r.type = rj["type"].str("Custom Room");
        r.isFree = rj["isFree"].boolean(false);
        r.r = {rj["x"].num(), rj["y"].num(), rj["width"].num(), rj["height"].num()};
        // take requirements from the project definition when the room is known
        bool found = false;
        for (const Room& pr : p.rooms)
            if (pr.name == r.name) {
                r.requiredArea = pr.requiredArea; r.minWidth = pr.minWidth; r.minHeight = pr.minHeight;
                r.prefWidth = pr.prefWidth; r.prefHeight = pr.prefHeight; r.priority = pr.priority;
                r.transit = pr.transit; r.type = pr.type;
                found = true;
                break;
            }
        if (!found && !r.isFree) r.transit = isTransitType(r.type);
        rooms.push_back(r);
    }
    return rooms;
}

static Json rectJson(const Room& r) {
    Json o = Json::object();
    o.set("name", r.name);
    o.set("type", r.type);
    o.set("x", r.r.x);
    o.set("y", r.r.y);
    o.set("width", r.r.w);
    o.set("height", r.r.h);
    o.set("area", r.r.area());
    o.set("requiredArea", r.requiredArea);
    o.set("isFree", r.isFree);
    o.set("transit", r.transit);
    return o;
}

Json circulationToJson(const CirculationReport& c) {
    Json o = Json::object();
    Json ent = Json::object();
    ent.set("x", c.entrance.x);
    ent.set("y", c.entrance.y);
    o.set("entrance", ent);
    Json nodes = Json::array();
    for (auto& n : c.nodes) {
        Json x = Json::object();
        x.set("name", n.name); x.set("cx", n.cx); x.set("cy", n.cy); x.set("transit", n.transit);
        nodes.push(x);
    }
    o.set("nodes", nodes);
    Json edges = Json::array();
    for (auto& e : c.edges) {
        Json x = Json::object();
        x.set("a", e.a); x.set("b", e.b); x.set("weight", e.weight); x.set("doorX", e.door.x); x.set("doorY", e.door.y);
        edges.push(x);
    }
    o.set("edges", edges);
    Json paths = Json::array();
    for (auto& p : c.paths) {
        Json x = Json::object();
        x.set("room", p.room);
        x.set("reachable", p.reachable);
        x.set("distance", p.distance);
        Json route = Json::array();
        for (auto& s : p.route) route.push(s);
        x.set("route", route);
        Json poly = Json::array();
        for (auto& pt : p.polyline) { Json q = Json::array(); q.push(pt.x); q.push(pt.y); poly.push(q); }
        x.set("polyline", poly);
        paths.push(x);
    }
    o.set("paths", paths);
    Json dis = Json::array();
    for (auto& s : c.disconnected) dis.push(s);
    o.set("disconnected", dis);
    Json bn = Json::array();
    for (auto& b : c.bottlenecks) { Json x = Json::object(); x.set("room", b.first); x.set("load", b.second); bn.push(x); }
    o.set("bottlenecks", bn);
    Json names = Json::array();
    for (auto& s : c.matrixNames) names.push(s);
    o.set("matrixNames", names);
    Json mat = Json::array();
    for (auto& row : c.matrix) {
        Json r = Json::array();
        for (double d : row) r.push(d == INF ? Json() : Json(d));
        mat.push(r);
    }
    o.set("distanceMatrix", mat);
    o.set("avgDistance", c.avgDistance);
    o.set("maxDistance", c.maxDistance);
    o.set("components", c.components);
    o.set("fullyConnected", c.fullyConnected);
    return o;
}

Json layoutToJson(const Layout& L, const Problem& p, bool withCirculation) {
    Json o = Json::object();
    Json rooms = Json::array();
    for (auto& r : L.rooms) rooms.push(rectJson(r));
    o.set("rooms", rooms);
    const Metrics& m = L.metrics;
    Json mj = Json::object();
    mj.set("totalCost", m.totalCost);
    Json cost = Json::object();
    cost.set("overlap", m.costOverlap); cost.set("boundary", m.costBoundary); cost.set("adjacency", m.costAdjacency);
    cost.set("corridor", m.costCorridor); cost.set("circulation", m.costCirculation); cost.set("unused", m.costUnused); cost.set("hardConstraints", m.costHard);
    mj.set("costBreakdown", cost);
    mj.set("plotArea", m.plotArea); mj.set("usableArea", m.usableArea); mj.set("circulationArea", m.circulationArea); mj.set("unusedArea", m.unusedArea);
    mj.set("areaEfficiency", m.areaEfficiency); mj.set("adjacencySatisfaction", m.adjacencySatisfaction);
    mj.set("circulationScore", m.circulationScore); mj.set("accessibilityScore", m.accessibilityScore);
    mj.set("avgWalk", m.avgWalk); mj.set("maxWalk", m.maxWalk);
    mj.set("violations", m.violations); mj.set("feasible", m.feasible);
    o.set("metrics", mj);
    Json checks = Json::array();
    for (auto& c : L.checks) {
        Json x = Json::object();
        x.set("id", c.id); x.set("category", c.category); x.set("status", c.status); x.set("room", c.room); x.set("message", c.message);
        checks.push(x);
    }
    o.set("validation", checks);
    Json dis = Json::array();
    for (auto& s : L.disconnected) dis.push(s);
    o.set("disconnected", dis);
    if (withCirculation) o.set("circulation", circulationToJson(analyzeCirculation(p, L.rooms)));
    return o;
}

Json resultToJson(const OptimizationResult& r, const Problem& pIn) {
    Problem p = withFreeSpace(pIn);
    Json o = Json::object();
    o.set("status", r.status);
    o.set("algorithm", r.algorithm);
    o.set("seed", static_cast<double>(r.seed));
    o.set("threadsUsed", r.threadsUsed);
    o.set("candidatesEvaluated", static_cast<double>(r.evaluated));
    o.set("feasibleFound", static_cast<double>(r.feasibleFound));
    o.set("executionMs", r.executionMs);
    o.set("bestCost", r.bestCost);
    Json lays = Json::array();
    int id = 1;
    for (auto& L : r.layouts) {
        Json lj = layoutToJson(L, p, true);
        lj.set("id", "L" + std::to_string(id++));
        lays.push(lj);
    }
    o.set("layouts", lays);
    Json reasons = Json::array();
    for (auto& s : r.reasons) reasons.push(s);
    o.set("reasons", reasons);
    if (r.hasBestInfeasible) o.set("bestInfeasible", layoutToJson(r.bestInfeasible, p, false));
    return o;
}

}  // namespace archopt
