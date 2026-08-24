/**
 * Initials and a stable colour for a person's name.
 *
 * Both were defined byte-identically in topic-discussion.js and in the
 * project-tracking copy of it. The colour has to be derived the same way
 * everywhere or the same person shows up in two colours on two screens, so it
 * lives here now.
 */

/** "Caner Şahin" → "CŞ". Falls back to the first two characters. */
export function getUserInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

/** A colour from a fixed palette, chosen by hashing the name so it never moves. */
export function getAvatarColor(name) {
    if (!name) return '#6c757d';
    const colors = [
        '#0052CC', '#0065FF', '#0747A6', '#00875A', '#36B37E',
        '#FF5630', '#FFAB00', '#FF991F', '#6554C0', '#8777D9',
        '#00B8D9', '#00C7E6', '#DE350B', '#FF8F73', '#253858'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}
