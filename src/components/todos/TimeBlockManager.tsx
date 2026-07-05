"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { serverTimestamp, updateDoc } from "firebase/firestore";
import {
  ChevronDown,
  ChevronUp,
  Dumbbell,
  GripVertical,
  List,
  Moon,
  Pencil,
  Plus,
  Sun,
  Sunrise,
  Sunset,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";

import { profilePath } from "@/lib/db/paths";
import type { RoutineTimeBlock } from "@/lib/db/types";
import {
  DEFAULT_TIME_BLOCKS,
  FALLBACK_BLOCK_ID,
  generateBlockId,
} from "@/lib/routines/helpers";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// ---------------------------------------------------------------------------
// Icon resolution — map string names to Lucide components
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sunrise,
  Sun,
  Dumbbell,
  Sunset,
  Moon,
  List,
};

const AVAILABLE_ICONS = Object.keys(ICON_MAP);

function BlockIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICON_MAP[name] ?? List;
  return <Icon className={className} />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface TimeBlockManagerProps {
  uid: string;
  blocks: RoutineTimeBlock[];
  /** Called when blocks change (parent should re-read profile). */
  onDismiss: () => void;
}

/**
 * Modal-style editor for managing routine time blocks (add, rename, reorder,
 * pick icon, delete). Writes directly to the profile doc.
 */
export default function TimeBlockManager({
  uid,
  blocks: initialBlocks,
  onDismiss,
}: TimeBlockManagerProps) {
  const [blocks, setBlocks] = useState<RoutineTimeBlock[]>(() =>
    [...initialBlocks].sort((a, b) => a.order - b.order),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftIcon, setDraftIcon] = useState("List");
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newIcon, setNewIcon] = useState("List");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoutineTimeBlock | null>(
    null,
  );

  // Keep local state in sync if parent re-renders with new blocks.
  useEffect(() => {
    setBlocks([...initialBlocks].sort((a, b) => a.order - b.order));
  }, [initialBlocks]);

  const dirty = useMemo(() => {
    if (blocks.length !== initialBlocks.length) return true;
    return blocks.some((b, i) => {
      const orig = initialBlocks.find((o) => o.id === b.id);
      return (
        !orig ||
        orig.label !== b.label ||
        orig.icon !== b.icon ||
        orig.order !== b.order
      );
    });
  }, [blocks, initialBlocks]);

  // -- Persist ----------------------------------------------------------------

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await updateDoc(profilePath(uid), {
        routineTimeBlocks: blocks.map((b, i) => ({ ...b, order: i })),
        updatedAt: serverTimestamp(),
      });
      onDismiss();
    } catch (err) {
      console.error("Failed to save time blocks:", err);
    } finally {
      setSaving(false);
    }
  }, [uid, blocks, onDismiss]);

  // -- Reorder ----------------------------------------------------------------

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[target]] = [next[target], next[idx]];
    setBlocks(next.map((b, i) => ({ ...b, order: i })));
  };

  // -- Add new block ----------------------------------------------------------

  const handleAdd = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const label = newLabel.trim();
      if (!label) return;
      const id = generateBlockId(blocks);
      setBlocks((prev) => [
        ...prev,
        { id, label, icon: newIcon, order: prev.length },
      ]);
      setNewLabel("");
      setNewIcon("List");
      setAddOpen(false);
    },
    [newLabel, newIcon, blocks],
  );

  // -- Delete block -----------------------------------------------------------

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    setBlocks((prev) =>
      prev
        .filter((b) => b.id !== deleteTarget.id)
        .map((b, i) => ({ ...b, order: i })),
    );
    setDeleteTarget(null);
  }, [deleteTarget]);

  // -- Inline rename ----------------------------------------------------------

  const startEdit = (block: RoutineTimeBlock) => {
    setEditingId(block.id);
    setDraftLabel(block.label);
    setDraftIcon(block.icon);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const label = draftLabel.trim();
    if (!label) {
      setEditingId(null);
      return;
    }
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === editingId ? { ...b, label, icon: draftIcon } : b,
      ),
    );
    setEditingId(null);
  };

  return (
    <div className="space-y-4 rounded-xl border border-accent/30 bg-neutral-900/80 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-100">
          Manage Time Blocks
        </h3>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="space-y-1.5">
        {blocks.map((block, idx) => (
          <li
            key={block.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-neutral-900/60 px-2.5 py-2"
          >
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted/50" />

            {editingId === block.id ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="text"
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  maxLength={50}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-8 flex-1 rounded-md border border-border bg-neutral-900 px-2 text-sm text-neutral-100 focus:border-accent focus:outline-none"
                />
                <IconPicker value={draftIcon} onChange={setDraftIcon} />
                <button
                  type="button"
                  onClick={commitEdit}
                  className="rounded-md bg-accent px-2 py-1 text-[10px] font-semibold text-neutral-900"
                >
                  OK
                </button>
              </div>
            ) : (
              <>
                <BlockIcon
                  name={block.icon}
                  className="h-4 w-4 shrink-0 text-accent"
                />
                <span className="flex-1 truncate text-sm text-neutral-100">
                  {block.label}
                </span>
              </>
            )}

            {editingId !== block.id && (
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  aria-label="Move up"
                  className="rounded p-1 text-muted transition hover:text-neutral-200 disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === blocks.length - 1}
                  aria-label="Move down"
                  className="rounded p-1 text-muted transition hover:text-neutral-200 disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(block)}
                  aria-label="Rename"
                  className="rounded p-1 text-muted transition hover:text-neutral-200"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(block)}
                  disabled={block.id === FALLBACK_BLOCK_ID}
                  aria-label="Delete"
                  className="rounded p-1 text-muted transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Add new block */}
      {addOpen ? (
        <form
          onSubmit={handleAdd}
          className="flex items-center gap-2 rounded-lg border border-dashed border-accent/40 bg-accent/5 px-2.5 py-2"
        >
          <Plus className="h-4 w-4 shrink-0 text-accent" />
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Block name"
            maxLength={50}
            autoFocus
            className="h-8 flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-muted focus:outline-none"
          />
          <IconPicker value={newIcon} onChange={setNewIcon} />
          <button
            type="submit"
            disabled={!newLabel.trim()}
            className="rounded-md bg-accent px-2 py-1 text-[10px] font-semibold text-neutral-900 disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(false)}
            className="rounded-md px-2 py-1 text-[10px] text-muted hover:text-neutral-200"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted transition hover:border-accent/40 hover:text-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          Add block
        </button>
      )}

      {/* Save / Cancel */}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={onDismiss}
          className="h-8 rounded-md border border-border bg-neutral-900 px-3 text-xs text-muted hover:text-neutral-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="h-8 rounded-md bg-accent px-3 text-xs font-semibold text-neutral-900 hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        tone="danger"
        title={`Delete "${deleteTarget?.label}"?`}
        description="Routines in this block will be moved to Anytime. This can't be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini icon picker
// ---------------------------------------------------------------------------

function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-neutral-900 text-accent transition hover:border-accent/40"
        aria-label="Pick icon"
      >
        <BlockIcon name={value} className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 grid grid-cols-3 gap-1 rounded-lg border border-border bg-neutral-900 p-2 shadow-xl">
          {AVAILABLE_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => {
                onChange(icon);
                setOpen(false);
              }}
              className={clsx(
                "flex h-8 w-8 items-center justify-center rounded-md transition",
                icon === value
                  ? "bg-accent text-neutral-900"
                  : "text-muted hover:bg-neutral-800 hover:text-neutral-200",
              )}
              aria-label={icon}
            >
              <BlockIcon name={icon} className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export for use by other components
export { BlockIcon, ICON_MAP };
