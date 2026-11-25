"""Writes the four predefined sample project definitions to demo_data/projects/*.json."""
import json, os

OUT = os.path.join(os.path.dirname(__file__), "..", "demo_data", "projects")

def room(name, typ, area, mw, mh, pw=None, ph=None, prio=2):
    return {"name": name, "type": typ, "requiredArea": area, "minWidth": mw, "minHeight": mh,
            "prefWidth": pw or mw, "prefHeight": ph or mh, "priority": prio}

def rel(a, b, t, w=1.0):
    return {"a": a, "b": b, "type": t, "weight": w}

P = []

P.append({
    "key": "community-centre", "name": "Community Centre", "projectType": "Community Centre",
    "description": "30 m x 20 m community centre: reception, two classrooms, office, two toilets, storage, multipurpose hall and a corridor spine.",
    "plot": {"width": 30, "height": 20}, "entrance": {"side": "south", "offset": 0.5},
    "recommendedAlgorithm": "simulated_annealing",
    "rooms": [
        room("Reception", "Reception", 30, 5, 5, prio=3), room("Classroom 1", "Classroom", 48, 6, 6),
        room("Classroom 2", "Classroom", 48, 6, 6), room("Office", "Office", 20, 4, 4),
        room("Toilet 1", "Toilet", 12, 3, 3, prio=1), room("Toilet 2", "Toilet", 12, 3, 3, prio=1),
        room("Storage", "Storage", 12, 3, 3, prio=1), room("Multipurpose Hall", "Open Area", 100, 10, 8, prio=3),
        room("Corridor", "Corridor", 40, 2, 2, prio=3)],
    "relationships": [
        rel("Reception", "ENTRANCE", "must_adjacent", 3), rel("Office", "Reception", "prefer_adjacent", 2),
        rel("Classroom 1", "Classroom 2", "must_adjacent", 2), rel("Toilet 1", "Corridor", "prefer_adjacent", 1.5),
        rel("Toilet 2", "Corridor", "prefer_adjacent", 1.5), rel("Storage", "Multipurpose Hall", "prefer_adjacent", 1)],
    "constraints": {"minCorridorWidth": 2.0, "maxExpansion": 1.5},
})

P.append({
    "key": "residential-apartment", "name": "Residential Apartment", "projectType": "Residential",
    "description": "25 m x 20 m two-bedroom apartment with living/dining, kitchen, two bathrooms, balcony and corridor.",
    "plot": {"width": 25, "height": 20}, "entrance": {"side": "south", "offset": 0.5},
    "recommendedAlgorithm": "genetic",
    "rooms": [
        room("Living Room", "Living Room", 60, 6, 6, prio=3), room("Kitchen", "Kitchen", 25, 3.5, 3.5),
        room("Master Bedroom", "Bedroom", 36, 4.5, 4.5), room("Bedroom 2", "Bedroom", 28, 3.5, 3.5),
        room("Bathroom 1", "Toilet", 10, 2, 2.5, prio=1), room("Bathroom 2", "Toilet", 9, 2, 2.5, prio=1),
        room("Dining Area", "Dining Area", 28, 4, 4), room("Balcony", "Balcony", 20, 2, 3, prio=1),
        room("Corridor", "Corridor", 36, 1.2, 1.2, prio=3)],
    "relationships": [
        rel("Living Room", "ENTRANCE", "must_adjacent", 3), rel("Dining Area", "Kitchen", "must_adjacent", 2),
        rel("Master Bedroom", "Bedroom 2", "prefer_adjacent", 2), rel("Bathroom 1", "Corridor", "prefer_adjacent", 1.5),
        rel("Bathroom 2", "Corridor", "prefer_adjacent", 1.5), rel("Balcony", "Living Room", "prefer_adjacent", 1)],
    "constraints": {"minCorridorWidth": 1.2, "maxExpansion": 1.5},
})

P.append({
    "key": "office-workspace", "name": "Office Workspace", "projectType": "Office",
    "description": "30 m x 20 m office floor: reception, manager cabin, meeting and conference rooms, open workspace, pantry, toilets, storage.",
    "plot": {"width": 30, "height": 20}, "entrance": {"side": "south", "offset": 0.5},
    "recommendedAlgorithm": "simulated_annealing",
    "rooms": [
        room("Reception", "Reception", 25, 4, 4, prio=3), room("Manager Cabin", "Office", 16, 3.5, 3.5),
        room("Meeting Room", "Meeting Room", 24, 4, 4), room("Open Workspace", "Open Area", 120, 10, 8, prio=3),
        room("Conference Room", "Conference Room", 40, 5, 5), room("Pantry", "Custom Room", 16, 3, 3, prio=1),
        room("Toilets", "Toilet", 24, 4, 4, prio=1), room("Storage", "Storage", 12, 3, 3, prio=1),
        room("Circulation", "Corridor", 45, 2, 2, prio=3)],
    "relationships": [
        rel("Reception", "ENTRANCE", "must_adjacent", 3), rel("Manager Cabin", "Reception", "prefer_adjacent", 2),
        rel("Meeting Room", "Open Workspace", "prefer_adjacent", 2), rel("Pantry", "Open Workspace", "prefer_nearby", 1),
        rel("Conference Room", "Open Workspace", "must_separate", 2), rel("Toilets", "Circulation", "prefer_adjacent", 1)],
    "constraints": {"minCorridorWidth": 1.8, "maxExpansion": 1.5, "separateDistance": 3.0},
})

P.append({
    "key": "educational-building", "name": "Educational Building", "projectType": "Educational",
    "description": "35 m x 25 m teaching block: reception, three classrooms, faculty room, computer lab, library, toilets, storage and corridors.",
    "plot": {"width": 35, "height": 25}, "entrance": {"side": "south", "offset": 0.5},
    "recommendedAlgorithm": "simulated_annealing",
    "rooms": [
        room("Reception", "Reception", 30, 5, 5, prio=3), room("Classroom 1", "Classroom", 48, 6, 6),
        room("Classroom 2", "Classroom", 48, 6, 6), room("Classroom 3", "Classroom", 48, 6, 6),
        room("Faculty Room", "Office", 30, 5, 5), room("Computer Lab", "Custom Room", 60, 7, 7),
        room("Library", "Custom Room", 70, 7, 7), room("Toilet 1", "Toilet", 12, 3, 3, prio=1),
        room("Toilet 2", "Toilet", 12, 3, 3, prio=1), room("Storage", "Storage", 12, 3, 3, prio=1),
        room("Corridor", "Corridor", 60, 2, 2, prio=3)],
    "relationships": [
        rel("Reception", "ENTRANCE", "must_adjacent", 3), rel("Classroom 1", "Classroom 2", "prefer_adjacent", 2),
        rel("Classroom 2", "Classroom 3", "prefer_adjacent", 2), rel("Classroom 1", "Classroom 3", "prefer_nearby", 1),
        rel("Faculty Room", "Classroom 2", "prefer_nearby", 1.5), rel("Toilet 1", "Corridor", "prefer_adjacent", 1.5),
        rel("Toilet 2", "Corridor", "prefer_adjacent", 1.5), rel("Library", "Reception", "must_separate", 1.5),
        rel("Computer Lab", "Reception", "must_separate", 1.5)],
    "constraints": {"minCorridorWidth": 2.0, "maxExpansion": 1.5, "separateDistance": 3.0},
})

os.makedirs(OUT, exist_ok=True)
for p in P:
    with open(os.path.join(OUT, p["key"] + ".json"), "w") as f:
        json.dump(p, f, indent=2)
    print("wrote", p["key"])
