"use client";

import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { EscrowCreateFormFields } from "@/components/escrow/EscrowCreateFormFields";
import { EscrowCreateFormResult } from "@/components/escrow/EscrowCreateFormResult";
import ShareModal from "@/components/escrow/ShareModal";
import { createEscrow, type EscrowInput } from "@/lib/api";
import { EscrowCreateSchema, type EscrowCreateValues, shippingOptions } from "@/lib/validations";

export interface EscrowCreateFormProps {
  onSuccess?: (url: string) => void;
  className?: string;
  initialValues?: Partial<EscrowCreateValues>;
}

export default function EscrowCreateForm({ onSuccess, className = "", initialValues }: EscrowCreateFormProps = {}) {
  const [values, setValues] = useState<EscrowCreateValues>({
    itemName: initialValues?.itemName ?? "",
    priceUSDC: initialValues?.priceUSDC ?? "",
    description: initialValues?.description ?? "",
    shippingWindow: initialValues?.shippingWindow ?? shippingOptions[0],
  });
  const [errors, setErrors] = useState<Partial<Record<keyof EscrowCreateValues, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitLocked, setSubmitLocked] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const submittingRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const updateField = <K extends keyof EscrowCreateValues>(field: K, value: EscrowCreateValues[K]): void => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const copyResultUrl = async (): Promise<void> => {
    if (!resultUrl) return;
    await navigator.clipboard.writeText(resultUrl);
    setCopyStatus("Link copied to clipboard.");
  };

  const downloadQR = async (): Promise<void> => {
    if (!canvasRef.current || !resultUrl) return;
    toast.success("QR code downloaded");
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitLocked(true);
    setCopyStatus(null);
    setSubmitError(null);

    const result = EscrowCreateSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof EscrowCreateValues, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof EscrowCreateValues;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      submittingRef.current = false;
      setSubmitLocked(false);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: EscrowInput = {
        itemName: result.data.itemName,
        priceUSDC: result.data.priceUSDC,
        description: result.data.description,
        shippingWindow: result.data.shippingWindow,
      };
      const response = await createEscrow(payload);
      if (!response.url || !/^https?:\/\//i.test(response.url)) throw new Error("The escrow service returned an invalid URL.");
      setResultUrl(response.url);
      setIsModalOpen(true);
      onSuccess?.(response.url);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitLocked(false);
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`mx-auto w-full max-w-2xl rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8 ${className}`}>
      <form onSubmit={onSubmit} className="space-y-5">
        <EscrowCreateFormFields values={values} errors={errors} disabled={isSubmitting || submitLocked} onChange={updateField} />
        {submitError ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</p> : null}
        <button type="submit" disabled={isSubmitting || submitLocked} className="inline-flex w-full items-center justify-center rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
          {isSubmitting ? "Creating link..." : "Create escrow link"}
        </button>
      </form>
      {resultUrl ? <EscrowCreateFormResult resultUrl={resultUrl} copyStatus={copyStatus} onCopy={copyResultUrl} onDownloadQR={downloadQR} canvasRef={canvasRef} /> : null}
      {resultUrl ? <ShareModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} url={resultUrl} /> : null}
    </div>
  );
}
