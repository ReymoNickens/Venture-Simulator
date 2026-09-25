import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { X } from "lucide-react";

/**
 * Bottom sheet on phones, centred panel on wider screens. Used for every "add"
 * form so the page behind (the list, the board) stays in view.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-night/40 backdrop-blur-[2px]" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-[26px] bg-bg-elevated shadow-[var(--shadow-lift)] outline-none sm:bottom-6 sm:rounded-[26px]"
          aria-describedby={description ? undefined : undefined}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-line sm:hidden" />
          <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
            <div>
              <Drawer.Title className="font-display text-xl leading-tight">{title}</Drawer.Title>
              {description ? <Drawer.Description className="mt-1 text-sm text-muted">{description}</Drawer.Description> : null}
            </div>
            <Drawer.Close className="grid size-9 place-items-center rounded-full text-muted hover:bg-bg-subtle" aria-label="Close">
              <X className="size-4" />
            </Drawer.Close>
          </div>
          <div className="overflow-y-auto px-5 pb-6 safe-bottom">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
