// Weighted circulation graph, Dijkstra, A* and connectivity analysis.
#pragma once
#include <limits>
#include <string>
#include <vector>

#include "types.hpp"

namespace archopt {

constexpr double INF = std::numeric_limits<double>::infinity();

struct Edge {
    int to;
    double w;
    Point door;
};

// Nodes 0..n-1 are rooms, node n is the virtual ENTRANCE node.
struct Graph {
    int n = 0;                       // number of rooms
    std::vector<std::vector<Edge>> adj;  // size n+1
    std::vector<Point> pos;          // node positions (room centres / entrance point)
    std::vector<char> transit;       // may a path pass THROUGH this node?
    std::vector<char> active;        // false for free-space cells (excluded from the graph)
    int entranceNode() const { return n; }
};

struct ShortestPaths {
    std::vector<double> dist;
    std::vector<int> prev;
};

// Build the graph from actual layout geometry.
Graph buildGraph(const std::vector<Room>& rooms, const Plot& plot, const Entrance& ent, const Constraints& c);

// Dijkstra from `src`. Paths may only relay through transit nodes (src is always allowed).
ShortestPaths dijkstra(const Graph& g, int src);

// A* between two nodes using the Euclidean heuristic (admissible because edge weights are
// polyline lengths between node positions). Returns INF when unreachable.
double astar(const Graph& g, int src, int dst, std::vector<int>* path = nullptr);

std::vector<int> reconstructPath(const ShortestPaths& sp, int dst);

// Rooms (indices) that cannot be reached from the entrance under the transit rule.
std::vector<int> unreachableRooms(const Graph& g, const ShortestPaths& fromEntrance);

// Pure undirected connectivity (ignores the transit rule): number of components among active nodes.
int connectedComponents(const Graph& g);

}  // namespace archopt
