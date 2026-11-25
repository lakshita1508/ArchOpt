// Layout generation and optimisation: constraint-based generation, simulated annealing, genetic algorithm.
//
// A layout is encoded as a *slicing tree* (recursive guillotine partition of the plot). Every
// genome therefore decodes to rectangles that are inside the plot and never overlap; the search
// then optimises sizes, adjacency, circulation and feasibility of the remaining hard constraints.
#pragma once
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

#include "evaluate.hpp"
#include "types.hpp"

namespace archopt {

// Portable, deterministic PRNG (xoshiro-style splitmix64) so results are reproducible across compilers.
class Rng {
public:
    explicit Rng(uint64_t seed) : s_(seed * 0x9E3779B97F4A7C15ull + 0x1234567ull) { next(); }
    uint64_t next() {
        uint64_t z = (s_ += 0x9E3779B97F4A7C15ull);
        z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
        z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
        return z ^ (z >> 31);
    }
    double uni() { return static_cast<double>(next() >> 11) * (1.0 / 9007199254740992.0); }
    int randint(int n) { return n <= 1 ? 0 : static_cast<int>(next() % static_cast<uint64_t>(n)); }
    double gauss();

private:
    uint64_t s_;
};

struct Genome {
    std::vector<int> perm;      // leaf order (room indices)
    std::vector<char> vertical; // per internal node (pre-order): vertical split?
    std::vector<double> cut;    // per internal node: fraction of leaves sent to the left child
    std::vector<double> bias;   // per internal node: additive shift of the area split
};

struct Options {
    std::string algorithm = "simulated_annealing";  // constraint_based | simulated_annealing | genetic
    int candidates = 4;
    int maxIterations = 6000;  // SA: steps per chain; GA: generations; constraint-based: samples
    uint64_t seed = 42;
    int threads = 0;           // 0 = hardware concurrency
    int population = 48;       // GA only
};

struct OptimizationResult {
    std::string status = "success";  // success | infeasible | invalid_input
    std::string algorithm;
    uint64_t seed = 0;
    int threadsUsed = 1;
    long long evaluated = 0;
    long long feasibleFound = 0;
    double executionMs = 0;
    double bestCost = 0;
    std::vector<Layout> layouts;      // best distinct feasible layouts (cost ascending)
    std::vector<std::string> reasons; // explanation when infeasible / warnings
    bool hasBestInfeasible = false;
    Layout bestInfeasible;
};

// Append the engine-generated "Unallocated" open-space cell when the plot is larger than the programme needs.
Problem withFreeSpace(const Problem& p);

std::vector<Room> placeGenome(const Problem& p, const Genome& g);
Genome randomGenome(const Problem& p, Rng& rng);
void mutateGenome(Genome& g, Rng& rng);
Genome crossoverGenomes(const Genome& a, const Genome& b, Rng& rng);

void parallelFor(int count, int threads, const std::function<void(int)>& fn);

OptimizationResult optimize(const Problem& p, const Options& o);

}  // namespace archopt
