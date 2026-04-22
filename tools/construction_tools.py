import random

def check_material_availability(phase_name: str) -> str:
    """
    Checks if construction materials are available for a given phase.
    Args:
        phase_name: The name of the construction phase (e.g., 'Foundation', 'Plumbing').
    Returns:
        A status message indicating availability.
    """
    materials = ["Steel", "Concrete", "Lumber", "PVC Pipes", "Electrical Wiring", "Drywall"]
    status = random.choice(["In Stock", "On Order", "Delivered", "Delayed"])
    material = random.choice(materials)
    return f"Material status for {phase_name}: {material} is {status}."

def check_worker_availability(phase_name: str) -> str:
    """
    Checks the availability of specialized workers for a given phase.
    Args:
        phase_name: The name of the construction phase.
    Returns:
        A message with worker count and availability.
    """
    roles = ["General Labor", "Electrician", "Plumber", "Foreman", "Inspector"]
    available_count = random.randint(0, 10)
    needed_count = random.randint(2, 8)
    status = "Sufficient" if available_count >= needed_count else "Shortage"
    return f"Worker status for {phase_name}: {available_count} workers available. Status: {status}."

def check_permit_status(phase_name: str) -> str:
    """
    Checks the status of required permits for a given construction phase.
    Args:
        phase_name: The name of the construction phase.
    Returns:
        A status message of the permit.
    """
    statuses = ["Approved", "Pending Review", "Under Revision", "Not Started"]
    status = random.choice(statuses)
    permit_type = random.choice(["Zoning", "Structural", "Utility", "Safety"])
    return f"Permit status for {phase_name}: {permit_type} permit is {status}."

def calculate_duration(phase_name: str) -> str:
    """
    Estimates the duration of a construction phase based on complexity.
    Args:
        phase_name: The name of the construction phase.
    Returns:
        Estimated number of days.
    """
    durations = {
        "Foundation": 14,
        "Framing": 21,
        "Electrical": 7,
        "Plumbing": 7,
        "Interior Finish": 30,
        "Landscaping": 5,
        "Inspection": 2
    }
    days = durations.get(phase_name, random.randint(5, 15))
    return f"Estimated duration for {phase_name}: {days} days."
