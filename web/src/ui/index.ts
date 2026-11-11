// Shared React replacements for the legacy components/ folder.

export { DataTable } from './DataTable/DataTable';
export { toOrdering, fromOrdering, nextSort, compareValues } from './DataTable/sorting';
export type {
  CellEdit,
  CellEditorType,
  CellValue,
  ClientPagination,
  ColumnEditor,
  DataTableColumn,
  DataTableGrouping,
  DataTableReorder,
  EditOption,
  GroupCells,
  GroupKey,
  RowGroup,
  RowMove,
  DataTableExport,
  DataTableFooterContext,
  DataTableProps,
  DataTableSelection,
  RowAction,
  ServerPagination,
  ServerSort,
  SortDir,
} from './DataTable/types';

export { PageHeader, type PageFigure, type PageHeaderProps } from './PageHeader';
export { Panel, type PanelProps } from './Panel';
export { CountBadge, badgeText, type CountBadgeProps } from './CountBadge';
export { StatusBadge, type StatusBadgeProps, type StatusFamily } from './StatusBadge';

export { FilterBar, type FilterBarProps, type FilterConfig, type FilterOption } from './FilterBar/FilterBar';
export {
  useUrlFilters,
  isDateRange,
  type DateRange,
  type FilterValue,
  type FilterValues,
  type UrlFilters,
  type WidenFilters,
} from './FilterBar/useUrlFilters';

export { StatCards, type StatCard, type StatCardsProps } from './StatCards';
export { MenuCards, PendingValue, visibleMenuCards, type MenuCard, type MenuCardsProps, type MenuFeature } from './MenuCards';
export {
  DetailModal,
  type DetailField,
  type DetailFieldType,
  type DetailModalProps,
  type DetailSection,
} from './DetailModal';
export { FormModal, type FormModalProps } from './FormModal';
export {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalSection,
  modalClassNames,
  type ModalHeaderProps,
  type ModalSectionProps,
  type ModalTone,
} from './ModalParts';
export { confirm, type ConfirmOptions } from './confirm';
export { notify, errorMessage, type NotifyOptions, type NotifyType } from './notify';
export { SelectRemote, type RemoteOption, type SelectRemoteProps } from './SelectRemote';
export {
  PaperBackdrop,
  PaperBlock,
  PaperCell,
  PaperChecks,
  PaperForm,
  PaperGrid,
  PaperNarrative,
  PaperPrintCopy,
  PaperSection,
  PaperSectionNumber,
  PaperSignature,
  PaperSignatures,
  PaperSignComment,
  PaperSubhead,
  PaperTable,
  PaperTextCell,
  PaperTimeline,
  paperClasses,
  usePaperPrint,
  type PaperChoice,
  type PaperFormProps,
  type PaperMetaRow,
  type PaperTimelineStep,
} from './PaperForm/PaperForm';
export { FaIcon, faClass, type FaIconProps } from './FaIcon';

export {
  RichText,
  RichTextEditor,
  GroupMembersPopover,
  escapeHtml,
  renderRichText,
  richTextToPlain,
  serializeToMarkdown,
  RICH_TEXT_HINT,
  type MentionedGroup,
  type MentionedUser,
  type RichTextEditorProps,
  type RichTextOptions,
  type RichTextProps,
} from './RichText';

export {
  FileAttachments,
  FileDropInput,
  FileDropTarget,
  FileDropzone,
  UploadQueueList,
  useFileDrop,
  useUploadQueue,
  type FileAttachmentsProps,
  type FileDropInputProps,
  type FileDropOptions,
  type FileDropTargetProps,
  type FileDropzoneProps,
  type UploadFn,
  type UploadItem,
  type UploadQueueListProps,
  type UploadResult,
} from './FileAttachments';
export { FileViewer, type FileViewerProps } from './FileViewer/FileViewer';
export {
  buildZip,
  downloadFile,
  downloadFilesAsZip,
  extensionOf,
  fileExtension,
  fileIcon,
  fileKind,
  fileNameFromUrl,
  formatFileSize,
  isPreviewable,
  matchesAccept,
  sanitizeZipSegment,
  type AttachmentFile,
  type FileKind,
  type ZipResult,
} from './files';
