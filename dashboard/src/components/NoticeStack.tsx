import type { Notice } from "../types";
import { toneClasses } from "../ui";

export function NoticeStack({
  notices,
  onClose
}: {
  notices: Notice[];
  onClose: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-3">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl backdrop-blur ${toneClasses(notice.tone)}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{notice.title}</p>
              <p className="mt-1 text-sm leading-5 opacity-90">{notice.message}</p>
            </div>
            <button
              className="rounded-full px-2 py-1 text-xs font-semibold opacity-70 transition hover:opacity-100"
              onClick={() => onClose(notice.id)}
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
