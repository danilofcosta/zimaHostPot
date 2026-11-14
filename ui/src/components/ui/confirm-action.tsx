"use client";

import type { ReactNode } from "react";

import { AlertTriangleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "danger",
  loading = false,
  onConfirm,
  onClose,
  children,
}: ConfirmActionDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant={tone === "primary" ? "primary" : "danger"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-xl border px-3.5 py-3",
          tone === "primary"
            ? "border-emerald-500/20 bg-emerald-500/[0.06]"
            : "border-red-500/20 bg-red-500/[0.06]",
        )}
      >
        <AlertTriangleIcon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            tone === "primary" ? "text-emerald-300" : "text-red-300",
          )}
        />
        <div
          className={cn(
            "text-xs leading-relaxed",
            tone === "primary" ? "text-emerald-200/90" : "text-red-200/90",
          )}
        >
          {children ?? (
            <p>
              Esta ação é aplicada imediatamente no host. Confirme que deseja
              continuar.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
