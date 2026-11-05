"use client";

import { AlertTriangleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
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
            variant="danger"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3.5 py-3">
        <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
        <p className="text-xs leading-relaxed text-red-200/90">
          O hotspot será desligado e o perfil salvo no NetworkManager será
          apagado. Para apenas desligar e religar depois, use a opção
          &quot;Desligar&quot;.
        </p>
      </div>
    </Modal>
  );
}
