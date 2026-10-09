"use client";

import { useActionState, useState } from "react";
import { createTicket } from "../actions";

const MAX_SIDE = 2000;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // límite de cuerpo de las funciones de Vercel

// Achica la foto en el navegador: mantiene el texto legible y la subida liviana.
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la foto"))), "image/jpeg", 0.82),
  );
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

export function UploadForm() {
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [error, setError] = useState<string>();
  const [state, action, pending] = useActionState(createTicket, undefined);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setError(undefined);
    try {
      const shrunk = await Promise.all([...files].map(shrink));
      setPhotos((prev) => [...prev, ...shrunk.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    } catch {
      setError("No se pudo abrir alguna de las fotos.");
    }
  }

  function move(index: number, delta: number) {
    setPhotos((prev) => {
      const next = [...prev];
      const [p] = next.splice(index, 1);
      next.splice(index + delta, 0, p);
      return next;
    });
  }

  function submit(formData: FormData) {
    const total = photos.reduce((sum, p) => sum + p.file.size, 0);
    if (total > MAX_TOTAL_BYTES) {
      setError("Las fotos pesan demasiado juntas. Probá con menos fotos.");
      return;
    }
    formData.delete("photos");
    photos.forEach((p) => formData.append("photos", p.file));
    action(formData);
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-neutral-300 p-6 text-center dark:border-neutral-700">
        <span className="font-medium">{photos.length ? "Agregar otra foto" : "Sacar o elegir fotos"}</span>
        <span className="text-xs text-neutral-500">En orden, de arriba hacia abajo del ticket</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {photos.length > 0 && (
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => (
            <li key={p.url} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Foto ${i + 1}`} className="aspect-[3/4] w-full rounded-lg object-cover" />
              <div className="flex justify-between text-xs">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-30">
                  ←
                </button>
                <span>{i + 1}</span>
                <button
                  type="button"
                  disabled={i === photos.length - 1}
                  onClick={() => move(i, 1)}
                  className="disabled:opacity-30"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  className="text-red-600"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {(error || state?.error) && <p className="text-sm text-red-600">{error ?? state?.error}</p>}

      <button
        type="submit"
        disabled={pending || photos.length === 0}
        className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Leyendo el ticket… (puede tardar un minuto)" : "Leer ticket"}
      </button>
    </form>
  );
}
