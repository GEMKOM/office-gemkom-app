import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { showNotification } from '../../../components/notification/notification.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { getUser } from '../../../authService.js';
import { fetchAllUsers, authFetchUsers } from '../../../apis/users.js';
import { FileViewer } from '../../../components/file-viewer/file-viewer.js';
import { FileAttachments } from '../../../components/file-attachments/file-attachments.js';
import { fetchOrganizationUserGroups } from '../../../apis/human_resources/organization.js';
import {
    listNCRs,
    getNCR,
    createNCR,
    updateNCR,
    submitNCR,
    decideNCR,
    closeNCR,
    listNCRFiles,
    uploadNCRFile,
    deleteNCRFile,
    DEFECT_TYPE_CHOICES,
    SEVERITY_CHOICES,
    DISPOSITION_CHOICES,
    NCR_STATUS_CHOICES,
    NCR_FILE_TYPE_OPTIONS
} from '../../../apis/qualityControl.js';
import { getJobOrderDropdown } from '../../../apis/projects/jobOrders.js';
import { renderNcrForm, printNcrForm, renderNcrContext, numberedSectionTitle } from './ncrForm.js';

// State management
const urlParams = new URLSearchParams(window.location.search);
let currentPage = parseInt(urlParams.get('page')) || 1;
let currentPageSize = parseInt(urlParams.get('page_size')) || 20;
// Filter selections live in the URL so a reload keeps them. `all` is an explicit
// "no restriction" choice — distinct from a missing param, which means "use the default".
const ALL_VALUE = 'all';
const DEFAULT_STATUS_FILTER = ['draft', 'submitted', 'rejected', 'approved'];
const QC_GROUP_SLUG = 'kalite-kontrol';
const QC_GROUP_ID = 5;

function parseListParam(name) {
    const raw = urlParams.get(name);
    if (raw === null) return null;
    if (raw === ALL_VALUE) return [ALL_VALUE];
    return raw.split(',').filter(Boolean);
}

let statusSelection = parseListParam('status__in') || [...DEFAULT_STATUS_FILTER];
let teamSelection = parseListParam('assigned_team__in'); // null → resolved to the user's groups once the user is known
let currentFilters = {};
['severity', 'defect_type', 'job_order'].forEach(key => {
    if (urlParams.get(key)) currentFilters[key] = urlParams.get(key);
});
let currentSearch = urlParams.get('search') || '';
let currentOrdering = urlParams.get('ordering') || '-created_at';
let ncrs = [];
let totalNCRs = 0;
let isLoading = false;
let allUsers = [];
let currentUser = null;
let ncrAssignableGroups = []; // [{id, name, display_name, ...}]

function isUserInGroup(user, groupName) {
    if (!user || !groupName) return false;
    const groups = Array.isArray(user.groups) ? user.groups : [];
    return groups.some(group => {
        if (typeof group === 'string') return group === groupName;
        if (group && typeof group === 'object') {
            return group.name === groupName || group.slug === groupName;
        }
        return false;
    });
}

/** Normalize assigned team from list/detail payload (supports assigned_team_data). */
function getAssignedTeamFromRow(row) {
    const data = row?.assigned_team_data;
    return {
        id: data?.id ?? row?.assigned_team_id ?? row?.assigned_team ?? null,
        name: data?.name ?? row?.assigned_team_name ?? '',
        slug: data?.slug ?? row?.assigned_team_slug ?? '',
        groupName: row?.assigned_team_group_name ?? ''
    };
}

function rowHasAssignedTeam(row) {
    const assigned = getAssignedTeamFromRow(row);
    if (assigned.id !== null && assigned.id !== undefined && assigned.id !== '') return true;
    return Boolean(assigned.slug || assigned.name || assigned.groupName);
}

function getUserTeamMemberships(user) {
    const memberships = [];
    const addAll = (list) => {
        if (!Array.isArray(list)) return;
        list.forEach(item => {
            if (item === null || item === undefined || item === '') return;
            memberships.push(item);
        });
    };
    // Django permission groups (e.g. qualitycontrol_team)
    addAll(user?.groups);
    // Organization group slugs from /users/me/ (e.g. "imalat")
    addAll(user?.user_groups);
    // Organization group PKs from /users/me/ (e.g. [3, 7])
    addAll(user?.user_group_ids);
    return memberships;
}

function membershipMatchesAssigned(membership, assigned) {
    if (!membership || !assigned) return false;

    const labels = [assigned.slug, assigned.name, assigned.groupName].filter(Boolean);
    const id = assigned.id;

    if (typeof membership === 'string' || typeof membership === 'number') {
        const token = String(membership);
        if (id !== null && id !== undefined && token === String(id)) return true;
        return labels.some(label => token === String(label));
    }

    if (typeof membership === 'object') {
        const mId = membership.id;
        const mName = membership.name;
        const mSlug = membership.slug;

        if (id !== null && id !== undefined && mId !== null && mId !== undefined && String(mId) === String(id)) {
            return true;
        }

        return labels.some(label =>
            mName === label || mSlug === label
        );
    }

    return false;
}

function isUserInAssignedTeam(user, row) {
    if (!user || !row) return false;

    const isSuperuser = user.is_superuser || user.is_admin;
    if (isSuperuser) return true;

    if (!rowHasAssignedTeam(row)) return false;

    const memberships = getUserTeamMemberships(user);
    if (!memberships.length) return false;

    const assigned = getAssignedTeamFromRow(row);
    return memberships.some(membership => membershipMatchesAssigned(membership, assigned));
}

function canCurrentUserDecideNCRs() {
    const user = currentUser || null;
    if (!user) return false;
    if (user.is_superuser === true || user.is_admin === true) return true;

    const groupNames = Array.isArray(user.user_groups) ? user.user_groups : [];
    const groupIds = Array.isArray(user.user_group_ids) ? user.user_group_ids : [];

    const hasName = groupNames.some((g) => String(g || '').toLowerCase() === 'kalite-kontrol');
    const hasId = groupIds.some((id) => Number(id) === 5);
    return hasName || hasId;
}

/** Real Kalite Kontrol membership — unlike canCurrentUserDecideNCRs, superusers don't count. */
function isQcMember(user) {
    if (!user) return false;
    const slugs = Array.isArray(user.user_groups) ? user.user_groups : [];
    const ids = Array.isArray(user.user_group_ids) ? user.user_group_ids : [];
    return slugs.some(s => String(s || '').toLowerCase() === QC_GROUP_SLUG)
        || ids.some(id => Number(id) === QC_GROUP_ID);
}

/**
 * Groups the list is narrowed to when the URL doesn't say otherwise. QC members
 * and superusers oversee every group's NCRs, so they start unfiltered.
 */
function getDefaultTeamSelection(user) {
    if (!user || user.is_superuser || user.is_admin || isQcMember(user)) return [ALL_VALUE];
    const ids = Array.isArray(user.user_group_ids) ? user.user_group_ids : [];
    const known = ids.map(String).filter(id => (ncrAssignableGroups || []).some(g => String(g.id) === id));
    return known.length ? known : [ALL_VALUE];
}

/** Is the given assigned team one of the user's own groups? (no superuser shortcut) */
function isOwnTeam(user, row) {
    if (!user || !rowHasAssignedTeam(row)) return false;
    const assigned = getAssignedTeamFromRow(row);
    return getUserTeamMemberships(user).some(m => membershipMatchesAssigned(m, assigned));
}

/**
 * Who has to move the NCR forward, and what they have to do.
 *   draft     → assigned group fills root cause / corrective action and submits
 *   rejected  → assigned group revises and resubmits
 *   submitted → Kalite Kontrol approves or rejects
 *   approved  → Kalite Kontrol verifies the fix and closes
 *   closed    → nobody
 */
function getNextAction(row) {
    const status = (row?.status || '').toLowerCase();
    const assigned = getAssignedTeamFromRow(row);
    const matchedGroup = (ncrAssignableGroups || []).find(g => String(g.id) === String(assigned.id));
    const teamName = assigned.name || matchedGroup?.display_name || matchedGroup?.name || '';

    switch (status) {
        case 'draft':
            return {
                actor: teamName || 'Grup atanmamış', actorMissing: !teamName,
                task: 'Kök neden ve düzeltici faaliyeti girip göndermeli',
                badgeClass: 'status-orange', icon: 'fa-pen',
                isMine: isOwnTeam(currentUser, row)
            };
        case 'rejected':
            return {
                actor: teamName || 'Grup atanmamış', actorMissing: !teamName,
                task: 'KK reddetti — düzeltip yeniden göndermeli',
                badgeClass: 'status-red', icon: 'fa-rotate-left',
                isMine: isOwnTeam(currentUser, row)
            };
        case 'submitted':
            return {
                actor: 'Kalite Kontrol',
                task: 'İnceleyip onaylamalı veya reddetmeli',
                badgeClass: 'status-blue', icon: 'fa-gavel',
                isMine: isQcMember(currentUser)
            };
        case 'approved':
            return {
                actor: 'Kalite Kontrol',
                task: 'Onaylandı — doğrulayıp kapatmalı',
                badgeClass: 'status-purple', icon: 'fa-lock',
                isMine: isQcMember(currentUser)
            };
        case 'closed':
            return { actor: null, task: 'Kapatıldı', badgeClass: 'status-green', icon: 'fa-check', isMine: false };
        default:
            return { actor: null, task: row?.status_display || status || '-', badgeClass: 'status-grey', icon: 'fa-circle', isMine: false };
    }
}

function isSubmittedNCR(ncr) {
    return (ncr?.status || '').toLowerCase() === 'submitted';
}

function isDraftNCR(ncr) {
    return (ncr?.status || '').toLowerCase() === 'draft';
}

function isRejectedNCR(ncr) {
    return (ncr?.status || '').toLowerCase() === 'rejected';
}

function isSubmittableNCR(ncr) {
    return isDraftNCR(ncr) || isRejectedNCR(ncr);
}

/** Draft or rejected NCRs may be submitted by members of the NCR's assigned team (or superuser). */
function canUserSubmitNCR(user, ncr) {
    return isSubmittableNCR(ncr) && isUserInAssignedTeam(user, ncr);
}

function isClosableNCR(ncr) {
    return (ncr?.status || '').toLowerCase() === 'approved';
}

// Component instances
let ncrsFilters = null;
let ncrsTable = null;
let confirmationModal = null;
let ncrDetailsModal = null;
let ncrEditModal = null;
let ncrCreateModal = null;
let ncrDecisionModal = null;
let ncrSubmitModal = null;
let ncrFileUploadModal = null;

const ncrFileViewer = new FileViewer();
let ncrFilesComponent = null;

function getFileExtension(fileName) {
    if (!fileName) return '';
    const name = String(fileName);
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex <= 0 || lastDotIndex === name.length - 1) return '';
    return name.slice(lastDotIndex + 1).toLowerCase();
}

function sanitizeZipPathSegment(value, fallback = 'Dosyalar') {
    const raw = String(value || '').trim();
    const cleaned = raw
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/^\.+/, '')
        .replace(/[. ]+$/, '')
        .trim();
    return cleaned || fallback;
}

function extractFileNameFromUrl(fileUrl) {
    if (!fileUrl) return '';
    try {
        const url = new URL(fileUrl, window.location.origin);
        const path = decodeURIComponent(url.pathname || '');
        const parts = path.split('/').filter(Boolean);
        return parts.length ? parts[parts.length - 1] : '';
    } catch (_) {
        return '';
    }
}

function inferExtensionFromContentType(contentType = '') {
    const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
    const map = {
        'application/pdf': 'pdf',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'text/plain': 'txt',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/msword': 'doc'
    };
    return map[normalized] || '';
}

function buildUniqueFileName(baseName, usedNames) {
    const safeBaseName = sanitizeZipPathSegment(baseName, 'dosya');
    if (!usedNames.has(safeBaseName)) {
        usedNames.add(safeBaseName);
        return safeBaseName;
    }
    const extension = getFileExtension(safeBaseName);
    const stem = extension ? safeBaseName.slice(0, -(extension.length + 1)) : safeBaseName;
    let counter = 2;
    let candidate = '';
    do {
        candidate = extension ? `${stem} (${counter}).${extension}` : `${stem} (${counter})`;
        counter += 1;
    } while (usedNames.has(candidate));
    usedNames.add(candidate);
    return candidate;
}

function normalizeNcrFile(file) {
    // Backend spec says serializer includes `url` (presigned). Some backends may return `file_url`.
    const fileUrl = file?.url || file?.file_url || file?.file || '';
    const rawName = file?.name || file?.filename || file?.original_name || 'Dosya';
    // The name may be a free-text title typed on upload, with no extension, so fall back
    // to the stored file's extension — the viewer needs it to pick a preview mode.
    const extension = String(file?.extension || '').replace(/^\./, '').toLowerCase()
        || getFileExtension(rawName)
        || getFileExtension(extractFileNameFromUrl(fileUrl));
    const fileName = (extension && !rawName.toLowerCase().endsWith(`.${extension}`))
        ? `${rawName}.${extension}`
        : rawName;
    return {
        ...file,
        file_url: fileUrl,
        filename: fileName,
        file_extension: extension,
        uploaded_at: file?.uploaded_at || file?.created_at || null
    };
}

// Status badge mapping
const STATUS_BADGE_MAP = {
    'draft': { class: 'status-orange', label: 'Taslak' },
    'submitted': { class: 'status-blue', label: 'Gönderildi' },
    'approved': { class: 'status-purple', label: 'Onaylandı' },
    'rejected': { class: 'status-red', label: 'Reddedildi' },
    'closed': { class: 'status-green', label: 'Kapatıldı' }
};

const SEVERITY_BADGE_MAP = {
    // icon/color: the list shows severity as a symbol only (shape differs, not just color)
    'minor': { class: 'status-blue', label: 'Minör', icon: 'fa-circle-info', color: '#1e40af' },
    'major': { class: 'status-orange', label: 'Majör', icon: 'fa-triangle-exclamation', color: '#ea580c' },
    'critical': { class: 'status-red', label: 'Kritik', icon: 'fa-circle-exclamation', color: '#dc2626' }
};

function resolveQcReviewId(qcReview) {
    if (qcReview == null || qcReview === '') return null;
    if (typeof qcReview === 'object') {
        const id = qcReview.id ?? qcReview.pk ?? qcReview.review_id;
        return id != null && id !== '' ? id : null;
    }
    return qcReview;
}

function formatQcReviewLink(qcReview) {
    const reviewId = resolveQcReviewId(qcReview);
    if (!reviewId) return '-';
    const reviewUrl = `/quality-control/qc-reviews/?review=${reviewId}`;
    return `<a href="${reviewUrl}" target="_blank" class="text-decoration-none">
        <span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 0.9rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2); white-space: nowrap; display: inline-block;">
            <i class="fas fa-search me-1"></i>#${reviewId}
        </span>
    </a>`;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    currentUser = await getUser();
    await Promise.all([loadUsers(), loadNcrAssignableGroups(), loadJobOrderFilterOptions()]);
    if (!teamSelection) teamSelection = getDefaultTeamSelection(currentUser);
    await initializeComponents();
    await loadNCRs();
    
    // Check if there's an NCR number in the URL to auto-open the modal
    const ncrNumberParam = urlParams.get('ncr');
    if (ncrNumberParam) {
        // Wait a bit for the table to load, then search for and open the NCR
        setTimeout(async () => {
            try {
                // Search for NCR by number
                const response = await listNCRs({}, ncrNumberParam, '-created_at', 1, 1);
                if (response.results && response.results.length > 0) {
                    // Find exact match by ncr_number
                    const ncr = response.results.find(n => n.ncr_number === ncrNumberParam);
                    if (ncr) {
                        await showNCRDetails(ncr);
                    } else {
                        throw new Error('NCR not found');
                    }
                } else {
                    throw new Error('NCR not found');
                }
            } catch (error) {
                console.error('Error loading NCR from URL parameter:', error);
                showNotification('NCR yüklenirken hata oluştu', 'error');
                // Remove invalid NCR number from URL
                const newParams = new URLSearchParams(window.location.search);
                newParams.delete('ncr');
                const newUrl = window.location.pathname + (newParams.toString() ? '?' + newParams.toString() : '');
                window.history.replaceState({}, '', newUrl);
            }
        }, 500);
    }
});

async function loadUsers() {
    try {
        allUsers = await fetchAllUsers();
    } catch (error) {
        console.error('Error loading users:', error);
        allUsers = [];
    }
}

let jobOrderFilterOptions = [];

async function loadJobOrderFilterOptions() {
    try {
        // all=true: NCRs outlive their job orders, so completed jobs must stay filterable.
        const jobOrders = await getJobOrderDropdown(true);
        jobOrderFilterOptions = (Array.isArray(jobOrders) ? jobOrders : []).map(jo => ({
            value: jo.job_no,
            label: `${jo.job_no}${jo.title ? ' - ' + jo.title : ''}`
        }));
    } catch (error) {
        console.error('Error loading job orders:', error);
        jobOrderFilterOptions = [];
    }
}

async function loadNcrAssignableGroups() {
    try {
        const data = await fetchOrganizationUserGroups({ page_size: 1000 });
        const groups = Array.isArray(data) ? data : (data.results || data.data || []);

        // Different backends serialize PK as `id` or `pk` (or occasionally `group_id`).
        // Normalize so the dropdown always has a numeric PK to send.
        ncrAssignableGroups = (groups || [])
            .filter(Boolean)
            .map(g => {
                const pk = g?.id ?? g?.pk ?? g?.group_id;
                return { ...g, id: pk };
            })
            .filter(g => g.id !== undefined && g.id !== null && g.id !== '')
            .slice()
            .sort((a, b) => {
                const an = (a.display_name || a.name || '').toString();
                const bn = (b.display_name || b.name || '').toString();
                return an.localeCompare(bn, 'tr');
            });
    } catch (error) {
        console.error('Error loading assignable groups:', error);
        ncrAssignableGroups = [];
    }
}

function buildAssignedGroupOptions({ includeEmpty = true, includeLegacyValue = null } = {}) {
    const options = [];
    if (includeEmpty) {
        options.push({ value: '', label: 'Seçiniz' });
    }

    const groupOptions = (ncrAssignableGroups || []).map(g => ({
        value: String(g.id),
        label: g.display_name || g.name || `#${g.id}`
    }));

    options.push(...groupOptions);

    // If NCR has an old/unknown assigned_team value, keep it selectable instead of dropping it.
    if (includeLegacyValue !== null && includeLegacyValue !== undefined && includeLegacyValue !== '') {
        const legacy = String(includeLegacyValue);
        const alreadyIncluded = options.some(o => String(o.value) === legacy);
        if (!alreadyIncluded) {
            options.unshift({ value: legacy, label: legacy });
        }
    }

    return options;
}

async function initializeComponents() {
    try {
        const canDecideNCRs = canCurrentUserDecideNCRs();

        // Initialize header
        new HeaderComponent({
            title: 'Uygunsuzluk Raporları',
            subtitle: 'NCR\'ları görüntüleyin, oluşturun ve yönetin',
            icon: 'exclamation-triangle',
            showBackButton: 'none',
            showCreateButton: 'block',
            showRefreshButton: 'block',
            onCreateClick: () => showCreateNCRModal(),
            onRefreshClick: async () => {
                currentPage = 1;
                updateUrlParams({ page: 1 });
                await loadNCRs();
            }
        });

        // Initialize filters
        initializeFiltersComponent();

        // Initialize table
        initializeTableComponent(canDecideNCRs);

        // Initialize modals
        initializeModalComponents();
    } catch (error) {
        console.error('Error initializing components:', error);
        showNotification('Bileşenler yüklenirken hata oluştu', 'error');
    }
}

/** Selection → query params. ALL (or nothing ticked) means "don't restrict". */
function buildQueryFilters() {
    const filters = { ...currentFilters };
    const statuses = statusSelection.filter(v => v !== ALL_VALUE);
    if (statuses.length && !statusSelection.includes(ALL_VALUE)) {
        filters.status__in = statuses.join(',');
    }
    const teams = (teamSelection || []).filter(v => v !== ALL_VALUE);
    if (teams.length && !teamSelection.includes(ALL_VALUE)) {
        // A single group uses the plain `exact` lookup, so it works even against a
        // backend that doesn't accept `assigned_team__in` yet.
        if (teams.length === 1) filters.assigned_team = teams[0];
        else filters.assigned_team__in = teams.join(',');
    }
    return filters;
}

function selectionToUrlValue(selection) {
    const values = (selection || []).filter(v => v !== ALL_VALUE);
    return (!values.length || selection.includes(ALL_VALUE)) ? ALL_VALUE : values.join(',');
}

/**
 * Keeps an "all" option mutually exclusive with the concrete options of a
 * multi-select: ticking "all" clears the rest, ticking anything else clears "all".
 */
function createAllOptionGuard(initial) {
    let last = [...initial];
    return (dropdown, value) => {
        const next = Array.isArray(value) ? [...value] : [];
        let result = next;
        if (next.includes(ALL_VALUE) && !last.includes(ALL_VALUE)) {
            result = [ALL_VALUE];
        } else if (next.includes(ALL_VALUE) && next.length > 1) {
            result = next.filter(v => v !== ALL_VALUE);
        }
        if (result.length !== next.length) dropdown?.setValue(result);
        last = [...result];
        return result;
    };
}

function initializeFiltersComponent() {
    const guards = {
        'status-filter': createAllOptionGuard(statusSelection),
        'assigned-team-filter': createAllOptionGuard(teamSelection || [ALL_VALUE])
    };

    ncrsFilters = new FiltersComponent('filters-placeholder', {
        title: 'NCR Filtreleri',
        onFilterChange: (filterId, value) => {
            const guard = guards[filterId];
            if (guard) guard(ncrsFilters.dropdowns.get(filterId), value);
        },
        onApply: async (values) => {
            const asList = (v) => (Array.isArray(v) ? v : [v]).filter(Boolean);
            const statuses = asList(values['status-filter']);
            const teams = asList(values['assigned-team-filter']);
            statusSelection = statuses.length ? statuses : [ALL_VALUE];
            teamSelection = teams.length ? teams : [ALL_VALUE];

            currentFilters = {};
            if (values['severity-filter']) currentFilters.severity = values['severity-filter'];
            if (values['defect-type-filter']) currentFilters.defect_type = values['defect-type-filter'];
            if (values['job-order-filter']) currentFilters.job_order = values['job-order-filter'];
            currentSearch = values['search-filter'] || '';

            currentPage = 1;
            updateUrlParams({
                page: 1,
                status__in: selectionToUrlValue(statusSelection),
                assigned_team__in: selectionToUrlValue(teamSelection),
                severity: currentFilters.severity || '',
                defect_type: currentFilters.defect_type || '',
                job_order: currentFilters.job_order || '',
                search: currentSearch
            });
            await loadNCRs();
        },
        onClear: async () => {
            // "Temizle" goes back to the defaults, not to an unfiltered list.
            statusSelection = [...DEFAULT_STATUS_FILTER];
            teamSelection = getDefaultTeamSelection(currentUser);
            currentFilters = {};
            currentSearch = '';
            currentPage = 1;
            ncrsFilters.dropdowns.get('status-filter')?.setValue([...statusSelection]);
            ncrsFilters.dropdowns.get('assigned-team-filter')?.setValue([...teamSelection]);
            guards['status-filter'](null, statusSelection);
            guards['assigned-team-filter'](null, teamSelection);
            updateUrlParams({
                page: 1,
                status__in: null, assigned_team__in: null,
                severity: null, defect_type: null, job_order: null, search: null
            });
            await loadNCRs();
        }
    });

    ncrsFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        multiple: true,
        options: [
            { value: ALL_VALUE, label: 'Tüm Durumlar' },
            ...NCR_STATUS_CHOICES.map(s => ({ value: s.value, label: s.label }))
        ],
        placeholder: 'Tüm Durumlar',
        value: [...statusSelection],
        colSize: 2
    });

    ncrsFilters.addDropdownFilter({
        id: 'assigned-team-filter',
        label: 'Atanan Grup',
        multiple: true,
        options: [
            { value: ALL_VALUE, label: 'Tüm Gruplar' },
            ...buildAssignedGroupOptions({ includeEmpty: false })
        ],
        placeholder: 'Tüm Gruplar',
        value: [...(teamSelection || [ALL_VALUE])],
        colSize: 2
    });

    ncrsFilters.addDropdownFilter({
        id: 'job-order-filter',
        label: 'İş Emri',
        options: [{ value: '', label: 'Tümü' }, ...jobOrderFilterOptions],
        placeholder: 'İş emri seçin',
        value: currentFilters.job_order || '',
        colSize: 2
    });

    ncrsFilters.addDropdownFilter({
        id: 'severity-filter',
        label: 'Önem Derecesi',
        options: [
            { value: '', label: 'Tümü' },
            ...SEVERITY_CHOICES.map(s => ({ value: s.value, label: s.label }))
        ],
        placeholder: 'Önem derecesi seçin',
        value: currentFilters.severity || '',
        colSize: 2
    });

    ncrsFilters.addDropdownFilter({
        id: 'defect-type-filter',
        label: 'Kusur Tipi',
        options: [
            { value: '', label: 'Tümü' },
            ...DEFECT_TYPE_CHOICES.map(d => ({ value: d.value, label: d.label }))
        ],
        placeholder: 'Kusur tipi seçin',
        value: currentFilters.defect_type || '',
        colSize: 2
    });

    ncrsFilters.addTextFilter({
        id: 'search-filter',
        label: 'Arama',
        placeholder: 'NCR no, başlık, açıklama...',
        value: currentSearch,
        colSize: 2
    });
}

function initializeTableComponent(canDecideNCRs) {
    const columns = [
        {
            field: 'ncr_number',
            label: 'NCR No',
            sortable: true,
            width: '90px',
            formatter: (value) => {
                if (!value) return '-';
                // NCR-2026-0001 → 2026-0001: the column header already says "NCR"
                const shortNo = String(value).replace(/^NCR-/i, '');
                return `<span title="${value}" style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 0.8rem; background: rgba(13, 110, 253, 0.08); padding: 0.15rem 0.35rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2); white-space: nowrap; display: inline-block;">${shortNo}</span>`;
            }
        },
        {
            field: 'job_order',
            label: 'İş Emri',
            sortable: true,
            width: '110px',
            formatter: (value, row) => {
                if (!value) return '-';
                const tooltip = row.job_order_title ? ` title="${String(row.job_order_title).replace(/"/g, '&quot;')}"` : '';
                return `<span${tooltip} style="font-weight: 600; color: #495057; font-family: 'Courier New', monospace; font-size: 0.85rem; background: rgba(108, 117, 125, 0.1); padding: 0.15rem 0.4rem; border-radius: 4px; border: 1px solid rgba(108, 117, 125, 0.2); white-space: nowrap; display: inline-block;">${value}</span>`;
            }
        },
        {
            field: 'title',
            label: 'Başlık',
            sortable: true,
            width: '180px',
            formatter: (value) => {
                if (!value) return '-';
                // Enhanced title display with better typography - compact sizing
                return `
                    <div style="
                        color: #212529;
                        font-weight: 600;
                        font-size: 0.95rem;
                        line-height: 1.5;
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                    ">${value}</div>
                `;
            }
        },
        {
            field: 'status',
            label: 'Bekleyen Aksiyon',
            sortable: true,
            width: '210px',
            formatter: (value, row) => {
                const next = getNextAction(row);
                const statusLabel = STATUS_BADGE_MAP[value]?.label || row.status_display || value || '-';
                const head = next.actor
                    ? `<span class="status-badge ${next.badgeClass}" title="Durum: ${statusLabel}"><i class="fas ${next.icon} me-1"></i>${next.actor}</span>`
                    : `<span class="status-badge ${next.badgeClass}"><i class="fas ${next.icon} me-1"></i>${next.task}</span>`;
                const mine = next.isMine
                    ? `<span class="status-badge status-red ms-1" title="Sıradaki adım sizin grubunuzda">Sizde</span>`
                    : '';
                const task = next.actor
                    ? `<div class="${next.actorMissing ? 'text-danger' : 'text-muted'}" style="font-size: 0.78rem; line-height: 1.3; margin-top: 0.2rem;">${next.task}</div>`
                    : '';
                return `<div style="white-space: nowrap;">${head}${mine}</div>${task}`;
            }
        },
        {
            field: 'qc_review',
            label: 'KK İnceleme',
            sortable: false,
            width: '90px',
            formatter: (value) => formatQcReviewLink(value)
        },
        {
            field: 'severity',
            label: 'Önem',
            sortable: true,
            width: '60px',
            formatter: (value, row) => {
                const severity = SEVERITY_BADGE_MAP[value];
                if (!severity) return row.severity_display || value || '-';
                return `<span title="${severity.label}" aria-label="${severity.label}" style="display: inline-block; width: 100%; text-align: center; color: ${severity.color}; font-size: 1.05rem;"><i class="fas ${severity.icon}"></i></span>`;
            }
        },
        {
            field: 'defect_type_display',
            label: 'Kusur Tipi',
            sortable: false,
            width: '95px',
            formatter: (value) => {
                if (!value) return '-';
                return `<span class="status-badge status-grey">${value}</span>`;
            }
        },
        {
            field: 'submission_count',
            label: 'Gönd.',
            sortable: true,
            width: '65px',
            formatter: (value) => {
                // Plain number: the house badge's 80px min-width would double this column
                const count = parseInt(value) || 0;
                return `<span title="Gönderim sayısı" style="display: inline-block; width: 100%; text-align: center; font-weight: 600; color: ${count > 1 ? '#9a3412' : '#495057'};">${count}</span>`;
            }
        },
        {
            field: 'assigned_team_name',
            label: 'Atanan Grup',
            sortable: false,
            width: '100px',
            formatter: (value, row) => {
                const assigned = getAssignedTeamFromRow(row);
                const matchedGroup = (ncrAssignableGroups || []).find(g => String(g.id) === String(assigned.id));
                const displayValue = value || assigned.name || matchedGroup?.display_name || matchedGroup?.name || assigned.id;
                if (!displayValue || displayValue === '-') return '-';
                return `<span class="status-badge status-grey">${displayValue}</span>`;
            }
        },
        {
            field: 'created_at',
            label: 'Tarih',
            sortable: true,
            type: 'date',
            width: '85px',
            formatter: (value) => {
                if (!value) return '-';
                const date = new Date(value);
                const formattedDate = date.toLocaleDateString('tr-TR', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
                return `<span class="text-dark" style="font-size: 0.875rem; font-weight: 500;">${formattedDate}</span>`;
            }
        }
    ];

    const actions = [
        {
            key: 'view',
            label: 'Detaylar',
            icon: 'fas fa-eye',
            class: 'btn-outline-info',
            onClick: (row) => showNCRDetails(row)
        },
        {
            key: 'edit',
            label: 'Düzenle',
            icon: 'fas fa-edit',
            class: 'btn-outline-primary',
            visible: () => canDecideNCRs,
            onClick: (row) => showEditNCRModal(row)
        },
        {
            key: 'submit',
            label: 'Gönder',
            icon: 'fas fa-paper-plane',
            class: 'btn-outline-success',
            visible: (row) => canUserSubmitNCR(currentUser, row),
            onClick: (row) => handleSubmitNCR(row)
        }
    ];

    // Add QC team or superuser actions (approve/reject)
    if (canDecideNCRs) {
        actions.push(
            {
                key: 'approve',
                label: 'Onayla',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                visible: (row) => isSubmittedNCR(row),
                onClick: (row) => showNCRDecisionModal(row, true)
            },
            {
                key: 'reject',
                label: 'Reddet',
                icon: 'fas fa-times',
                class: 'btn-outline-danger',
                visible: (row) => isSubmittedNCR(row),
                onClick: (row) => showNCRDecisionModal(row, false)
            }
        );
    }

    // Close action: Available to QC team/superusers OR the assigned team
    actions.push({
        key: 'close',
        label: 'Kapat',
        icon: 'fas fa-lock',
        class: 'btn-outline-secondary',
        visible: (row) => isClosableNCR(row),
        onClick: (row) => handleCloseNCR(row)
    });

    ncrsTable = new TableComponent('ncrs-table-container', {
        title: 'Uygunsuzluk Raporları',
        columns: columns,
        data: ncrs,
        actions: actions,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: currentPageSize,
        currentPage: currentPage,
        totalItems: totalNCRs,
        sortable: true,
        onSort: async (field, direction) => {
            currentOrdering = direction === 'asc' ? field : `-${field}`;
            currentPage = 1;
            updateUrlParams({ page: 1, ordering: currentOrdering });
            await loadNCRs();
        },
        onPageChange: async (page) => {
            currentPage = page;
            updateUrlParams({ page });
            await loadNCRs();
        },
        onPageSizeChange: async (newPageSize) => {
            currentPageSize = newPageSize;
            currentPage = 1;
            updateUrlParams({ page: 1, page_size: newPageSize });
            await loadNCRs();
        },
        refreshable: true,
        onRefresh: async () => {
            await loadNCRs();
        },
        exportable: false
    });
}

function initializeModalComponents() {
    confirmationModal = new ConfirmationModal('confirmation-modal-container');
    ncrDetailsModal = new DisplayModal('ncr-details-modal-container', {
        fullscreen: true
    });
    ncrEditModal = new EditModal('ncr-edit-modal-container', {
        title: 'NCR Düzenle',
        icon: 'fas fa-edit',
        saveButtonText: 'Kaydet',
        size: 'xl'
    });
    ncrCreateModal = new EditModal('ncr-create-modal-container', {
        title: 'Yeni NCR Oluştur',
        icon: 'fas fa-plus-circle',
        saveButtonText: 'Oluştur',
        size: 'xl'
    });
    ncrDecisionModal = new EditModal('ncr-decision-modal-container', {
        title: 'NCR Kararı',
        icon: 'fas fa-gavel',
        saveButtonText: 'Karar Ver',
        size: 'lg'
    });
    ncrSubmitModal = new EditModal('ncr-submit-modal-container', {
        title: 'NCR Gönder',
        icon: 'fas fa-paper-plane',
        saveButtonText: 'Onaya Gönder',
        saveButtonIcon: 'fas fa-paper-plane',
        size: 'lg'
    });
    ncrFileUploadModal = new EditModal('ncr-file-upload-modal-container', {
        title: 'Dosya Yükle',
        icon: 'fas fa-upload',
        saveButtonText: 'Yükle',
        size: 'md'
    });
}

async function loadNCRs() {
    if (isLoading) return;
    isLoading = true;

    try {
        ncrsTable?.setLoading(true);
        
        const response = await listNCRs(
            buildQueryFilters(),
            currentSearch,
            currentOrdering,
            currentPage,
            currentPageSize
        );

        ncrs = response.results;
        totalNCRs = response.count;

        ncrsTable?.updateData(ncrs, totalNCRs);
        ncrsTable?.setLoading(false);
    } catch (error) {
        console.error('Error loading NCRs:', error);
        showNotification('NCR\'lar yüklenirken hata oluştu', 'error');
        ncrsTable?.setLoading(false);
    } finally {
        isLoading = false;
    }
}

// Utility function to download all files as zip
async function downloadAllFilesAsZip(files, ncrNumberValue = 'NCR') {
    if (!window.JSZip) {
        showNotification('JSZip kütüphanesi yüklenemedi', 'error');
        return;
    }
    
    if (!files || files.length === 0) {
        showNotification('İndirilecek dosya yok', 'warning');
        return;
    }
    
    try {
        showNotification('Dosyalar indiriliyor...', 'info');
        const zip = new JSZip();
        const ncrNumber = sanitizeZipPathSegment(ncrNumberValue, 'NCR');
        const rootFolder = zip.folder(ncrNumber);
        const usedNames = new Set();
        let addedCount = 0;
        if (!rootFolder) {
            showNotification('Zip klasörü oluşturulamadı', 'error');
            return;
        }
        
        // Fetch and add each file to the zip
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileUrl = file.file_url || file.url || file.file || '';
            const rawName = file.filename || file.file_name || file.original_name || file.name || extractFileNameFromUrl(fileUrl) || `dosya_${i + 1}`;
            
            if (!fileUrl) {
                console.warn(`Skipping file ${rawName}: no URL`);
                continue;
            }
            
            try {
                const response = await fetch(fileUrl);
                if (!response.ok) {
                    console.warn(`Failed to fetch ${rawName}: ${response.status}`);
                    continue;
                }
                const blob = await response.blob();
                const existingExtension = getFileExtension(rawName) || (file.file_extension || '').toLowerCase();
                const guessedExtension = inferExtensionFromContentType(response.headers.get('content-type'));
                const extension = existingExtension || guessedExtension;
                const cleanedName = sanitizeZipPathSegment(rawName, `dosya_${i + 1}`);
                const finalName = cleanedName.includes('.') || !extension
                    ? cleanedName
                    : `${cleanedName}.${extension}`;
                const uniqueName = buildUniqueFileName(finalName, usedNames);
                rootFolder.file(uniqueName, blob);
                addedCount += 1;
            } catch (error) {
                console.error(`Error fetching file ${rawName}:`, error);
            }
        }

        if (addedCount === 0) {
            showNotification('Zip içine eklenecek geçerli dosya bulunamadı', 'warning');
            return;
        }
        
        // Generate zip file
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        // Download the zip
        const url = window.URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${ncrNumber}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        showNotification(`${addedCount} dosya zip olarak indirildi`, 'success');
    } catch (error) {
        console.error('Error creating zip file:', error);
        showNotification('Zip dosyası oluşturulurken hata oluştu', 'error');
    }
}

async function refreshNcrFilesUI(ncrId) {
    const container = document.getElementById('ncr-files-list');
    if (!container) return;

    // Show loading state
    container.innerHTML = `
        <div class="text-center text-muted py-3">
            <i class="fas fa-spinner fa-spin me-2"></i>Dosyalar yükleniyor...
        </div>
    `;

    let files = [];
    try {
        const data = await listNCRFiles(ncrId);
        const rawList = Array.isArray(data) ? data : (data.results || data.files || []);
        files = rawList.map(normalizeNcrFile);
    } catch (e) {
        console.error('Failed to load NCR files:', e);
        container.innerHTML = `<div class="text-danger small py-2">Dosyalar yüklenemedi.</div>`;
        return;
    }

    if (!files.length) {
        container.innerHTML = `<div class="text-muted small py-2">Henüz dosya yok.</div>`;
        return;
    }

    // Initialize FileAttachments component once
    if (!ncrFilesComponent) {
        ncrFilesComponent = new FileAttachments('ncr-files-list', {
            title: 'Dosyalar',
            titleIcon: 'fas fa-paperclip',
            titleIconColor: 'text-muted',
            showTitle: false, // the form's "Ekler" section heading already names the list
            layout: 'list',
            showDeleteButton: true,
            onFileClick: (file) => {
                const name = file.file_name || 'Dosya';
                const ext = getFileExtension(name) || (file.file_extension || '').toLowerCase();
                const url = file.file_url;
                if (!url) {
                    showNotification('Dosya URL bulunamadı', 'warning');
                    return;
                }
                ncrFileViewer.openFile(url, name, ext);
            },
            onDownloadClick: async (fileUrl, fileName) => {
                if (!fileUrl) {
                    showNotification('Dosya URL bulunamadı', 'warning');
                    return;
                }
                try {
                    const response = await fetch(fileUrl);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const blob = await response.blob();
                    const downloadUrl = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = downloadUrl;
                    link.download = fileName || 'Dosya';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(downloadUrl);
                } catch (error) {
                    console.error('Error downloading file:', error);
                    // Fallback: open in new tab
                    const fallbackLink = document.createElement('a');
                    fallbackLink.href = fileUrl;
                    fallbackLink.download = fileName || 'Dosya';
                    fallbackLink.target = '_blank';
                    document.body.appendChild(fallbackLink);
                    fallbackLink.click();
                    document.body.removeChild(fallbackLink);
                }
            },
            onDeleteClick: (file) => {
                const fileId = file.id;
                if (!fileId) {
                    showNotification('Dosya ID bulunamadı', 'warning');
                    return;
                }
                confirmationModal.show({
                    title: 'Dosya Sil',
                    message: 'Bu dosyayı silmek istiyor musunuz?',
                    confirmText: 'Sil',
                    confirmButtonClass: 'btn-danger',
                    onConfirm: async () => {
                        try {
                            await deleteNCRFile(ncrId, fileId);
                            showNotification('Dosya silindi', 'success');
                            await refreshNcrFilesUI(ncrId);
                        } catch (error) {
                            console.error('Error deleting NCR file:', error);
                            showNotification('Dosya silinirken hata oluştu', 'error');
                        }
                    }
                });
            }
        });
    }

    // Map NCR files to FileAttachments format
    const mappedFiles = files.map(f => ({
        id: f.id,
        file_url: f.file_url || f.url || f.file || '',
        file_name: f.filename || f.name || 'Dosya',
        file_extension: f.file_extension || '',
        uploaded_at: f.uploaded_at,
        uploaded_by_username: f.uploaded_by_username || f.uploaded_by_name || ''
    }));

    ncrFilesComponent.setFiles(mappedFiles);
}

function showNcrFileUploadModal(ncrId, onSuccess) {
    if (!ncrFileUploadModal) return;
    ncrFileUploadModal.clearAll();
    ncrFileUploadModal.addSection({ title: 'Dosya Bilgileri', icon: 'fas fa-file', iconColor: 'text-primary' });
    ncrFileUploadModal.addField({ id: 'file_type', name: 'file_type', label: 'Dosya Türü', type: 'dropdown', required: true, options: NCR_FILE_TYPE_OPTIONS, icon: 'fas fa-tag', colSize: 6 });
    ncrFileUploadModal.addField({ id: 'name', name: 'name', label: 'Dosya Adı', type: 'text', placeholder: 'Opsiyonel (tüm dosyalar için)', icon: 'fas fa-heading', colSize: 6 });
    ncrFileUploadModal.addField({ id: 'description', name: 'description', label: 'Açıklama', type: 'textarea', placeholder: 'Opsiyonel (tüm dosyalar için)', icon: 'fas fa-align-left', colSize: 12 });

    ncrFileUploadModal.onSave = async (formData) => {
        const fileInput = document.getElementById('ncr-file-input-field');
        const files = fileInput?.files;
        if (!files || files.length === 0) {
            showNotification('Lütfen en az bir dosya seçin', 'warning');
            return;
        }
        
        ncrFileUploadModal.setLoading(true);
        let successCount = 0;
        let errorCount = 0;
        
        try {
            for (let i = 0; i < files.length; i++) {
                try {
                    await uploadNCRFile(ncrId, files[i], formData.file_type, formData.name, formData.description);
                    successCount++;
                } catch (error) {
                    console.error(`Error uploading file ${files[i].name}:`, error);
                    errorCount++;
                }
            }
            
            ncrFileUploadModal.setLoading(false);
            
            if (successCount > 0 && errorCount === 0) {
                ncrFileUploadModal.hide();
                showNotification(`${successCount} dosya başarıyla yüklendi`, 'success');
                if (onSuccess) await onSuccess();
            } else if (successCount > 0 && errorCount > 0) {
                ncrFileUploadModal.hide();
                showNotification(`${successCount} dosya yüklendi, ${errorCount} dosya yüklenemedi`, 'warning');
                if (onSuccess) await onSuccess();
            } else {
                showNotification('Dosyalar yüklenemedi', 'error');
            }
        } catch (error) {
            ncrFileUploadModal.setLoading(false);
            showNotification('Dosya yükleme sırasında hata oluştu', 'error');
        }
    };

    ncrFileUploadModal.render();
    const body = ncrFileUploadModal.container?.querySelector('.modal-body');
    if (body) {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'mb-3 px-3';
        fileDiv.innerHTML = `
            <label class="form-label">Dosyalar (Birden fazla seçebilirsiniz)</label>
            <input type="file" class="form-control" id="ncr-file-input-field" multiple>
            <small class="form-text text-muted">Birden fazla dosya seçmek için Ctrl (veya Cmd) tuşuna basılı tutarak tıklayın</small>
            <div id="ncr-selected-files-list" class="mt-2"></div>
        `;
        body.insertBefore(fileDiv, body.firstChild);
        
        // Show selected files
        const fileInput = fileDiv.querySelector('#ncr-file-input-field');
        const filesList = fileDiv.querySelector('#ncr-selected-files-list');
        fileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length === 0) {
                filesList.innerHTML = '';
                return;
            }
            const filesHtml = Array.from(files).map((file, index) => `
                <div class="d-flex align-items-center gap-2 p-2 border rounded mb-1">
                    <i class="fas fa-file text-primary"></i>
                    <span class="flex-grow-1">${file.name}</span>
                    <small class="text-muted">${(file.size / 1024).toFixed(1)} KB</small>
                </div>
            `).join('');
            filesList.innerHTML = `<div class="mt-2"><strong>Seçilen dosyalar (${files.length}):</strong>${filesHtml}</div>`;
        });
    }
    ncrFileUploadModal.show();
}

async function showNCRDetails(ncr) {
    try {
        // Get full NCR to ensure we have ncr_number
        const fullNCR = await getNCR(ncr.id);
        
        // Update URL with NCR number (key)
        if (fullNCR.ncr_number) {
            updateUrlParams({ ncr: fullNCR.ncr_number });
        }

        // Clear and prepare the modal
        ncrDetailsModal.clearData();
        ncrDetailsModal.setTitle(fullNCR.ncr_number || `NCR #${fullNCR.id}`);
        ncrDetailsModal.setIcon('fas fa-file-alt');

        const qcReviewId = resolveQcReviewId(fullNCR.qc_review);
        ncrDetailsModal.addCustomSection({
            title: null,
            customContent: renderNcrForm(fullNCR, {
                statusLabel: STATUS_BADGE_MAP[fullNCR.status]?.label || fullNCR.status_display,
                assignedTeamName: getAssignedTeamFromRow(fullNCR).name,
                qcReviewHtml: qcReviewId ? formatQcReviewLink(qcReviewId) : '',
                nextAction: typeof getNextAction === 'function' ? getNextAction(fullNCR) : null
            })
        });

        const canShowDecisionButtons = canCurrentUserDecideNCRs() && isSubmittedNCR(fullNCR);
        const canShowSubmitButton = canUserSubmitNCR(currentUser, fullNCR);
        const canShowEditButton = canCurrentUserDecideNCRs();
        ncrDetailsModal.setFooterContent(`
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">
                <i class="fas fa-times me-1"></i>Kapat
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="ncr-details-print-btn">
                <i class="fas fa-print me-1"></i>Yazdır
            </button>
            ${canShowEditButton ? `
                <button type="button" class="btn btn-sm btn-outline-primary" id="ncr-details-edit-btn">
                    <i class="fas fa-edit me-1"></i>Düzenle
                </button>
            ` : ''}
            ${canShowSubmitButton ? `
                <button type="button" class="btn btn-sm btn-outline-success" id="ncr-details-submit-btn">
                    <i class="fas fa-paper-plane me-1"></i>Onaya Gönder
                </button>
            ` : ''}
            ${canShowDecisionButtons ? `
                <button type="button" class="btn btn-sm btn-outline-danger" id="ncr-details-reject-btn">
                    <i class="fas fa-times me-1"></i>Reddet
                </button>
                <button type="button" class="btn btn-sm btn-outline-success" id="ncr-details-approve-btn">
                    <i class="fas fa-check me-1"></i>Onayla
                </button>
            ` : ''}
        `);

        // Render and show the modal
        const detailsEl = ncrDetailsModal.modal;
        let detailsShown = false;
        detailsEl.addEventListener('shown.bs.modal', () => { detailsShown = true; }, { once: true });
        ncrDetailsModal.render();
        ncrDetailsModal.show();

        // Follow-up modals open in place of the form, not stacked on a now-stale copy of it.
        // Bootstrap ignores hide() while the open animation runs, so a fast click waits for it.
        const openInstead = (action) => () => {
            const swap = () => {
                detailsEl.addEventListener('hidden.bs.modal', () => action(), { once: true });
                ncrDetailsModal.hide();
            };
            if (detailsShown) swap();
            else detailsEl.addEventListener('shown.bs.modal', swap, { once: true });
        };
        document.getElementById('ncr-details-print-btn').onclick = () => printNcrForm();
        if (canShowEditButton) {
            document.getElementById('ncr-details-edit-btn').onclick = openInstead(() => showEditNCRModal(fullNCR, { returnToDetails: true }));
        }
        if (canShowSubmitButton) {
            document.getElementById('ncr-details-submit-btn').onclick = openInstead(() => handleSubmitNCR(fullNCR, { returnToDetails: true }));
        }
        if (canShowDecisionButtons) {
            document.getElementById('ncr-details-approve-btn').onclick = openInstead(() => showNCRDecisionModal(fullNCR, true));
            document.getElementById('ncr-details-reject-btn').onclick = openInstead(() => showNCRDecisionModal(fullNCR, false));
        }

        // Reset files component so it binds to the current modal instance
        ncrFilesComponent = null;

        const uploadBtn = document.getElementById('ncr-files-upload-btn');
        if (uploadBtn) {
            uploadBtn.onclick = (e) => {
                e.preventDefault();
                showNcrFileUploadModal(fullNCR.id, async () => {
                    await refreshNcrFilesUI(fullNCR.id);
                });
            };
        }
        
        const downloadAllBtn = document.getElementById('ncr-files-download-all-btn');
        if (downloadAllBtn) {
            downloadAllBtn.onclick = async (e) => {
                e.preventDefault();
                try {
                    const data = await listNCRFiles(fullNCR.id);
                    const rawList = Array.isArray(data) ? data : (data.results || data.files || []);
                    const files = rawList.map(normalizeNcrFile);
                    if (files.length > 0) {
                        const ncrNumber = fullNCR.ncr_number || fullNCR.id;
                        await downloadAllFilesAsZip(files, ncrNumber);
                    } else {
                        showNotification('İndirilecek dosya yok', 'warning');
                    }
                } catch (error) {
                    console.error('Error loading files for download:', error);
                    showNotification('Dosyalar yüklenirken hata oluştu', 'error');
                }
            };
        }
        
        await refreshNcrFilesUI(fullNCR.id);
    } catch (error) {
        console.error('Error loading NCR details:', error);
        showNotification('NCR detayları yüklenirken hata oluştu', 'error');
    }
}

async function showCreateNCRModal() {
    ncrCreateModal.clearAll();

    // Load job orders for dropdown
    let jobOrderOptions = [{ value: '', label: 'İş emri seçin' }];
    try {
        const jobOrders = await getJobOrderDropdown();
        if (Array.isArray(jobOrders)) {
            jobOrderOptions = [
                { value: '', label: 'İş emri seçin' },
                ...jobOrders.map(jo => ({
                    value: jo.job_no,
                    label: `${jo.job_no}${jo.title ? ' - ' + jo.title : ''}`
                }))
            ];
        }
    } catch (error) {
        console.error('Error loading job orders:', error);
        showNotification('İş emirleri yüklenirken hata oluştu', 'error');
    }

    // Ensure groups are loaded for assigned-group dropdown
    if (!Array.isArray(ncrAssignableGroups) || ncrAssignableGroups.length === 0) {
        await loadNcrAssignableGroups();
    }
    const assignedGroupOptions = buildAssignedGroupOptions({ includeEmpty: true });

    ncrCreateModal
        .addSection({
            title: 'Temel Bilgiler',
            icon: 'fas fa-info-circle',
            fields: [
                {
                    id: 'job_order',
                    name: 'job_order',
                    label: 'İş Emri',
                    type: 'dropdown',
                    required: true,
                    searchable: true,
                    options: jobOrderOptions,
                    placeholder: 'İş emri seçin'
                },
                {
                    id: 'title',
                    name: 'title',
                    label: 'Başlık',
                    type: 'text',
                    required: true,
                    placeholder: 'NCR başlığı'
                },
                {
                    id: 'description',
                    name: 'description',
                    label: 'Açıklama',
                    type: 'textarea',
                    required: true,
                    placeholder: 'Detaylı açıklama'
                }
            ]
        })
        .addSection({
            title: 'Kusur Bilgileri',
            icon: 'fas fa-exclamation-triangle',
            fields: [
                {
                    id: 'defect_type',
                    name: 'defect_type',
                    label: 'Kusur Tipi',
                    type: 'dropdown',
                    required: true,
                    options: DEFECT_TYPE_CHOICES.map(d => ({ value: d.value, label: d.label }))
                },
                {
                    id: 'severity',
                    name: 'severity',
                    label: 'Önem Derecesi',
                    type: 'dropdown',
                    required: true,
                    options: SEVERITY_CHOICES.map(s => ({ value: s.value, label: s.label }))
                },
                {
                    id: 'affected_quantity',
                    name: 'affected_quantity',
                    label: 'Etkilenen Miktar',
                    type: 'number',
                    required: true,
                    placeholder: '0'
                }
            ]
        })
        .addSection({
            title: 'Atama',
            icon: 'fas fa-users',
            fields: [
                {
                    id: 'assigned_team',
                    name: 'assigned_team',
                    label: 'Atanan Grup',
                    type: 'dropdown',
                    required: true,
                    options: assignedGroupOptions,
                    placeholder: 'Grup seçin'
                },
                {
                    id: 'disposition',
                    name: 'disposition',
                    label: 'Karar',
                    type: 'dropdown',
                    required: true,
                    options: [
                        { value: 'pending', label: 'Karar Bekliyor' },
                        ...DISPOSITION_CHOICES.filter(d => d.value !== 'pending').map(d => ({ value: d.value, label: d.label }))
                    ]
                }
            ]
        });

    ncrCreateModal.render();
    ncrCreateModal.onSave = async (formData) => {
        try {
            // Automatically set detected_by to current user
            if (currentUser && currentUser.id) {
                formData.detected_by = currentUser.id;
            }

            // Convert affected_quantity to integer if provided
            if (formData.affected_quantity) {
                formData.affected_quantity = parseInt(formData.affected_quantity);
            }

            const groupPk = parseInt(String(formData.assigned_team), 10);
            if (!Number.isFinite(groupPk)) {
                showNotification('Atanan grup seçilmelidir', 'error');
                return;
            }
            formData.assigned_team = groupPk;

            await createNCR(formData);
            showNotification('NCR başarıyla oluşturuldu', 'success');
            ncrCreateModal.hide();
            await loadNCRs();
        } catch (error) {
            console.error('Error creating NCR:', error);
            showNotification(error.message || 'NCR oluşturulurken hata oluştu', 'error');
        }
    };

    ncrCreateModal.show();
}

/**
 * Show the NCR summary above an EditModal's fields. Inserted into the form itself so
 * EditModal.clearAll() removes it with the fields on the next open.
 */
function insertNcrContext(modal, ncr, options = {}) {
    const context = document.createElement('div');
    context.innerHTML = renderNcrContext(ncr, {
        statusLabel: STATUS_BADGE_MAP[ncr.status]?.label || ncr.status_display,
        ...options
    });
    modal.form.insertBefore(context, modal.form.firstChild);
}

/** Dropdown options for users, keeping already-selected users who are no longer active. */
function buildUserOptions(selected = []) {
    const options = (allUsers || []).map(u => ({
        value: u.id,
        label: u.full_name || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username
    }));
    const known = new Set(options.map(o => o.value));
    selected.forEach(({ id, name }) => {
        if (id != null && !known.has(id)) {
            options.push({ value: id, label: name || `#${id}` });
            known.add(id);
        }
    });
    return options.sort((a, b) => a.label.localeCompare(b.label, 'tr'));
}

/**
 * When an edit/submit modal was opened from the details form, closing it (saved or
 * not) brings the form back, refetched so it shows what was just saved.
 */
function returnToDetailsOnClose(modal, ncr, enabled) {
    modal.onCancel = enabled ? () => {
        modal.onCancel = null;
        showNCRDetails(ncr);
    } : null;
}

async function showEditNCRModal(ncr, { returnToDetails = false } = {}) {
    try {
        if (!canCurrentUserDecideNCRs()) {
            showNotification('Bu işlem için yetkiniz yok. Sadece "kalite-kontrol" grubu veya superuser düzenleyebilir.', 'warning');
            return;
        }
        const fullNCR = await getNCR(ncr.id);

        // Ensure groups are loaded for assigned-group dropdown
        if (!Array.isArray(ncrAssignableGroups) || ncrAssignableGroups.length === 0) {
            await loadNcrAssignableGroups();
        }
        const assignedGroupOptions = buildAssignedGroupOptions({
            includeEmpty: true,
            includeLegacyValue: fullNCR.assigned_team
        });
        const detectedByOptions = buildUserOptions([{ id: fullNCR.detected_by, name: fullNCR.detected_by_name }]);
        const memberOptions = buildUserOptions(fullNCR.assigned_members_data || []);

        ncrEditModal.clearAll();
        ncrEditModal.setTitle(`${fullNCR.ncr_number || `NCR #${fullNCR.id}`} · Düzenle`);

        ncrEditModal
            .addSection({
                title: numberedSectionTitle(1, 'Tanımlama'),
                icon: 'd-none',
                fields: [
                    {
                        id: 'edit-detected-by',
                        name: 'detected_by',
                        label: 'Tespit Eden',
                        type: 'dropdown',
                        searchable: true,
                        required: true,
                        value: fullNCR.detected_by ?? '',
                        options: detectedByOptions,
                        placeholder: 'Kişi seçin',
                        colSize: 4
                    },
                    {
                        id: 'edit-affected-quantity',
                        name: 'affected_quantity',
                        label: 'Etkilenen Miktar (adet)',
                        type: 'number',
                        required: true,
                        min: 1,
                        value: fullNCR.affected_quantity ?? 1,
                        colSize: 3
                    },
                    {
                        id: 'edit-assigned-team',
                        name: 'assigned_team',
                        label: 'Sorumlu Grup',
                        type: 'dropdown',
                        searchable: true,
                        value: fullNCR.assigned_team != null ? String(fullNCR.assigned_team) : '',
                        options: assignedGroupOptions,
                        placeholder: 'Grup seçin',
                        colSize: 5
                    },
                    {
                        id: 'edit-assigned-members',
                        name: 'assigned_members',
                        label: 'Sorumlu Kişiler',
                        type: 'dropdown',
                        multiple: true,
                        searchable: true,
                        value: fullNCR.assigned_members || [],
                        options: memberOptions,
                        placeholder: 'Kişi seçin (isteğe bağlı)',
                        colSize: 12
                    }
                ]
            })
            .addSection({
                title: numberedSectionTitle(2, 'Uygunsuzluk Tanımı'),
                icon: 'd-none',
                fields: [
                    {
                        id: 'edit-title',
                        name: 'title',
                        label: 'Başlık',
                        type: 'text',
                        required: true,
                        value: fullNCR.title || ''
                    },
                    {
                        id: 'edit-description',
                        name: 'description',
                        label: 'Açıklama',
                        type: 'textarea',
                        rows: 5,
                        required: true,
                        value: fullNCR.description || ''
                    },
                    {
                        id: 'edit-defect-type',
                        name: 'defect_type',
                        label: 'Kusur Tipi',
                        type: 'radio',
                        required: true,
                        value: fullNCR.defect_type || '',
                        options: DEFECT_TYPE_CHOICES,
                        colSize: 8
                    },
                    {
                        id: 'edit-severity',
                        name: 'severity',
                        label: 'Önem Derecesi',
                        type: 'radio',
                        required: true,
                        value: fullNCR.severity || '',
                        options: SEVERITY_CHOICES,
                        colSize: 4
                    }
                ]
            })
            .addSection({
                title: numberedSectionTitle('3–5', 'Kök Neden, Düzeltici Faaliyet ve Karar'),
                icon: 'd-none',
                fields: [
                    {
                        id: 'edit-root-cause',
                        name: 'root_cause',
                        label: 'Kök Neden Analizi',
                        type: 'textarea',
                        rows: 4,
                        value: fullNCR.root_cause || '',
                        placeholder: 'Sorumlu grup gönderirken doldurur',
                        colSize: 6
                    },
                    {
                        id: 'edit-corrective-action',
                        name: 'corrective_action',
                        label: 'Düzeltici Faaliyet',
                        type: 'textarea',
                        rows: 4,
                        value: fullNCR.corrective_action || '',
                        placeholder: 'Sorumlu grup gönderirken doldurur',
                        colSize: 6
                    },
                    {
                        id: 'edit-disposition',
                        name: 'disposition',
                        label: 'Karar (Uygunsuz Ürün)',
                        type: 'radio',
                        required: true,
                        value: fullNCR.disposition || 'pending',
                        options: DISPOSITION_CHOICES
                    }
                ]
            });

        ncrEditModal.render();
        insertNcrContext(ncrEditModal, fullNCR, { showDescription: false });

        ncrEditModal.onSave = async (formData) => {
            try {
                const toPk = (value) => {
                    const pk = parseInt(String(value), 10);
                    return Number.isFinite(pk) ? pk : null;
                };
                const payload = {
                    title: String(formData.title || '').trim(),
                    description: String(formData.description || '').trim(),
                    defect_type: formData.defect_type,
                    severity: formData.severity,
                    affected_quantity: parseInt(formData.affected_quantity, 10),
                    root_cause: String(formData.root_cause || '').trim(),
                    corrective_action: String(formData.corrective_action || '').trim(),
                    disposition: formData.disposition,
                    assigned_members: (Array.isArray(formData.assigned_members) ? formData.assigned_members : [])
                        .map(toPk).filter(pk => pk !== null)
                };
                const detectedBy = toPk(formData.detected_by);
                if (detectedBy !== null) payload.detected_by = detectedBy;
                // Send the group PK (not a legacy team name/slug); an empty pick leaves the group as it is.
                const groupPk = toPk(formData.assigned_team);
                if (groupPk !== null) payload.assigned_team = groupPk;

                await updateNCR(fullNCR.id, payload);
                showNotification('NCR başarıyla güncellendi', 'success');
                ncrEditModal.hide();
                await loadNCRs();
            } catch (error) {
                console.error('Error updating NCR:', error);
                showNotification(error.message || 'NCR güncellenirken hata oluştu', 'error');
            }
        };
        returnToDetailsOnClose(ncrEditModal, fullNCR, returnToDetails);

        ncrEditModal.show();
    } catch (error) {
        console.error('Error loading NCR for edit:', error);
        showNotification('NCR yüklenirken hata oluştu', 'error');
    }
}

async function handleSubmitNCR(ncr, { returnToDetails = false } = {}) {
    try {
        const fullNCR = await getNCR(ncr.id);

        if (!isSubmittableNCR(fullNCR)) {
            showNotification('Sadece "Taslak" veya "Reddedildi" durumundaki NCR kayıtları gönderilebilir.', 'warning');
            return;
        }

        if (!isUserInAssignedTeam(currentUser, fullNCR)) {
            showNotification('Bu NCR\'ı göndermek için atanan takıma üye olmanız gerekir.', 'warning');
            return;
        }

        ncrSubmitModal.clearAll();
        ncrSubmitModal.setTitle(`${fullNCR.ncr_number || `NCR #${fullNCR.id}`} · Onaya Gönder`);

        ncrSubmitModal
            .addSection({
                title: numberedSectionTitle(3, 'Kök Neden Analizi'),
                icon: 'd-none',
                fields: [
                    {
                        id: 'submit-root-cause',
                        name: 'root_cause',
                        label: 'Uygunsuzluk neden oluştu?',
                        type: 'textarea',
                        rows: 5,
                        required: true,
                        value: fullNCR.root_cause || '',
                        placeholder: 'Örn. bükme kalıbı ayarı resim değerine göre kontrol edilmeden kullanıldı'
                    }
                ]
            })
            .addSection({
                title: numberedSectionTitle(4, 'Düzeltici Faaliyet'),
                icon: 'd-none',
                fields: [
                    {
                        id: 'submit-corrective-action',
                        name: 'corrective_action',
                        label: 'Tekrarlanmaması için ne yapıldı / yapılacak?',
                        type: 'textarea',
                        rows: 5,
                        required: true,
                        value: fullNCR.corrective_action || '',
                        placeholder: 'Yapılan / yapılacak işlem, sorumlusu ve tarihi',
                        help: 'Kalite Kontrol bu bilgiye göre onaylar veya reddeder.'
                    }
                ]
            })
            .addSection({
                title: numberedSectionTitle(5, 'Karar (Uygunsuz Ürün)'),
                icon: 'd-none',
                fields: [
                    {
                        id: 'submit-disposition',
                        name: 'disposition',
                        label: 'Etkilenen ürün için önerilen karar',
                        type: 'radio',
                        required: true,
                        value: fullNCR.disposition || 'pending',
                        options: DISPOSITION_CHOICES
                    }
                ]
            });

        ncrSubmitModal.render();
        insertNcrContext(ncrSubmitModal, fullNCR);

        ncrSubmitModal.onSave = async (formData) => {
            try {
                const rootCause = String(formData.root_cause || '').trim();
                const correctiveAction = String(formData.corrective_action || '').trim();
                const disposition = String(formData.disposition || '').trim();

                if (!rootCause || !correctiveAction || !disposition) {
                    throw new Error('Kök neden, düzeltici faaliyet ve karar alanları zorunludur');
                }

                const submitData = {
                    root_cause: rootCause,
                    corrective_action: correctiveAction,
                    disposition: disposition
                };

                await submitNCR(fullNCR.id, submitData);
                showNotification('NCR başarıyla gönderildi', 'success');
                ncrSubmitModal.hide();
                await loadNCRs();
            } catch (error) {
                console.error('Error submitting NCR:', error);
                showNotification(error.message || 'NCR gönderilirken hata oluştu', 'error');
            }
        };
        returnToDetailsOnClose(ncrSubmitModal, fullNCR, returnToDetails);

        ncrSubmitModal.show();
    } catch (error) {
        console.error('Error loading NCR for submit:', error);
        showNotification('NCR yüklenirken hata oluştu', 'error');
    }
}

function showNCRDecisionModal(ncr, approve) {
    if (!canCurrentUserDecideNCRs()) {
        showNotification('Bu işlem için yetkiniz yok. Sadece "kalite-kontrol" grubu veya superuser karar verebilir.', 'warning');
        return;
    }
    if (!isSubmittedNCR(ncr)) {
        showNotification('Sadece "Gönderildi" durumundaki NCR kayıtları için onay/red verilebilir.', 'warning');
        return;
    }
    ncrDecisionModal.clearAll();

    ncrDecisionModal
        .addSection({
            title: approve ? 'Onaylama' : 'Reddetme',
            icon: approve ? 'fas fa-check-circle' : 'fas fa-times-circle',
            fields: [
                {
                    name: 'comment',
                    label: 'Yorum',
                    type: 'textarea',
                    required: !approve,
                    placeholder: approve
                        ? 'Onay yorumu (isteğe bağlı)'
                        : 'Red nedeni (zorunlu)',
                    value: ''
                }
            ]
        });

    ncrDecisionModal.render();
    ncrDecisionModal.onSave = async (formData) => {
        try {
            await decideNCR(ncr.id, approve, formData.comment || '');
            showNotification(
                approve ? 'NCR onaylandı' : 'NCR reddedildi',
                'success'
            );
            ncrDecisionModal.hide();
            await loadNCRs();
        } catch (error) {
            console.error('Error deciding NCR:', error);
            showNotification(
                error.message || 'Karar verilirken hata oluştu',
                'error'
            );
        }
    };

    ncrDecisionModal.show();
}

async function handleCloseNCR(ncr) {
    if (!isClosableNCR(ncr)) {
        showNotification('Sadece "Onaylandı" durumundaki NCR kayıtları kapatılabilir.', 'warning');
        return;
    }
    confirmationModal.show({
        title: 'NCR Kapat',
        message: `"${ncr.ncr_number || ncr.title}" NCR'sını kapatmak istediğinizden emin misiniz?`,
        confirmText: 'Kapat',
        cancelText: 'İptal',
        onConfirm: async () => {
            try {
                await closeNCR(ncr.id);
                showNotification('NCR başarıyla kapatıldı', 'success');
                await loadNCRs();
            } catch (error) {
                console.error('Error closing NCR:', error);
                showNotification(error.message || 'NCR kapatılırken hata oluştu', 'error');
            }
        }
    });
}

function updateUrlParams(params) {
    const newParams = new URLSearchParams(window.location.search);
    Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
            if (Array.isArray(params[key])) {
                newParams.delete(key);
                params[key].forEach(val => newParams.append(key, val));
            } else {
                newParams.set(key, params[key]);
            }
        } else {
            newParams.delete(key);
        }
    });
    window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
}
