// MEDIX — komponentlar API shartnomasi (Claude Design'dagi «Medix» dizayn tizimidan nusxa).
// Uslublar asl manbada: components/bundle.css (mx-*). Frontend komponentlari shu shartnomaga mos quriladi.
import type { ReactNode } from "react";

export type Size = "sm" | "md" | "lg";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";
/** Lucide ikonka nomi, masalan "check", "file-spreadsheet". */
export type IconName = string;

export interface ButtonProps { variant?: "primary" | "secondary" | "tertiary" | "danger" | "icon"; size?: Size; icon?: IconName; loading?: boolean; disabled?: boolean; children?: ReactNode; "aria-label"?: string; onClick?: () => void; }
export interface TextFieldProps { label: string; value: string; onChange: (v: string) => void; variant?: "text" | "search" | "password" | "amount"; suffix?: string; placeholder?: string; hint?: string; error?: string; required?: boolean; disabled?: boolean; size?: Size; }
export interface SelectOption { value: string; label: string; sub?: string; meta?: string; disabled?: boolean; }
export interface SelectProps { label: string; options: SelectOption[]; value: string | string[] | null; onChange: (v: unknown) => void; searchable?: boolean; multiple?: boolean; loadOptions?: (q: string) => Promise<SelectOption[]>; placeholder?: string; error?: string; disabled?: boolean; }
export interface DatePickerProps { label: string; mode?: "single" | "range"; value: Date | [Date, Date] | null; onChange: (v: unknown) => void; min?: Date; max?: Date; presets?: ("today" | "yesterday" | "thisWeek" | "thisMonth" | "lastMonth")[]; error?: string; }
export interface CheckboxProps { label?: string; description?: string; checked: boolean; indeterminate?: boolean; disabled?: boolean; onChange: (v: boolean) => void; }
export interface RadioProps { label: string; name: string; value: string; checked: boolean; disabled?: boolean; onChange: (v: string) => void; }
export interface SwitchProps { label: string; description?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; }
export interface BadgeProps { tone?: Tone; icon?: IconName; status?: "draft" | "pending" | "approved" | "cancelled" | "valid" | "expiring" | "expired" | "in_transit" | "reserved"; children?: ReactNode; }
export interface TableColumn<T> { key: string; title: string; align?: "left" | "right"; width?: number; sortable?: boolean; mono?: boolean; render?: (row: T) => ReactNode; }
export interface TableProps<T> { columns: TableColumn<T>[]; rows: T[]; rowKey: (row: T) => string; density?: "standard" | "compact"; selectable?: boolean; selectedKeys?: string[]; onSelectionChange?: (keys: string[]) => void; bulkActions?: ReactNode; sort?: { key: string; dir: "asc" | "desc" }; onSortChange?: (s: { key: string; dir: "asc" | "desc" }) => void; onRowClick?: (row: T) => void; rowActions?: (row: T) => ReactNode; totals?: Record<string, ReactNode>; loading?: boolean; emptyState?: ReactNode; pagination?: PaginationProps; }
export interface PaginationProps { page: number; pageSize: 25 | 50 | 100; total: number; onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void; }
export interface CardProps { title?: string; actions?: ReactNode; children: ReactNode; }
export interface KpiCardProps { label: string; icon?: IconName; value: string; unit?: string; note?: string; tone?: "default" | "warning"; }
export interface TabsProps { items: { key: string; label: string; count?: number; disabled?: boolean }[]; value: string; onChange: (k: string) => void; }
export interface ModalProps { open: boolean; onClose: () => void; title: string; size?: "sm" | "md" | "lg"; tone?: "default" | "danger"; children: ReactNode; primaryAction: { label: string; onClick: () => void; loading?: boolean }; secondaryAction?: { label: string; onClick: () => void }; }
export interface DrawerProps { open: boolean; onClose: () => void; size?: "sm" | "lg"; title: string; subtitle?: string; status?: ReactNode; tabs?: TabsProps; children: ReactNode; actions?: ReactNode; }
export interface ToastOptions { tone: "success" | "danger" | "warning" | "info"; title: string; description?: string; action?: { label: string; onClick: () => void }; duration?: number; }
export interface AlertProps { tone: "success" | "warning" | "danger" | "info"; title: string; children?: ReactNode; action?: ReactNode; icon?: IconName; }
export interface StepperProps { steps: { key: string; label: string; description?: string }[]; current: number; onStepClick?: (i: number) => void; }
export interface SidebarProps { items: { group?: string; key: string; label: string; icon: IconName; href: string; count?: number }[]; activeKey: string; collapsed: boolean; onCollapsedChange: (v: boolean) => void; user: { name: string; role: string; avatarUrl?: string }; onLogout: () => void; }
export interface TopBarProps { breadcrumbs: { label: string; href?: string }[]; onSearch: (q: string) => void; branch: BranchSwitcherProps; unreadCount: number; language: "uz-Latn" | "uz-Cyrl" | "ru"; onLanguageChange: (l: string) => void; user: { name: string; avatarUrl?: string }; }
export interface BranchSwitcherProps { branches: { id: string; name: string; tin: string }[]; value: string | "all"; onChange: (id: string) => void; allowAll?: boolean; }
export interface AvatarProps { name: string; src?: string; size?: Size; }
export interface TooltipProps { content: string; placement?: "top" | "right" | "bottom" | "left"; children: ReactNode; }
