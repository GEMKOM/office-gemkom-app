export function getAllowedTeams(team) {
    if (team === 'planning'){
        return ['planning', 'cutting', 'warehouse'];
    } else if (team === 'manufacturing'){
        return ['manufacturing', 'maintenance', 'machining', 'welding']
    } else if (team === 'management'){
        return [];
    } else {
        return [team];
    }
}