#include "archopt/optimizer.hpp"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <map>
#include <mutex>
#include <set>
#include <thread>

#include "archopt/geometry.hpp"

namespace archopt {

double Rng::gauss() {
    double u1 = std::max(uni(), 1e-12), u2 = uni();
    return std::sqrt(-2.0 * std::log(u1)) * std::cos(6.283185307179586 * u2);
}

void parallelFor(int count, int threads, const std::function<void(int)>& fn) {
    if (threads <= 1 || count <= 1) {
        for (int i = 0; i < count; ++i) fn(i);
        return;
    }
    std::atomic<int> next{0};
    auto worker = [&] {
        for (int i = next++; i < count; i = next++) fn(i);
    };
    std::vector<std::thread> pool;
    int t = std::min(threads, count);
    for (int k = 1; k < t; ++k) pool.emplace_back(worker);
    worker();
    for (auto& th : pool) th.join();
}

Problem withFreeSpace(const Problem& p) {
    Problem q = p;
    double sum = 0;
    for (auto& r : q.rooms) sum += r.requiredArea;
    double plotA = q.plot.totalArea();
    double freeA = std::max(plotA - q.constraints.maxExpansion * sum, q.constraints.openSpaceRatio * plotA);
    if (freeA > 0.02 * plotA && freeA > 1.0) {
        Room f;
        f.name = "Unallocated";
        f.type = "Open Space";
        f.requiredArea = freeA;
        f.isFree = true;
        q.rooms.push_back(f);
    }
    q.prepare();
    return q;
}

namespace {

struct Placer {
    const Problem& p;
    Genome& g;
    std::vector<Room>* out;
    Rng* rng;  // non-null => generate orientation/cut/bias while walking
    int counter = 0;
    double snap;

    double snapTo(double v, double lim) const {
        if (snap <= 0) return v;
        double s = std::round(v / snap) * snap;
        if (lim > 2 * snap) s = std::min(std::max(s, snap), lim - snap);
        else s = lim / 2;
        return s;
    }

    void rec(int lo, int hi, Rect r) {
        int n = hi - lo;
        if (n == 1) {
            if (out) (*out)[g.perm[lo]].r = r;
            return;
        }
        int idx = counter++;
        if (rng) {
            g.vertical[idx] = ((r.w >= r.h) != (rng->uni() < 0.2)) ? 1 : 0;
            g.cut[idx] = 0.3 + 0.4 * rng->uni();
            g.bias[idx] = (rng->uni() - 0.5) * 0.2;
        }
        int k = std::min(std::max(static_cast<int>(std::lround(g.cut[idx] * n)), 1), n - 1);
        double wl = 0, wr = 0;
        for (int i = lo; i < lo + k; ++i) wl += p.rooms[g.perm[i]].requiredArea;
        for (int i = lo + k; i < hi; ++i) wr += p.rooms[g.perm[i]].requiredArea;
        double frac = std::min(std::max(wl / (wl + wr) + g.bias[idx], 0.12), 0.88);
        Rect a = r, b = r;
        if (g.vertical[idx]) {
            double sw = snapTo(r.w * frac, r.w);
            a.w = sw;
            b.x = r.x + sw;
            b.w = r.w - sw;
        } else {
            double sh = snapTo(r.h * frac, r.h);
            a.h = sh;
            b.y = r.y + sh;
            b.h = r.h - sh;
        }
        rec(lo, lo + k, a);
        rec(lo + k, hi, b);
    }
};

std::string signature(const std::vector<Room>& rooms) {
    std::string s;
    char b[48];
    for (auto& r : rooms) {
        std::snprintf(b, sizeof b, "%.0f,%.0f,%.0f,%.0f;", r.r.x * 2, r.r.y * 2, r.r.w * 2, r.r.h * 2);
        s += b;
    }
    return s;
}

double layoutDistance(const std::vector<Room>& a, const std::vector<Room>& b) {
    double s = 0;
    for (size_t i = 0; i < a.size(); ++i) s += std::fabs(a[i].r.cx() - b[i].r.cx()) + std::fabs(a[i].r.cy() - b[i].r.cy());
    return s / std::max<size_t>(1, a.size());
}

struct PoolEntry {
    double cost;
    std::string sig;
    Genome genome;
};

// Bounded set of the best distinct feasible genomes seen by one search.
struct Pool {
    size_t cap;
    std::vector<PoolEntry> items;
    std::set<std::string> sigs;
    explicit Pool(size_t c) : cap(c) {}
    void offer(double cost, const Genome& g, const std::vector<Room>& rooms) {
        if (items.size() >= cap && cost >= items.back().cost) return;
        std::string s = signature(rooms);
        if (sigs.count(s)) return;
        sigs.insert(s);
        items.push_back({cost, s, g});
        std::sort(items.begin(), items.end(), [](const PoolEntry& x, const PoolEntry& y) { return x.cost != y.cost ? x.cost < y.cost : x.sig < y.sig; });
        if (items.size() > cap) { sigs.erase(items.back().sig); items.pop_back(); }
    }
};

struct SearchOutcome {
    Pool pool{12};
    double bestCost = INF;
    Genome bestGenome;
    long long evaluated = 0, feasible = 0;
};

inline void noteEval(SearchOutcome& so, const Problem& p, const Genome& g, const Layout& L, std::vector<Room>& rooms) {
    ++so.evaluated;
    if (L.metrics.feasible) {
        ++so.feasible;
        so.pool.offer(L.metrics.totalCost, g, rooms);
    }
    if (L.metrics.totalCost < so.bestCost) { so.bestCost = L.metrics.totalCost; so.bestGenome = g; }
    (void)p;
}

// -------------------------------------------------------------------------------------------
// A. Constraint-based generation: sample random arrangements, greedily repair, reject those still violating hard constraints.
SearchOutcome constraintChunk(const Problem& P, uint64_t seed, int samples) {
    SearchOutcome so;
    Rng rng(seed);
    int n = static_cast<int>(P.rooms.size());
    for (int s = 0; s < samples; ++s) {
        Genome g;
        g.perm.resize(n);
        for (int i = 0; i < n; ++i) g.perm[i] = i;
        for (int i = n - 1; i > 0; --i) std::swap(g.perm[i], g.perm[rng.randint(i + 1)]);
        g.vertical.assign(std::max(0, n - 1), 0);
        g.cut.assign(std::max(0, n - 1), 0.5);
        g.bias.assign(std::max(0, n - 1), 0);
        std::vector<Room> rooms = P.rooms;
        Placer pl{P, g, &rooms, &rng, 0, P.constraints.snap};
        pl.rec(0, n, P.plot.rect());
        Layout L = evaluate(P, rooms, false);
        noteEval(so, P, g, L, rooms);
        // greedy repair: accept only mutations that lower the cost (no uphill moves, unlike annealing);
        // the candidate is finally accepted only if every hard constraint holds, otherwise it is rejected.
        double cost = L.metrics.totalCost;
        for (int step = 0; step < 150 && !L.metrics.feasible; ++step) {
            Genome t = g;
            mutateGenome(t, rng);
            auto r2 = placeGenome(P, t);
            Layout L2 = evaluate(P, r2, false);
            noteEval(so, P, t, L2, r2);
            if (L2.metrics.totalCost <= cost) { g = std::move(t); cost = L2.metrics.totalCost; L = std::move(L2); }
        }
    }
    return so;
}

// B. Simulated annealing (one chain).
SearchOutcome annealChain(const Problem& P, uint64_t seed, int iters) {
    SearchOutcome so;
    Rng rng(seed);
    Genome cur = randomGenome(P, rng);
    std::vector<Room> rooms = placeGenome(P, cur);
    Layout L = evaluate(P, rooms, false);
    noteEval(so, P, cur, L, rooms);
    double curCost = L.metrics.totalCost;

    // calibrate the starting temperature from the average uphill move
    double worse = 0;
    int wc = 0;
    for (int i = 0; i < 40; ++i) {
        Genome t = cur;
        mutateGenome(t, rng);
        auto r2 = placeGenome(P, t);
        double c2 = evaluate(P, r2, false).metrics.totalCost;
        ++so.evaluated;
        if (c2 > curCost) { worse += c2 - curCost; ++wc; }
    }
    double T0 = wc ? 1.5 * (worse / wc) : std::max(1.0, curCost * 0.1);
    T0 = std::max(T0, 1.0);
    double Tend = std::max(T0 * 1e-4, 1e-3);
    double alpha = std::pow(Tend / T0, 1.0 / std::max(1, iters));
    double T = T0;
    for (int it = 0; it < iters; ++it, T *= alpha) {
        Genome cand = cur;
        mutateGenome(cand, rng);
        if (rng.uni() < 0.3) mutateGenome(cand, rng);
        auto r2 = placeGenome(P, cand);
        Layout L2 = evaluate(P, r2, false);
        noteEval(so, P, cand, L2, r2);
        double d = L2.metrics.totalCost - curCost;
        if (d <= 0 || rng.uni() < std::exp(-d / T)) {  // Metropolis acceptance
            cur = std::move(cand);
            curCost = L2.metrics.totalCost;
        }
    }
    return so;
}

}  // namespace

std::vector<Room> placeGenome(const Problem& p, const Genome& g) {
    std::vector<Room> rooms = p.rooms;
    Genome tmp = g;
    Placer pl{p, tmp, &rooms, nullptr, 0, p.constraints.snap};
    pl.rec(0, static_cast<int>(rooms.size()), p.plot.rect());
    return rooms;
}

Genome randomGenome(const Problem& p, Rng& rng) {
    int n = static_cast<int>(p.rooms.size());
    Genome g;
    g.perm.resize(n);
    for (int i = 0; i < n; ++i) g.perm[i] = i;
    for (int i = n - 1; i > 0; --i) std::swap(g.perm[i], g.perm[rng.randint(i + 1)]);
    g.vertical.assign(std::max(0, n - 1), 0);
    g.cut.assign(std::max(0, n - 1), 0.5);
    g.bias.assign(std::max(0, n - 1), 0);
    Placer pl{p, g, nullptr, &rng, 0, p.constraints.snap};
    pl.rec(0, n, p.plot.rect());
    return g;
}

void mutateGenome(Genome& g, Rng& rng) {
    int n = static_cast<int>(g.perm.size());
    int m = static_cast<int>(g.cut.size());
    double r = rng.uni();
    if (r < 0.22 && n > 1) {  // swap two rooms
        std::swap(g.perm[rng.randint(n)], g.perm[rng.randint(n)]);
    } else if (r < 0.34 && n > 2) {  // re-insert one room elsewhere
        int a = rng.randint(n), b = rng.randint(n);
        int v = g.perm[a];
        g.perm.erase(g.perm.begin() + a);
        g.perm.insert(g.perm.begin() + b, v);
    } else if (m > 0 && r < 0.46) {  // flip a split direction
        int i = rng.randint(m);
        g.vertical[i] = !g.vertical[i];
    } else if (m > 0 && r < 0.62) {  // move a tree cut point (changes grouping)
        int i = rng.randint(m);
        g.cut[i] = std::min(0.88, std::max(0.12, g.cut[i] + rng.gauss() * 0.18));
    } else if (m > 0) {  // resize: shift a split position
        int i = rng.randint(m);
        g.bias[i] = std::min(0.35, std::max(-0.35, g.bias[i] + rng.gauss() * 0.06));
    }
}

Genome crossoverGenomes(const Genome& a, const Genome& b, Rng& rng) {
    int n = static_cast<int>(a.perm.size());
    Genome c = a;
    if (n > 1) {  // order crossover (OX) on the room permutation
        int i = rng.randint(n), j = rng.randint(n);
        if (i > j) std::swap(i, j);
        std::vector<int> child(n, -1);
        std::vector<char> used(n, 0);
        for (int k = i; k <= j; ++k) { child[k] = a.perm[k]; used[a.perm[k]] = 1; }
        int pos = 0;
        for (int k = 0; k < n; ++k) {
            int v = b.perm[k];
            if (used[v]) continue;
            while (child[pos] != -1) ++pos;
            child[pos] = v;
        }
        c.perm = child;
    }
    for (size_t k = 0; k < c.cut.size(); ++k) {  // uniform crossover on tree parameters
        if (rng.uni() < 0.5) { c.vertical[k] = b.vertical[k]; c.cut[k] = b.cut[k]; c.bias[k] = b.bias[k]; }
    }
    return c;
}

namespace {

// C. Genetic algorithm: tournament selection, OX crossover, mutation, elitism, stall/generation termination.
SearchOutcome geneticRun(const Problem& P, const Options& o, int threads) {
    SearchOutcome so;
    Rng rng(o.seed * 7919 + 13);
    const int PS = std::max(8, o.population);
    std::vector<Genome> pop(PS);
    for (auto& g : pop) g = randomGenome(P, rng);
    std::vector<double> fit(PS);
    std::vector<Layout> lay(PS);
    std::vector<std::vector<Room>> placed(PS);
    const int elite = 2;
    int stall = 0;
    double lastBest = INF;

    auto evaluateAll = [&] {
        parallelFor(PS, threads, [&](int i) {  // parallel fitness evaluation
            placed[i] = placeGenome(P, pop[i]);
            lay[i] = evaluate(P, placed[i], false);
            fit[i] = lay[i].metrics.totalCost;
        });
        for (int i = 0; i < PS; ++i) noteEval(so, P, pop[i], lay[i], placed[i]);  // sequential => deterministic
    };

    for (int gen = 0; gen < std::max(1, o.maxIterations); ++gen) {
        evaluateAll();
        double best = *std::min_element(fit.begin(), fit.end());
        if (best < lastBest - 1e-9) { lastBest = best; stall = 0; } else ++stall;
        if (stall >= 120) break;  // termination: no improvement
        std::vector<int> order(PS);
        for (int i = 0; i < PS; ++i) order[i] = i;
        std::sort(order.begin(), order.end(), [&](int a, int b) { return fit[a] != fit[b] ? fit[a] < fit[b] : a < b; });
        std::vector<Genome> next;
        next.reserve(PS);
        for (int e = 0; e < elite; ++e) next.push_back(pop[order[e]]);  // elitism
        auto tournament = [&] {
            int best = rng.randint(PS);
            for (int k = 1; k < 3; ++k) { int c = rng.randint(PS); if (fit[c] < fit[best]) best = c; }
            return best;
        };
        while (static_cast<int>(next.size()) < PS) {
            const Genome& pa = pop[tournament()];
            const Genome& pb = pop[tournament()];
            Genome child = rng.uni() < 0.85 ? crossoverGenomes(pa, pb, rng) : pa;
            if (rng.uni() < 0.7) mutateGenome(child, rng);
            if (rng.uni() < 0.3) mutateGenome(child, rng);
            next.push_back(std::move(child));
        }
        pop = std::move(next);
    }
    return so;
}

std::vector<std::string> failureReasons(const Problem& P, const Layout& best) {
    std::vector<std::string> out = precheck(P);
    std::set<std::string> seen;
    for (auto& c : best.checks)
        if (c.status == "failed" && seen.insert(c.message).second && out.size() < 10) out.push_back((c.room.empty() ? "" : c.room + ": ") + c.message);
    return out;
}

}  // namespace

OptimizationResult optimize(const Problem& pIn, const Options& o) {
    using clock = std::chrono::steady_clock;
    auto t0 = clock::now();
    OptimizationResult R;
    R.algorithm = o.algorithm;
    R.seed = o.seed;
    int hw = static_cast<int>(std::thread::hardware_concurrency());
    int threads = o.threads > 0 ? o.threads : std::max(1, hw);
    R.threadsUsed = threads;

    Problem P = pIn;
    P.prepare();
    auto pre = precheck(P);
    if (!pre.empty()) {
        R.status = "infeasible";
        R.reasons = pre;
        R.executionMs = std::chrono::duration<double, std::milli>(clock::now() - t0).count();
        return R;
    }
    P = withFreeSpace(P);

    std::vector<SearchOutcome> outcomes;
    if (o.algorithm == "genetic") {
        outcomes.push_back(geneticRun(P, o, threads));
    } else if (o.algorithm == "constraint_based") {
        int chunks = 16;
        int per = std::max(1, o.maxIterations / chunks);
        outcomes.resize(chunks);
        parallelFor(chunks, threads, [&](int c) { outcomes[c] = constraintChunk(P, o.seed * 1000003ull + c, per); });
    } else {  // simulated annealing: independent chains evaluated concurrently
        int chains = std::max(std::max(o.candidates * 2, 8), 1);
        outcomes.resize(chains);
        parallelFor(chains, threads, [&](int c) { outcomes[c] = annealChain(P, o.seed * 1000003ull + c, o.maxIterations); });
    }

    Pool merged(64);
    SearchOutcome bestInf;
    for (auto& so : outcomes) {  // merged in a fixed order => thread-count independent
        R.evaluated += so.evaluated;
        R.feasibleFound += so.feasible;
        for (auto& e : so.pool.items) merged.offer(e.cost, e.genome, placeGenome(P, e.genome));
        if (so.bestCost < bestInf.bestCost) { bestInf.bestCost = so.bestCost; bestInf.bestGenome = so.bestGenome; }
    }

    // choose up to N distinct (diverse) layouts by ascending cost
    std::vector<std::vector<Room>> chosen;
    std::vector<Layout> picked;
    auto tryPick = [&](double minDiff) {
        for (auto& e : merged.items) {
            if (static_cast<int>(picked.size()) >= std::max(1, o.candidates)) break;
            auto rooms = placeGenome(P, e.genome);
            bool dup = false;
            for (auto& c : chosen) if (layoutDistance(c, rooms) < minDiff) { dup = true; break; }
            if (dup) continue;
            chosen.push_back(rooms);
            picked.push_back(evaluate(P, rooms, true));
        }
    };
    tryPick(2.0);
    tryPick(0.75);
    tryPick(0.0);
    R.layouts = std::move(picked);
    std::sort(R.layouts.begin(), R.layouts.end(), [](const Layout& a, const Layout& b) { return a.metrics.totalCost < b.metrics.totalCost; });

    if (R.layouts.empty()) {
        R.status = "infeasible";
        if (!bestInf.bestGenome.perm.empty()) {
            R.bestInfeasible = evaluate(P, placeGenome(P, bestInf.bestGenome), true);
            R.hasBestInfeasible = true;
            R.reasons = failureReasons(P, R.bestInfeasible);
            R.bestCost = R.bestInfeasible.metrics.totalCost;
        }
        if (R.reasons.empty()) R.reasons.push_back("No feasible layout was found in the evaluated candidates. Try more iterations, another algorithm or relaxed constraints.");
    } else {
        R.bestCost = R.layouts.front().metrics.totalCost;
    }
    R.executionMs = std::chrono::duration<double, std::milli>(clock::now() - t0).count();
    return R;
}

}  // namespace archopt
