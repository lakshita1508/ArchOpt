// Unit tests for the ArchOpt engine (self-contained mini framework, no external dependency).
#include <cmath>
#include <iostream>
#include <thread>

#include "archopt/geometry.hpp"
#include "archopt/graph.hpp"
#include "archopt/io.hpp"
#include "archopt/optimizer.hpp"

using namespace archopt;

static int g_fail = 0, g_pass = 0;
#define CHECK(cond) do { if (cond) ++g_pass; else { ++g_fail; std::cerr << "FAIL " << __FILE__ << ":" << __LINE__ << "  " #cond "\n"; } } while (0)
#define NEAR(a, b) CHECK(std::fabs((a) - (b)) < 1e-6)

static Room mk(const std::string& n, const std::string& t, double area, double mw, double mh, Rect r = {}) {
    Room x; x.name = n; x.type = t; x.requiredArea = area; x.minWidth = mw; x.minHeight = mh; x.r = r; x.transit = isTransitType(t); return x;
}

static Problem communityCentre() {
    Problem p;
    p.plot = {30, 20};
    p.rooms = {mk("Reception", "Reception", 30, 5, 5), mk("Classroom 1", "Classroom", 48, 6, 6), mk("Classroom 2", "Classroom", 48, 6, 6),
               mk("Office", "Office", 20, 4, 4), mk("Toilet 1", "Toilet", 12, 3, 3), mk("Toilet 2", "Toilet", 12, 3, 3),
               mk("Storage", "Storage", 12, 3, 3), mk("Multipurpose Hall", "Open Area", 100, 10, 8), mk("Corridor", "Corridor", 40, 2, 2)};
    p.relationships = {{"Reception", "ENTRANCE", RelType::MustAdjacent, 3}, {"Office", "Reception", RelType::PreferAdjacent, 2},
                       {"Classroom 1", "Classroom 2", RelType::MustAdjacent, 2}, {"Storage", "Multipurpose Hall", RelType::PreferNearby, 1}};
    p.prepare();
    return p;
}

static void testGeometry() {
    Rect a{0, 0, 4, 4}, b{4, 0, 4, 4}, c{2, 2, 4, 4}, d{10, 10, 1, 1};
    CHECK(!geom::intersects(a, b));            // touching edges are not an overlap
    CHECK(geom::intersects(a, c));
    NEAR(geom::intersectionArea(a, c), 4.0);
    CHECK(!geom::intersects(a, d));
    NEAR(a.area(), 16.0);
    Rect plot{0, 0, 10, 10};
    CHECK(geom::insideRect(a, plot));
    CHECK(!geom::insideRect(Rect{8, 8, 4, 4}, plot));
    NEAR(geom::outsideArea(Rect{8, 8, 4, 4}, plot), 12.0);
    CHECK(geom::containsPoint(a, Point{2, 2}));
    CHECK(!geom::containsPoint(a, Point{5, 5}));
    NEAR(geom::rectDistance(a, b), 0.0);
    NEAR(geom::rectDistance(a, Rect{7, 0, 1, 1}), 3.0);
    NEAR(geom::rectDistance(a, Rect{7, 8, 1, 1}), 5.0);  // 3-4-5 triangle
    Point mid;
    NEAR(geom::sharedWall(a, b, &mid), 4.0);
    NEAR(mid.x, 4.0); NEAR(mid.y, 2.0);
    NEAR(geom::sharedWall(a, Rect{4, 4, 2, 2}), 0.0);   // corner contact only
    NEAR(geom::sharedWall(a, Rect{1, 4, 2, 2}), 2.0);   // horizontal wall
    NEAR(geom::dimensionShortfall(Rect{0, 0, 3, 6}, 5, 3), 0.0);  // fits when rotated
    CHECK(geom::dimensionShortfall(Rect{0, 0, 3, 3}, 5, 3) > 1.9);
}

static std::vector<Room> strip() {  // A(0..4) B(4..8) C(8..12) in a row, 12 x 4 plot
    return {mk("A", "Corridor", 16, 1, 1, {0, 0, 4, 4}), mk("B", "Office", 16, 1, 1, {4, 0, 4, 4}), mk("C", "Office", 16, 1, 1, {8, 0, 4, 4})};
}

static void testGraph() {
    Problem p;
    p.plot = {12, 4};
    p.entrance = {Side::West, 0.5};
    auto rooms = strip();
    rooms[1].transit = true;  // B can be walked through
    Graph g = buildGraph(rooms, p.plot, p.entrance, p.constraints);
    CHECK(g.n == 3);
    CHECK(g.adj[0].size() == 2);  // A touches B and the entrance
    ShortestPaths sp = dijkstra(g, g.entranceNode());
    NEAR(sp.dist[0], 2.0);                     // entrance (0,2) -> centre of A (2,2)
    NEAR(sp.dist[1], 2.0 + 4.0);               // A centre -> door (4,2) -> B centre (6,2)
    NEAR(sp.dist[2], 2.0 + 4.0 + 4.0);
    CHECK(unreachableRooms(g, sp).empty());
    auto path = reconstructPath(sp, 2);
    CHECK(path.size() == 4);
    // A* must agree with Dijkstra
    std::vector<int> ap;
    NEAR(astar(g, g.entranceNode(), 2, &ap), sp.dist[2]);
    CHECK(ap == path);
    // transit rule: when B cannot be crossed, C becomes unreachable
    rooms[1].transit = false;
    Graph g2 = buildGraph(rooms, p.plot, p.entrance, p.constraints);
    ShortestPaths sp2 = dijkstra(g2, g2.entranceNode());
    auto un = unreachableRooms(g2, sp2);
    CHECK(un.size() == 1 && un[0] == 2);
    CHECK(connectedComponents(g2) == 1);  // still physically connected
    CHECK(astar(g2, g2.entranceNode(), 2) == INF);
    // A* from a non-transit source to its neighbour works
    NEAR(astar(g2, 1, 0), 4.0);
}

static void testEvaluate() {
    Problem p = communityCentre();
    p.plot = {12, 4};
    p.rooms = strip();
    p.entrance = {Side::West, 0.5};
    p.rooms[1].transit = true;
    p.relationships.clear();
    p.relationships.push_back({"A", "B", RelType::MustAdjacent, 1});
    p.relationships.push_back({"A", "C", RelType::MustSeparate, 1});
    p.constraints.separateDistance = 4;
    p.prepare();
    Layout ok = evaluate(p, p.rooms, true);
    CHECK(ok.metrics.feasible);
    NEAR(ok.metrics.areaEfficiency, 100.0);
    NEAR(ok.metrics.adjacencySatisfaction, 100.0);
    // overlap is detected and makes the layout infeasible
    auto bad = p.rooms; bad[1].r.x = 3;
    Layout lo = evaluate(p, bad, true);
    CHECK(!lo.metrics.feasible);
    CHECK(lo.metrics.costOverlap > 0);
    // boundary violation
    auto out = p.rooms; out[2].r.x = 10;
    Layout lb = evaluate(p, out, true);
    CHECK(!lb.metrics.feasible && lb.metrics.costBoundary > 0);
    // insufficient area
    auto small = p.rooms; small[2].r.w = 2;
    CHECK(!evaluate(p, small, false).metrics.feasible);
    // minimum dimensions
    p.rooms[2].minWidth = 5; p.rooms[2].minHeight = 5;
    CHECK(!evaluate(p, p.rooms, false).metrics.feasible);
    // room-area calculation
    NEAR(Rect({0, 0, 3.5, 2}).area(), 7.0);
}

static void testRelationshipScoring() {
    Problem p;
    p.plot = {20, 10};
    p.rooms = {mk("A", "Office", 10, 1, 1, {0, 0, 5, 5}), mk("B", "Office", 10, 1, 1, {5, 0, 5, 5}), mk("C", "Office", 10, 1, 1, {15, 5, 5, 5})};
    p.relationships = {{"A", "B", RelType::PreferAdjacent, 1}, {"A", "C", RelType::PreferAdjacent, 1}};
    p.prepare();
    Layout L = evaluate(p, p.rooms, false);
    NEAR(L.metrics.adjacencySatisfaction, 50.0);  // exactly 1 of 2 equally weighted relations satisfied
    p.relationships = {{"A", "B", RelType::PreferNearby, 1}};
    p.prepare();
    NEAR(evaluate(p, p.rooms, false).metrics.adjacencySatisfaction, 100.0);
}

static void testOptimizer(const std::string& algo) {
    Problem p = communityCentre();
    Options o;
    o.algorithm = algo;
    o.candidates = 3;
    o.maxIterations = algo == "genetic" ? 150 : 4000;
    o.seed = 7;
    OptimizationResult r = optimize(p, o);
    std::cerr << "  [" << algo << "] status=" << r.status << " feasible=" << r.feasibleFound << "/" << r.evaluated
              << " layouts=" << r.layouts.size() << " best=" << r.bestCost << " ms=" << r.executionMs << "\n";
    CHECK(r.status == "success");
    CHECK(!r.layouts.empty());
    Problem pf = withFreeSpace(p);
    for (const Layout& L : r.layouts) {  // independently re-validate every returned layout
        Layout chk = evaluate(pf, L.rooms, true);
        CHECK(chk.metrics.feasible);
        for (size_t i = 0; i < L.rooms.size(); ++i) {
            CHECK(geom::insideRect(L.rooms[i].r, pf.plot.rect()));
            for (size_t j = i + 1; j < L.rooms.size(); ++j) CHECK(!geom::intersects(L.rooms[i].r, L.rooms[j].r));
        }
        CHECK(L.metrics.accessibilityScore > 99.9);
    }
}

static void testDeterminism() {
    Problem p = communityCentre();
    Options o; o.algorithm = "simulated_annealing"; o.candidates = 3; o.maxIterations = 1500; o.seed = 11;
    o.threads = 1;
    auto r1 = optimize(p, o);
    o.threads = 4;
    auto r2 = optimize(p, o);
    CHECK(r1.layouts.size() == r2.layouts.size());
    CHECK(r1.layouts.size() > 0);
    if (!r1.layouts.empty() && r1.layouts.size() == r2.layouts.size()) {
        NEAR(r1.bestCost, r2.bestCost);  // same seed + input => same result, independent of thread count
        for (size_t i = 0; i < r1.layouts.size(); ++i)
            for (size_t k = 0; k < r1.layouts[i].rooms.size(); ++k) NEAR(r1.layouts[i].rooms[k].r.x, r2.layouts[i].rooms[k].r.x);
    }
    o.seed = 12;
    auto r3 = optimize(p, o);
    CHECK(r3.status == "success");
}

static void testParallelFor() {
    std::vector<int> v(1000, 0);
    parallelFor(1000, 8, [&](int i) { v[i] = i * 2; });
    bool ok = true;
    for (int i = 0; i < 1000; ++i) ok = ok && v[i] == i * 2;
    CHECK(ok);
}

static void testInfeasible() {
    Problem p = communityCentre();
    p.plot = {10, 10};  // 100 m2 plot, 322 m2 required
    OptimizationResult r = optimize(p, Options{});
    CHECK(r.status == "infeasible");
    CHECK(!r.reasons.empty());
    CHECK(r.layouts.empty());
    Problem q = communityCentre();
    q.rooms[7].minWidth = 40;  // hall cannot fit in a 30 x 20 plot
    auto r2 = optimize(q, Options{});
    CHECK(r2.status == "infeasible");
    CHECK(precheck(q).size() >= 1);
}

static void testJson() {
    Json j = Json::parse(R"({"a":[1,2.5,"x\n"],"b":{"c":true,"d":null}})");
    CHECK(j["a"].items().size() == 3);
    NEAR(j["a"].items()[1].num(), 2.5);
    CHECK(j["b"]["c"].boolean());
    CHECK(j["b"]["d"].isNull());
    Json k = Json::parse(j.dump());
    CHECK(k.dump() == j.dump());
    bool threw = false;
    try { Json::parse("{bad"); } catch (...) { threw = true; }
    CHECK(threw);
}

static void testIoRoundTrip() {
    const char* txt = R"({"plot":{"width":30,"height":20},"rooms":[
      {"name":"Reception","type":"Reception","requiredArea":30,"minWidth":5,"minHeight":5},
      {"name":"Corridor","type":"Corridor","requiredArea":40,"minWidth":2,"minHeight":2},
      {"name":"Office","type":"Office","requiredArea":20,"minWidth":4,"minHeight":4}],
      "relationships":[{"a":"Reception","b":"ENTRANCE","type":"must_adjacent","weight":3}],
      "options":{"algorithm":"genetic","candidates":2,"maxIterations":60,"seed":3}})";
    Json in = Json::parse(txt);
    Problem p = problemFromJson(in);
    Options o = optionsFromJson(in);
    CHECK(p.rooms.size() == 3 && o.algorithm == "genetic");
    auto r = optimize(p, o);
    Json out = resultToJson(r, p);
    CHECK(out["status"].str() == "success");
    CHECK(out["layouts"].items().size() >= 1);
    CHECK(out["layouts"].items()[0]["circulation"]["paths"].items().size() == 3);
}

int main() {
    testGeometry(); testGraph(); testEvaluate(); testRelationshipScoring(); testJson(); testParallelFor();
    testOptimizer("constraint_based"); testOptimizer("simulated_annealing"); testOptimizer("genetic");
    testDeterminism(); testInfeasible(); testIoRoundTrip();
    std::cout << "passed=" << g_pass << " failed=" << g_fail << std::endl;
    return g_fail ? 1 : 0;
}
