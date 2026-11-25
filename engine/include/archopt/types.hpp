// Core data structures of the ArchOpt optimisation engine.
#pragma once
#include <map>
#include <string>
#include <vector>

namespace archopt {

struct Rect {
    double x = 0, y = 0, w = 0, h = 0;
    double right() const { return x + w; }
    double bottom() const { return y + h; }
    double area() const { return w * h; }
    double cx() const { return x + w / 2; }
    double cy() const { return y + h / 2; }
};

struct Point { double x = 0, y = 0; };

struct Plot {
    double width = 0, height = 0;
    double totalArea() const { return width * height; }
    Rect rect() const { return {0, 0, width, height}; }
};

// Relationship semantics:
//  MustAdjacent / MustSeparate are HARD constraints.
//  PreferAdjacent / PreferNearby are SOFT preferences (cost terms).
enum class RelType { MustAdjacent, PreferAdjacent, PreferNearby, NoPreference, MustSeparate };

struct Relationship {
    std::string a, b;  // b may be the special name "ENTRANCE"
    RelType type = RelType::NoPreference;
    double weight = 1.0;
};

struct Room {
    std::string name;
    std::string type = "Custom Room";
    double requiredArea = 0, minWidth = 0, minHeight = 0, prefWidth = 0, prefHeight = 0;
    int priority = 1;
    bool transit = false;   // may people walk THROUGH this room to reach other rooms?
    bool isFree = false;    // engine-generated "Unallocated" open space (not a programme room)
    Rect r;                 // placement
};

enum class Side { South, North, East, West };

struct Entrance {
    Side side = Side::South;
    double offset = 0.5;  // 0..1 along the chosen side
    Point point(const Plot& p) const {
        switch (side) {
            case Side::South: return {p.width * offset, p.height};
            case Side::North: return {p.width * offset, 0};
            case Side::East: return {p.width, p.height * offset};
            case Side::West: return {0, p.height * offset};
        }
        return {0, 0};
    }
};

struct Constraints {
    double minCorridorWidth = 1.2;
    double doorWidth = 1.0;        // min shared wall length for a door between two rooms
    double areaTolerance = 0.05;   // rooms may be up to 5% below required area
    double maxAspect = 5.0;        // max long/short side for ordinary rooms
    double maxCorridorAspect = 14.0;
    double nearDistance = 6.0;     // "prefer nearby" reaches full score at 0, zero at this distance
    double separateDistance = 4.0; // "must separate": rectangle gap must be >= this
    double maxExpansion = 1.5;     // programme rooms are sized up to ~this x required area; rest = open space
    double openSpaceRatio = 0.0;   // minimum share of plot that must remain unallocated
    double snap = 0.1;             // geometry grid (metres)
    bool requireConnectivity = true;
};

struct Weights {  // w1..w6 of the cost function
    double overlap = 1000, boundary = 1000, adjacency = 40, corridor = 2, circulation = 6, unused = 0.5;
    double hard = 300;  // multiplier for hard-constraint shortfalls (guides search towards feasibility)
};

struct Problem {
    Plot plot;
    Entrance entrance;
    std::vector<Room> rooms;
    std::vector<Relationship> relationships;
    Constraints constraints;
    Weights weights;
    std::string priority = "balanced";
    // Filled by prepare(): relationship endpoints as room indices (-1 = ENTRANCE, -2 = unknown room)
    std::vector<std::pair<int, int>> relIdx;
    void prepare() {
        relIdx.clear();
        auto find = [&](const std::string& n) {
            if (n == "ENTRANCE") return -1;
            for (size_t i = 0; i < rooms.size(); ++i) if (rooms[i].name == n) return static_cast<int>(i);
            return -2;
        };
        for (auto& r : relationships) relIdx.emplace_back(find(r.a), find(r.b));
    }
};

struct CheckItem {
    std::string id;        // e.g. "overlap", "boundary"
    std::string category;  // hard | soft
    std::string status;    // passed | failed | warning
    std::string room;      // empty if global
    std::string message;
};

struct Metrics {
    double totalCost = 0;
    double costOverlap = 0, costBoundary = 0, costAdjacency = 0, costCorridor = 0, costCirculation = 0, costUnused = 0, costHard = 0;
    double plotArea = 0, usableArea = 0, circulationArea = 0, unusedArea = 0;
    double areaEfficiency = 0;        // programme rooms / plot  (%)
    double adjacencySatisfaction = 0; // weighted (%)
    double circulationScore = 0;      // 0..100
    double accessibilityScore = 0;    // 0..100
    double avgWalk = 0, maxWalk = 0;
    int violations = 0;
    bool feasible = false;
};

struct Layout {
    std::vector<Room> rooms;
    Metrics metrics;
    std::vector<CheckItem> checks;
    std::vector<std::string> disconnected;
};

}  // namespace archopt
