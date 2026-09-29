import { Factory, Package } from 'lucide-react';
import { cn } from '../lib/utils';
import type { DataModule } from '../hooks/usePeriods';

/**
 * Pemilih modul pemilik data untuk tabel yang DIPAKAI BERSAMA secara tampilan:
 * MRP 26 Weeks (`weekly_schedules`) dan WIP (`wips`).
 *
 * Data kedua modul disimpan TERPISAH (kolom `moduleType`). Upload/edit/hapus di
 * satu modul TIDAK pernah mengubah data modul lain. Pilihan ini WAJIB dibuat
 * sadar oleh user sebelum upload/input supaya data tidak nyasar ke modul lain.
 */
export function ModuleSelect({
  value,
  onChange,
  className,
  lockedTo = null,
}: {
  value: DataModule;
  onChange: (moduleType: DataModule) => void;
  className?: string;
  /**
   * Kalau diisi, pemilih modul DIKUNCI ke modul ini dan tombol lain dinonaktifkan.
   * Dipakai untuk planner: Production Planner terkurung di PRODUCTION, Material
   * Planner di MATERIAL — supaya tidak bisa menulis ke modul milik planner lain.
   */
  lockedTo?: DataModule | null;
}) {
  const options: { id: DataModule; label: string; icon: typeof Factory; activeClass: string }[] = [
    {
      id: 'PRODUCTION',
      label: 'Production Planning',
      icon: Factory,
      activeClass: 'bg-emerald-600 text-white border-emerald-600',
    },
    {
      id: 'MATERIAL',
      label: 'Material Planning',
      icon: Package,
      activeClass: 'bg-amber-600 text-white border-amber-600',
    },
  ];

  const isLocked = lockedTo !== null;

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 border rounded-lg bg-card',
        className,
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
        Data untuk modul
      </span>
      <div className="flex gap-1">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isActive = value === opt.id;
          const isDisabled = isLocked && opt.id !== lockedTo;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => !isDisabled && !isLocked && onChange(opt.id)}
              disabled={isDisabled}
              title={isDisabled ? 'Role Anda tidak punya akses ke modul ini' : undefined}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
                isActive
                  ? opt.activeClass
                  : 'bg-background text-muted-foreground hover:bg-secondary hover:text-foreground',
                isDisabled && 'opacity-40 cursor-not-allowed hover:bg-background',
                isLocked && isActive && 'cursor-default',
              )}
            >
              <Icon size={14} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
