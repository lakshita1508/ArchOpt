#include "archopt/graph.hpp"

#include <algorithm>
#include <cmath>
#include <functional>
#include <queue>

#include "archopt/geometry.hpp"

namespace archopt {

Graph buildGraph(const std::vector<Room>& rooms, const Plot& plot, const Entrance& ent, const Constraints& c) {
    Graph g;
    g.n = static_cast<int>(rooms.size());
    g.adj.assign(g.n + 1, {});
    g.pos.resize(g.n + 1);
    g.transit.assign(g.n + 1, 0);
    g.active.assign(g.n + 1, 1);
    for (int i = 0; i < g.n; ++i) {
        g.pos[i] = {rooms[i].r.cx(), rooms[i].r.cy()};
        g.transit[i] = rooms[i].transit ? 1 : 0;
        g.active[i] = rooms[i].isFree ? 0 : 1;
    }
    Point ep = ent.point(plot);
    g.pos[g.n] = ep;
    g.transit[g.n] = 1;

    for (int i = 0; i < g.n; ++i) {
        if (!g.active[i]) continue;
        for (int j = i + 1; j < g.n; ++j) {
            if (!g.active[j]) continue;
            Point door;
            double wall = geom::sharedWall(rooms[i].r, rooms[j].r, &door);
            if (wall + geom::EPS >= c.doorWidth) {
                double w = geom::dist(g.pos[i], door) + geom::dist(door, g.pos[j]);
                g.adj[i].push_back({j, w, door});
                g.adj[j].push_back({i, w, door});
            }
        }
        // entrance connects to any room touching the entrance point on the plot boundary
        if (geom::pointToRectDistance(ep, rooms[i].r) < geom::EPS) {
            double w = geom::dist(ep, g.pos[i]);
            g.adj[g.n].push_back({i, w, ep});
            g.adj[i].push_back({g.n, w, ep});
        }
    }
    return g;
}

ShortestPaths dijkstra(const Graph& g, int src) {
    const int N = static_cast<int>(g.adj.size());
    ShortestPaths sp;
    sp.dist.assign(N, INF);
    sp.prev.assign(N, -1);
    using QE = std::pair<double, int>;
    std::priority_queue<QE, std::vector<QE>, std::greater<QE>> pq;
    sp.dist[src] = 0;
    pq.push({0, src});
    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (d > sp.dist[u]) continue;
        if (u != src && !g.transit[u]) continue;  // cannot walk through a non-transit room
        for (const Edge& e : g.adj[u]) {
            double nd = d + e.w;
            if (nd < sp.dist[e.to] - 1e-12) {
                sp.dist[e.to] = nd;
                sp.prev[e.to] = u;
                pq.push({nd, e.to});
            }
        }
    }
    return sp;
}

double astar(const Graph& g, int src, int dst, std::vector<int>* path) {
    const int N = static_cast<int>(g.adj.size());
    std::vector<double> gs(N, INF);
    std::vector<int> prev(N, -1);
    auto h = [&](int u) { return geom::dist(g.pos[u], g.pos[dst]); };
    using QE = std::pair<double, int>;
    std::priority_queue<QE, std::vector<QE>, std::greater<QE>> pq;
    gs[src] = 0;
    pq.push({h(src), src});
    while (!pq.empty()) {
        auto [f, u] = pq.top();
        pq.pop();
        if (u == dst) break;
        if (f > gs[u] + h(u) + 1e-12) continue;
        if (u != src && !g.transit[u]) continue;
        for (const Edge& e : g.adj[u]) {
            double ng = gs[u] + e.w;
            if (ng < gs[e.to] - 1e-12) {
                gs[e.to] = ng;
                prev[e.to] = u;
                pq.push({ng + h(e.to), e.to});
            }
        }
    }
    if (path) {
        path->clear();
        if (gs[dst] < INF) {
            for (int v = dst; v != -1; v = prev[v]) path->push_back(v);
            std::reverse(path->begin(), path->end());
        }
    }
    return gs[dst];
}

std::vector<int> reconstructPath(const ShortestPaths& sp, int dst) {
    std::vector<int> p;
    if (sp.dist[dst] == INF) return p;
    for (int v = dst; v != -1; v = sp.prev[v]) p.push_back(v);
    std::reverse(p.begin(), p.end());
    return p;
}

std::vector<int> unreachableRooms(const Graph& g, const ShortestPaths& sp) {
    std::vector<int> out;
    for (int i = 0; i < g.n; ++i)
        if (g.active[i] && sp.dist[i] == INF) out.push_back(i);
    return out;
}

int connectedComponents(const Graph& g) {
    const int N = static_cast<int>(g.adj.size());
    std::vector<char> seen(N, 0);
    int comps = 0;
    for (int s = 0; s < N; ++s) {
        if (seen[s] || !g.active[s]) continue;
        ++comps;
        std::vector<int> st{s};
        seen[s] = 1;
        while (!st.empty()) {
            int u = st.back();
            st.pop_back();
            for (const Edge& e : g.adj[u])
                if (!seen[e.to]) { seen[e.to] = 1; st.push_back(e.to); }
        }
    }
    return comps;
}

}  // namespace archopt
