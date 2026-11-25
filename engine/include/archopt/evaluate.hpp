// Layout evaluation: hard-constraint checks, soft scores and the weighted cost function.
//
//   Cost = w1*overlap + w2*boundary + w3*badAdjacency + w4*excessCorridor + w5*poorCirculation
//        + w6*unusedArea + wHard*hardConstraintShortfall
#pragma once
#include <string>
#include <vector>

#include "graph.hpp"
#include "types.hpp"

namespace archopt {

struct PathInfo {
    std::string room;
    bool reachable = false;
    double distance = 0;
    std::vector<std::string> route;  // room names, starting with "ENTRANCE"
    std::vector<Point> polyline;
};
struct NodeInfo { std::string name; double cx, cy; bool transit; };
struct EdgeInfo { std::string a, b; double weight; Point door; };

struct CirculationReport {
    Point entrance;
    std::vector<NodeInfo> nodes;
    std::vector<EdgeInfo> edges;
    std::vector<PathInfo> paths;                      // entrance -> every room (Dijkstra)
    std::vector<std::string> disconnected;            // rooms unreachable from the entrance
    std::vector<std::pair<std::string, int>> bottlenecks;  // (room, number of rooms routed through it)
    std::vector<std::string> matrixNames;
    std::vector<std::vector<double>> matrix;          // room-to-room walking distance via A* (INF = unreachable)
    double avgDistance = 0, maxDistance = 0;
    int components = 0;
    bool fullyConnected = false;
};

bool isCirculationType(const std::string& type);
bool isTransitType(const std::string& type);

// Evaluate a placement. `detailed` additionally produces the human-readable check list.
Layout evaluate(const Problem& p, const std::vector<Room>& rooms, bool detailed = false);

CirculationReport analyzeCirculation(const Problem& p, const std::vector<Room>& rooms);

// Quick feasibility pre-check on the requirements alone. Returns reasons (empty = no obvious impossibility).
std::vector<std::string> precheck(const Problem& p);

}  // namespace archopt
