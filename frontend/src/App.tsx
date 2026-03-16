import { useEffect, useMemo, useRef, useState } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}


// ── pywebview API (backend real) ─────────────────────────────────────────
declare global {
  interface Window {
    pywebview?: {
      api: {
        get_library: () => Promise<BackendFile[]>;
        create_audio: (text: string, voiceId: string, filename: string) => Promise<{ success: boolean; file?: string; error?: string }>;
        remove_silences: (fileId: string) => Promise<{ success: boolean; file?: string; error?: string }>;
        create_subtitles: (filename: string, wordsPerSegment: number, cleanPunctuation: boolean, whisperModel: string) => Promise<{ success: boolean; srt?: string; txt?: string; error?: string }>;
        open_folder: () => Promise<void>;
        delete_file: (fileId: string) => Promise<{ success: boolean; error?: string }>;
        import_file: () => Promise<{ success: boolean; file?: string; error?: string }>;
        change_data_dir: () => Promise<{ success: boolean; path?: string; error?: string }>;
      };
    };
  }
}

type BackendFile = { id: string; name: string; kind: "wav" | "mp3" | "srt" | "txt"; size: number; date: string; duration: string };

type PanelKey = "files" | "tts" | "subtitles";
type FileKind = "wav" | "txt" | "srt";
type LanguageKey = "Español" | "English" | "Multilanguage";

type LibraryFile = {
  id: string;
  name: string;
  subtitle: string;
  sizeBytes: number;
  modified: string;
  kind: FileKind;
  source: "sample" | "user" | "generated";
};

const voiceCatalog: Record<LanguageKey, { label: string; id: string }[]> = {
  Español: [
    { label: "Dalia (México)", id: "dalia" },
    { label: "Jorge (México)", id: "jorge" },
    { label: "Álvaro (España)", id: "alvaro" },
    { label: "Elvira (España)", id: "elvira" },
  ],
  English: [
    { label: "Guy (Neural)", id: "guy" },
    { label: "Ariana (Neural)", id: "ariana" },
    { label: "Andrew (Neural)", id: "andrew" },
    { label: "Brian (Neural)", id: "brian" },
  ],
  Multilanguage: [
    { label: "Ava (Multilingual)", id: "ava" },
    { label: "Andrew (Multilingual)", id: "andrew" },
    { label: "Emma (Multilingual)", id: "emma" },
  ],
};

const initialLibrary: LibraryFile[] = [
  {
    id: "audio-1",
    name: "audio_1.wav",
    subtitle: "audio file",
    sizeBytes: 45_100_000,
    modified: "10/10/2024",
    kind: "wav",
    source: "sample",
  },
  {
    id: "audio-2",
    name: "audio_2.wav",
    subtitle: "audio file",
    sizeBytes: 26_800,
    modified: "10/10/2024",
    kind: "wav",
    source: "sample",
  },
  {
    id: "txt-1",
    name: "transcription.txt",
    subtitle: "transcription.txt",
    sizeBytes: 47_700,
    modified: "10/10/2024",
    kind: "txt",
    source: "sample",
  },
  {
    id: "txt-2",
    name: "transcription_v2.txt",
    subtitle: "edited transcript",
    sizeBytes: 6_600_000,
    modified: "10/10/2024",
    kind: "txt",
    source: "sample",
  },
  {
    id: "txt-3",
    name: "segments.txt",
    subtitle: "subtitle chunks",
    sizeBytes: 42_700,
    modified: "10/10/2024",
    kind: "txt",
    source: "sample",
  },
  {
    id: "srt-1",
    name: "subtitle.srt",
    subtitle: "subtitle.srt",
    sizeBytes: 3_000_000,
    modified: "10/10/2024",
    kind: "srt",
    source: "sample",
  },
  {
    id: "srt-2",
    name: "subtitle_es.srt",
    subtitle: "subtitle.srt",
    sizeBytes: 3_000_000,
    modified: "10/10/2024",
    kind: "srt",
    source: "sample",
  },
  {
    id: "txt-4",
    name: "subtitle.txt",
    subtitle: "plain text export",
    sizeBytes: 30_000,
    modified: "10/10/2024",
    kind: "txt",
    source: "sample",
  },
];

function formatFileSize(bytes: number) {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 1 : 2)} MB`;
  }
  if (bytes >= 1_000) {
    return `${(bytes / 1_000).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

// Formatea la duración: "45.1s" → "45 seg" | "185.3s" → "3:05 min" | "3900s" → "1:05:00"
function formatDuration(raw: string): string {
  if (!raw || raw === "-") return "-";
  const secs = parseFloat(raw.replace("s", ""));
  if (isNaN(secs)) return raw;
  const totalSec = Math.round(secs);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")} min`;
  return `${totalSec} seg`;
}

function formatDateLabel(timestamp: number) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(timestamp);
}

function formatTimeLabel(timestamp: number) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function formatRelativeDate(timestamp: number) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  if (hours < 24) return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
  if (days < 7) return `hace ${days} ${days === 1 ? "día" : "días"}`;
  return formatDateLabel(timestamp);
}

function inferKindFromFilename(filename: string): FileKind {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".srt")) return "srt";
  if (lower.endsWith(".txt")) return "txt";
  return "wav";
}

function sanitizeFilename(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ_-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 42);
}

// ── Dropdown personalizado (evita el bug de Qt WebEngine con <select> nativo) ──
function CustomSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)} style={{ zIndex: open ? 50 : "auto" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm outline-none",
          className,
        )}
      >
        <span className="truncate">{selectedLabel}</span>
        <span className="ml-2 shrink-0 text-xs opacity-60">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 rounded-2xl border shadow-xl"
          style={{
            zIndex: 9999,
            position: "absolute",
            backgroundColor: "inherit",
          }}
        >
          <div className="max-h-48 overflow-y-auto rounded-2xl py-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  "w-full px-4 py-2.5 text-left text-sm hover:bg-sky-50 dark:hover:bg-white/10",
                  opt.value === value ? "font-semibold" : "",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LogoMark({ darkMode }: { darkMode: boolean }) {
  return (
    <div
      className={cn(
        "relative grid h-14 w-14 place-items-center overflow-hidden rounded-[20px] border shadow-[0_18px_40px_rgba(14,165,233,0.25)]",
        darkMode
          ? "border-cyan-300/20 bg-gradient-to-br from-cyan-400 via-sky-500 to-violet-500"
          : "border-white/80 bg-gradient-to-br from-sky-400 via-cyan-400 to-violet-500",
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.38),transparent_32%)]" />
      <div className="relative flex items-end gap-1">
        {[20, 28, 18, 30].map((height, index) => (
          <span
            key={index}
            className="block w-1.5 rounded-full bg-white/95 shadow-sm"
            style={{ height, animationDelay: `${index * 120}ms` }}
          />
        ))}
      </div>
      <div className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-white/90" />
    </div>
  );
}

function IconFolder({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
    </svg>
  );
}

function IconWave({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path strokeLinecap="round" d="M4 12h2" />
      <path strokeLinecap="round" d="M8 8v8" />
      <path strokeLinecap="round" d="M12 5v14" />
      <path strokeLinecap="round" d="M16 8v8" />
      <path strokeLinecap="round" d="M20 10v4" />
    </svg>
  );
}

function IconSubtitles({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path strokeLinecap="round" d="M7 11h10" />
      <path strokeLinecap="round" d="M7 15h6" />
    </svg>
  );
}

function IconRefresh({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 3v5h-5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21v-5h5" />
    </svg>
  );
}


function IconMoon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
    </svg>
  );
}

function IconSun({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07 6.7 17.3M17.3 6.7l1.77-1.77" />
    </svg>
  );
}

function IconSettings({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.8 1.8 0 0 1-2.6 2.6l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.8 1.8 0 0 1-3.6 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.8 1.8 0 0 1-2.6-2.6l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1.8 1.8 0 0 1 0-3.6h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1L4.8 9a1.8 1.8 0 1 1 2.6-2.6l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1.8 1.8 0 0 1 3.6 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1A1.8 1.8 0 1 1 19.2 7l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.8 1.8 0 0 1 0 3.6h-.2a1 1 0 0 0-.9.6Z" />
    </svg>
  );
}

function IconCheck({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}

function IconDocument({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3h6l5 5v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
    </svg>
  );
}

function IconSpark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2Z" />
    </svg>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "btn-animated rounded-2xl px-4 py-3 text-sm font-semibold transition duration-200",
        active
          ? "bg-gradient-to-r from-cyan-500 via-sky-500 to-violet-500 text-white shadow-[0_16px_32px_rgba(14,165,233,0.24)]"
          : "bg-white/70 text-slate-700 ring-1 ring-slate-200/80 hover:bg-white dark:bg-slate-900/70 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-slate-900",
      )}
    >
      {label}
    </button>
  );
}

export function App() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem("vozia-theme");
    if (stored === "dark") return true;
    if (stored === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [activeTab, setActiveTab] = useState<PanelKey>("tts");
  const [library, setLibrary] = useState<LibraryFile[]>(initialLibrary);
  const [selectedLibraryId, setSelectedLibraryId] = useState(initialLibrary[0].id);
  const [processingFileId, setProcessingFileId] = useState(initialLibrary[0].id);
  const [ttsText, setTtsText] = useState(
    "Bienvenida a VOZIA. Esta plantilla convierte texto a audio y también prepara subtítulos con una interfaz moderna, colorida y muy clara.",
  );
  const [language, setLanguage] = useState<LanguageKey>("Español");
  const [voice, setVoice] = useState(voiceCatalog.Español[0].id);
  const [outputFilename, setOutputFilename] = useState("presentacion_vozia");
  const [autoPrefix, setAutoPrefix] = useState<string | boolean>(true);
  const [wordsPerSegment, setWordsPerSegment] = useState(7);
  const [cleanPunctuation, setCleanPunctuation] = useState(true);
  const [outputFormats, setOutputFormats] = useState({ srt: true, txt: false });
  const [status, setStatus] = useState(
    "Plantilla lista: puedes navegar, cambiar el tema y gestionar tus archivos de audio y subtítulos.",
  );
  const [lastSync, setLastSync] = useState(formatTimeLabel(Date.now()));
  const [isProcessing, setIsProcessing] = useState(false);
  const [whisperModel, setWhisperModel] = useState<"base" | "medium">("base");

  useEffect(() => {
    document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
    window.localStorage.setItem("vozia-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const availableVoices = useMemo(() => voiceCatalog[language], [language]);

  useEffect(() => {
    if (!availableVoices.find(v => v.id === voice)) {
      setVoice(availableVoices[0].id);
    }
  }, [availableVoices, voice]);

  const selectedFile = library.find((item) => item.id === selectedLibraryId) ?? library[0];
  const processingFile = library.find((item) => item.id === processingFileId) ?? selectedFile;

  const stats = useMemo(
    () => ({
      total: library.length,
      wav: library.filter((item) => item.kind === "wav").length,
      text: library.filter((item) => item.kind === "txt").length,
      subtitles: library.filter((item) => item.kind === "srt").length,
    }),
    [library],
  );

  const pageClasses = darkMode
    ? {
      shell: "bg-slate-950 text-slate-100",
      hero: "from-cyan-500/15 via-transparent to-violet-500/15",
      panel: "border-white/10 bg-slate-900/75 shadow-[0_30px_80px_rgba(2,6,23,0.45)]",
      subtle: "border-white/10 bg-slate-800/75",
      textMain: "text-slate-100",
      textMuted: "text-slate-400",
      input:
        "border-white/10 bg-slate-950/70 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/40 focus:ring-4 focus:ring-cyan-500/10",
      secondaryButton:
        "border-white/10 bg-slate-900/80 text-slate-100 hover:bg-slate-800 active:bg-slate-800",
      ghostButton:
        "border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08] active:bg-white/[0.10]",
    }
    : {
      shell: "bg-sky-50 text-slate-900",
      hero: "from-sky-400/20 via-cyan-200/10 to-violet-300/20",
      panel: "border-white/80 bg-white/75 shadow-[0_24px_70px_rgba(14,165,233,0.12)]",
      subtle: "border-slate-200/80 bg-slate-50/90",
      textMain: "text-slate-900",
      textMuted: "text-slate-500",
      input:
        "border-slate-200 bg-white/95 text-slate-900 placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100",
      secondaryButton:
        "border-slate-200 bg-white text-slate-800 hover:bg-sky-50 active:bg-sky-100",
      ghostButton:
        "border-slate-200 bg-white/85 text-slate-700 hover:bg-white active:bg-slate-100",
    };

  const primaryButtonClass =
    "btn-animated inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(14,165,233,0.24)] transition duration-200 bg-gradient-to-r from-cyan-500 via-sky-500 to-violet-500 hover:brightness-105";
  const secondaryButtonClass = cn(
    "btn-animated inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition duration-200",
    pageClasses.secondaryButton,
  );
  const ghostButtonClass = cn(
    "btn-animated inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition duration-200",
    pageClasses.ghostButton,
  );
  const inputClass = cn(
    "w-full rounded-2xl border px-4 py-3 text-sm outline-none transition duration-200",
    pageClasses.input,
  );
  const panelBase = cn("relative overflow-hidden rounded-[28px] border", pageClasses.panel);

  const jumpToPanel = (panel: PanelKey) => {
    setActiveTab(panel);
    document.getElementById(`section-${panel}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const refreshLibrary = async () => {
    const now = Date.now();
    setLastSync(formatTimeLabel(now));
    if (window.pywebview) {
      try {
        const files = await window.pywebview.api.get_library();
        const mapped: LibraryFile[] = files.map((f) => ({
          id: f.id,
          name: f.name,
          subtitle: f.duration && f.duration !== "-" ? formatDuration(f.duration) : f.kind.toUpperCase(),
          sizeBytes: f.size,
          modified: f.date,
          kind: (f.kind === "mp3" ? "wav" : f.kind) as FileKind,
          source: "user" as const,
        }));
        setLibrary(mapped);
        setStatus(`Librería: ${mapped.length} archivos cargados a las ${formatTimeLabel(now)}.`);
      } catch (e) {
        setStatus(`Error cargando librería: ${e}`);
      }
    } else {
      setStatus(`Librería actualizada correctamente a las ${formatTimeLabel(now)}.`);
    }
  };

  const openLocalPicker = async (_pickDirectory: boolean) => {
    if (!window.pywebview?.api) {
      setStatus("Error: No hay conexión con el backend. Reinicia la aplicación.");
      return;
    }
    try {
      setStatus("Abriendo selector de archivos...");
      const result = await window.pywebview.api.import_file();
      if (result && result.success) {
        setStatus(`✅ Archivo importado: ${result.file}`);
        await refreshLibrary();
        setActiveTab("files");
      } else if (result && result.error) {
        setStatus(`Info: ${result.error}`);
      } else {
        setStatus("No se seleccionó ningún archivo.");
      }
    } catch (e) {
      setStatus(`❌ Error al abrir el selector: ${e}`);
      console.error("Error calling import_file:", e);
    }
  };

  const selectFileForProcessing = () => {
    const candidate =
      (selectedFile && (selectedFile.kind === "wav" ? selectedFile : undefined)) ??
      library.find((item) => item.kind === "wav");

    if (!candidate) {
      setStatus("No hay archivos disponibles para procesar todavía.");
      return;
    }

    setProcessingFileId(candidate.id);
    setStatus(`Archivo listo para procesar: ${candidate.name}.`);
    jumpToPanel("subtitles");
  };

  const createAudio = async () => {
    const cleanBase = sanitizeFilename(outputFilename || "audio_demo") || "audio_demo";
    const prefix = (autoPrefix && typeof autoPrefix === "string") ? autoPrefix : "";
    const fullFilename = `${prefix}${cleanBase}`;

    if (window.pywebview) {
      setIsProcessing(true);
      setStatus("🎙️ Generando audio con Edge-TTS Premium...");
      const res = await window.pywebview.api.create_audio(ttsText, voice, fullFilename);
      setIsProcessing(false);
      if (res.success) {
        setStatus(`✅ Audio generado: ${res.file}`);
        await refreshLibrary();
        jumpToPanel("subtitles");
      } else {
        setStatus(`❌ Error TTS: ${res.error}`);
      }
      return;
    }
    const timestamp = Date.now();
    const newAudio: LibraryFile = {
      id: `generated-audio-${timestamp}`,
      name: `${fullFilename}.wav`,
      subtitle: `${language} · ${voice}`,
      sizeBytes: Math.max(120_000, ttsText.length * 920),
      modified: formatDateLabel(timestamp),
      kind: "wav",
      source: "generated",
    };
    setLibrary((current) => [newAudio, ...current]);
    setSelectedLibraryId(newAudio.id);
    setProcessingFileId(newAudio.id);
    setLastSync(formatTimeLabel(timestamp));
    setStatus(`Audio generado visualmente: ${fullFilename}.wav. También quedó seleccionado para subtítulos.`);
    jumpToPanel("subtitles");
  };

  const toggleFormat = (format: "srt" | "txt") => {
    setOutputFormats((current) => ({ ...current, [format]: !current[format] }));
  };

  const createSubtitles = async () => {
    if (!processingFile) {
      setStatus("Selecciona primero un archivo de audio para subtitular.");
      return;
    }
    if (!outputFormats.srt && !outputFormats.txt) {
      setStatus("Activa al menos un formato de salida (.srt o .txt).");
      return;
    }
    if (window.pywebview) {
      setIsProcessing(true);
      setStatus(`🤖 Whisper transcribiendo ${processingFile.name}... (puede tardar unos minutos)`);
      const res = await window.pywebview.api.create_subtitles(processingFile.name, wordsPerSegment, cleanPunctuation, whisperModel);
      setIsProcessing(false);
      if (res.success) {
        setStatus(`✅ Subtítulos listos: ${res.srt ?? res.txt}`);
        await refreshLibrary();
      } else {
        setStatus(`❌ Error Whisper: ${res.error}`);
      }
      return;
    }
    const baseName = processingFile.name.replace(/\.[^/.]+$/, "");
    const now = Date.now();
    const generated: LibraryFile[] = [];
    if (outputFormats.srt) {
      generated.push({ id: `generated-srt-${now}`, name: `${baseName}.srt`, subtitle: `segments · ${wordsPerSegment} words`, sizeBytes: 24_000 + wordsPerSegment * 1_100, modified: formatDateLabel(now), kind: "srt", source: "generated" });
    }
    if (outputFormats.txt) {
      generated.push({ id: `generated-txt-${now}`, name: `${baseName}.txt`, subtitle: cleanPunctuation ? "clean punctuation enabled" : "raw transcript", sizeBytes: 18_000 + wordsPerSegment * 800, modified: formatDateLabel(now), kind: "txt", source: "generated" });
    }
    setLibrary((current) => [...generated, ...current]);
    if (generated[0]) setSelectedLibraryId(generated[0].id);
    setLastSync(formatTimeLabel(now));
    setStatus(`Subtítulos creados para ${processingFile.name} en ${generated.map((item) => item.name).join(", ")}.`);
    setActiveTab("subtitles");
  };

  const autoRemoveSilences = async () => {
    if (!processingFile) {
      setStatus("Selecciona un archivo antes de aplicar limpieza automática.");
      return;
    }
    if (window.pywebview) {
      setIsProcessing(true);
      setStatus(`✂️ Eliminando silencios en ${processingFile.name}...`);
      const res = await window.pywebview.api.remove_silences(processingFile.name);
      setIsProcessing(false);
      if (res.success) {
        setStatus(`✅ Silencios eliminados: ${res.file}`);
        await refreshLibrary();
      } else {
        setStatus(`❌ Error: ${res.error}`);
      }
      return;
    }
    setStatus(`Se ha preparado una limpieza automática de silencios para ${processingFile.name}.`);
  };


  const panelGlow = (panel: PanelKey) =>
    activeTab === panel
      ? darkMode
        ? "ring-2 ring-cyan-400/35 shadow-[0_0_0_1px_rgba(34,211,238,0.1),0_30px_70px_rgba(34,211,238,0.08)]"
        : "ring-2 ring-sky-300/60 shadow-[0_0_0_1px_rgba(14,165,233,0.08),0_30px_70px_rgba(14,165,233,0.14)]"
      : "ring-1 ring-black/0";

  return (
    <div className={cn("relative min-h-screen overflow-hidden", pageClasses.shell)}>
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", pageClasses.hero)} />
      <div className="pointer-events-none absolute left-[-6rem] top-[-5rem] h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-6rem] right-[-5rem] h-80 w-80 rounded-full bg-violet-400/20 blur-3xl" />
      <div className="soft-grid absolute inset-0 opacity-60" />

      <div className="relative mx-auto max-w-[1600px] p-4 lg:p-6">
        <header className={cn(panelBase, "panel-sheen px-5 py-5 lg:px-6")}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <LogoMark darkMode={darkMode} />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className={cn("text-2xl font-bold tracking-[0.02em]", pageClasses.textMain)}>VOZIA</h1>
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
                    <IconSpark className="h-3 w-3" />
                    Voice Studio
                  </span>
                </div>
                <p className={cn("mt-1 text-sm", pageClasses.textMuted)}>
                  Librería de proyectos, creación TTS y subtítulos locales en una sola plantilla moderna.
                </p>
              </div>
            </div>

            <nav
              className={cn(
                "flex flex-1 flex-wrap items-center gap-2 rounded-[22px] border p-2 xl:max-w-3xl xl:justify-center",
                pageClasses.subtle,
              )}
            >
              <TabButton label="Project Files" active={activeTab === "files"} onClick={() => jumpToPanel("files")} />
              <TabButton label="Create Audio (TTS)" active={activeTab === "tts"} onClick={() => jumpToPanel("tts")} />
              <TabButton
                label="Process & Subtitles"
                active={activeTab === "subtitles"}
                onClick={() => jumpToPanel("subtitles")}
              />
            </nav>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDarkMode((value) => !value)}
                className={cn("btn-animated rounded-2xl border p-3 transition duration-200", pageClasses.ghostButton)}
                aria-label="Alternar tema"
                title="Alternar tema"
              >
                {darkMode ? <IconSun /> : <IconMoon />}
              </button>
            </div>
          </div>

          <div
            className={cn(
              "mt-4 flex flex-col gap-2 rounded-2xl border px-4 py-3 text-sm lg:flex-row lg:items-center lg:justify-between",
              pageClasses.subtle,
            )}
          >
            <div className="flex items-center gap-2">
              <span className="badge-pulse inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className={pageClasses.textMain}>{status}</span>
            </div>
            <div className={cn("text-xs lg:text-sm", pageClasses.textMuted)}>
              Modo {darkMode ? "oscuro" : "claro"} • Última sincronización: {lastSync}
            </div>
          </div>
        </header>

        <div className="mt-4 grid gap-4 xl:grid-cols-[84px_minmax(0,1.08fr)_minmax(0,1.2fr)_minmax(0,0.95fr)]">
          <aside className={cn(panelBase, "hidden p-3 xl:flex xl:flex-col xl:justify-between")}>
            <div className="space-y-3">
              {[
                { key: "files" as const, icon: <IconFolder />, label: "Library" },
                { key: "tts" as const, icon: <IconWave />, label: "TTS" },
                { key: "subtitles" as const, icon: <IconSubtitles />, label: "Subtitles" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => jumpToPanel(item.key)}
                  className={cn(
                    "btn-animated flex w-full flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-xs font-medium transition duration-200",
                    activeTab === item.key
                      ? "border-cyan-400/20 bg-gradient-to-br from-cyan-500 to-violet-500 text-white shadow-[0_16px_28px_rgba(14,165,233,0.25)]"
                      : pageClasses.ghostButton,
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setDarkMode((value) => !value)}
                className={cn(
                  "btn-animated flex w-full flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-xs font-medium transition duration-200",
                  pageClasses.ghostButton,
                )}
              >
                {darkMode ? <IconSun /> : <IconMoon />}
                <span>Tema</span>
              </button>
              <button
                type="button"
                className={cn(
                  "btn-animated flex w-full flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-xs font-medium transition duration-200",
                  pageClasses.ghostButton,
                )}
              >
                <IconSettings />
                <span>Settings</span>
              </button>
            </div>
          </aside>

          <section id="section-files" className={cn(panelBase, panelGlow("files"), "panel-sheen px-5 py-5 lg:px-6")}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-[0_16px_28px_rgba(14,165,233,0.25)]">
                    <IconFolder className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className={cn("text-[1.65rem] font-bold", pageClasses.textMain)}>Project Library</h2>
                    <p className={cn("text-sm", pageClasses.textMuted)}>
                      Visualiza archivos .wav, .txt y .srt con selección rápida para procesar.
                    </p>
                  </div>
                </div>
              </div>
              <div className={cn("rounded-full px-3 py-1 text-xs font-semibold", darkMode ? "bg-cyan-500/10 text-cyan-300" : "bg-cyan-50 text-cyan-700")}>
                {stats.total} archivos
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={refreshLibrary} className={secondaryButtonClass}>
                <IconRefresh />
                <span>Actualizar</span>
              </button>
              <button
                type="button"
                onClick={() => window.pywebview?.api.open_folder()}
                className={secondaryButtonClass}
              >
                <IconFolder className="h-4 w-4" />
                <span>Abrir Carpeta</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (window.pywebview) {
                    const res = await (window.pywebview?.api as any).change_data_dir();
                    if (res && res.success) {
                      refreshLibrary();
                      setStatus(`Nueva ubicación: ${res.path}`);
                    }
                  }
                }}
                className={secondaryButtonClass}
              >
                <IconSettings className="h-4 w-4" />
                <span>Cambiar Ubicación</span>
              </button>
              <button type="button" onClick={selectFileForProcessing} className={primaryButtonClass}>
                <IconWave className="h-4 w-4" />
                <span>Procesar para Subtítulos</span>
              </button>
            </div>

            <div className="mt-5 space-y-3 pr-1 lg:max-h-[630px] lg:overflow-auto">
              {library
                .filter((file) => activeTab !== "subtitles" || file.kind === "wav")
                .map((file) => {
                  const isSelected = selectedLibraryId === file.id;
                const typeStyles =
                  file.kind === "wav"
                    ? "from-cyan-500 to-sky-600"
                    : file.kind === "srt"
                      ? "from-violet-500 to-fuchsia-600"
                      : "from-emerald-500 to-teal-600";

                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => setSelectedLibraryId(file.id)}
                    className={cn(
                      "btn-animated flex w-full items-center justify-between gap-4 rounded-[22px] border p-3 text-left transition duration-200",
                      isSelected
                        ? darkMode
                          ? "border-cyan-400/20 bg-cyan-500/10 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18)]"
                          : "border-sky-200 bg-sky-50 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.10)]"
                        : pageClasses.subtle,
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-sm", typeStyles)}>
                        {file.kind === "wav" ? <IconWave /> : <IconDocument />}
                      </div>
                      <div className="min-w-0">
                        <p className={cn("truncate text-base font-semibold", pageClasses.textMain)}>{file.name}</p>
                        <p className={cn("truncate text-sm", pageClasses.textMuted)}>{file.subtitle}</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <div className="hidden text-right sm:block">
                        <p className={cn("text-sm font-medium", pageClasses.textMain)}>{formatFileSize(file.sizeBytes)}</p>
                        <p className={cn("text-xs", pageClasses.textMuted)}>
                          {formatRelativeDate(new Date(file.modified).getTime() || Date.now())}
                        </p>
                      </div>
                      <div
                        className={cn(
                          "grid h-6 w-6 place-items-center rounded-md border transition duration-200",
                          isSelected
                            ? "border-cyan-400 bg-gradient-to-br from-cyan-500 to-violet-500 text-white"
                            : darkMode
                              ? "border-white/20 bg-transparent text-transparent"
                              : "border-slate-300 bg-white text-transparent",
                        )}
                      >
                        <IconCheck className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Audio files", value: stats.wav },
                { label: "Text files", value: stats.text },
                { label: "Subtitles", value: stats.subtitles },
              ].map((item) => (
                <div key={item.label} className={cn("rounded-2xl border px-4 py-3", pageClasses.subtle)}>
                  <p className={cn("text-xs uppercase tracking-[0.14em]", pageClasses.textMuted)}>{item.label}</p>
                  <p className={cn("mt-2 text-2xl font-bold", pageClasses.textMain)}>{item.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="section-tts" className={cn(panelBase, panelGlow("tts"), "panel-sheen px-5 py-5 lg:px-6")}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-violet-500 text-white shadow-[0_16px_28px_rgba(99,102,241,0.22)]">
                    <IconWave className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className={cn("text-[1.65rem] font-bold", pageClasses.textMain)}>Text-to-Speech (Edge Voices)</h2>
                    <p className={cn("text-sm", pageClasses.textMuted)}>
                      Escribe tu texto, elige idioma y prepara un archivo visual con estética limpia.
                    </p>
                  </div>
                </div>
              </div>
              <div className={cn("rounded-full px-3 py-1 text-xs font-semibold", darkMode ? "bg-violet-500/10 text-violet-300" : "bg-violet-50 text-violet-700")}>
                Edge Voices
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className={cn("mb-2 block text-sm font-medium", pageClasses.textMain)}>Área de texto</label>
                <textarea
                  value={ttsText}
                  onChange={(event) => setTtsText(event.target.value)}
                  className={cn(inputClass, "min-h-[220px] resize-y")}
                  placeholder="Pega o escribe aquí el texto que quieres convertir a audio..."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={cn("mb-2 block text-sm font-medium", pageClasses.textMain)}>Voice Selection</label>
                  <CustomSelect
                    value={language}
                    onChange={(v) => setLanguage(v as LanguageKey)}
                    options={[
                      { label: "Español", value: "Español" },
                      { label: "English", value: "English" },
                      { label: "Multilanguage", value: "Multilanguage" },
                    ]}
                    className={cn(pageClasses.input)}
                  />
                </div>
                <div>
                  <label className={cn("mb-2 block text-sm font-medium", pageClasses.textMain)}>Voice Style</label>
                  <CustomSelect
                    value={voice}
                    onChange={(v) => setVoice(v)}
                    options={availableVoices.map((v) => ({ label: v.label, value: v.id }))}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <div>
                  <label className={cn("mb-2 block text-sm font-medium", pageClasses.textMain)}>Output Filename</label>
                  <input
                    value={outputFilename}
                    onChange={(event) => setOutputFilename(event.target.value)}
                    className={inputClass}
                    placeholder="nombre_final_del_audio"
                  />
                </div>
                <div>
                  <label className={cn("mb-2 block text-sm font-medium", pageClasses.textMain)}>Importar archivos</label>
                  <button
                    type="button"
                    onClick={() => openLocalPicker(false)}
                    className={secondaryButtonClass + " w-full"}
                  >
                    <IconFolder className="h-4 w-4" />
                    Añadir archivos
                  </button>
                </div>
              </div>

              <div
                className={cn(
                  "btn-animated flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition duration-200",
                  pageClasses.subtle,
                )}
              >
                <div className="flex-1">
                  <p className={cn("text-sm font-semibold", pageClasses.textMain)}>Auto-add filename prefix</p>
                  <p className={cn("text-xs", pageClasses.textMuted)}>El prefijo se añade al inicio del nombre del archivo.</p>
                </div>
                <div className="flex items-center gap-3">
                  {autoPrefix && (
                    <input
                      type="text"
                      value={typeof autoPrefix === "string" ? autoPrefix : ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setAutoPrefix(e.target.value as unknown as boolean)}
                      placeholder="mi_prefijo_"
                      className={cn("w-28 rounded-xl border px-3 py-1.5 text-xs outline-none", pageClasses.input)}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setAutoPrefix((value) => (value ? false : "vozia_") as unknown as boolean)}
                    className={cn(
                      "flex h-8 w-14 items-center rounded-full p-1 transition duration-200",
                      autoPrefix ? "justify-end bg-gradient-to-r from-cyan-500 to-violet-500" : darkMode ? "justify-start bg-white/10" : "justify-start bg-slate-200",
                    )}
                  >
                    <span className="block h-6 w-6 rounded-full bg-white shadow" />
                  </button>
                </div>
              </div>

              <button type="button" onClick={createAudio} disabled={isProcessing} className={cn(primaryButtonClass, "w-full py-4 text-base disabled:opacity-50 disabled:cursor-wait")}>
                <IconSpark className={cn("h-4 w-4", isProcessing && "animate-spin")} />
                {isProcessing ? "GENERANDO..." : "CREATE AUDIO (Edge TTS)"}
              </button>

              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { label: "Idioma", value: language },
                  { label: "Voz", value: `${ttsText.trim() === "" ? 0 : ttsText.trim().split(/\s+/).length} palabras` },
                  { label: "Texto", value: `${ttsText.trim().length} caracteres` },
                ].map((item) => (
                  <div key={item.label} className={cn("rounded-2xl border px-4 py-3", pageClasses.subtle)}>
                    <p className={cn("text-xs uppercase tracking-[0.14em]", pageClasses.textMuted)}>{item.label}</p>
                    <p className={cn("mt-2 text-sm font-semibold", pageClasses.textMain)}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section
            id="section-subtitles"
            className={cn(panelBase, panelGlow("subtitles"), "panel-sheen px-5 py-5 lg:px-6")}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_16px_28px_rgba(168,85,247,0.24)]">
                    <IconSubtitles className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className={cn("text-[1.65rem] font-bold", pageClasses.textMain)}>Processing & Subtitles</h2>
                    <p className={cn("text-sm", pageClasses.textMuted)}>
                      Activa Whisper local, limpia audio y crea subtítulos por segmentos.
                    </p>
                  </div>
                </div>
              </div>
              <button type="button" onClick={refreshLibrary} className={ghostButtonClass}>
                <IconRefresh />
              </button>
            </div>

            {/* Archivo activo para procesamiento */}
            {processingFile && processingFile.kind === "wav" ? (
              <div className={cn("mt-5 flex items-center justify-between rounded-2xl border px-4 py-3", pageClasses.subtle)}>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 text-white">
                    <IconWave className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className={cn("truncate text-base font-semibold", pageClasses.textMain)}>{processingFile.name}</p>
                    <p className={cn("truncate text-sm", pageClasses.textMuted)}>{processingFile.subtitle}</p>
                  </div>
                </div>
                <div className={cn("hidden rounded-full px-3 py-1 text-xs font-semibold md:block", darkMode ? "bg-cyan-500/10 text-cyan-300" : "bg-cyan-50 text-cyan-700")}>
                  Whisper Local
                </div>
              </div>
            ) : (
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-red-500/20 text-red-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-red-400">Sin archivo de audio seleccionado</p>
                  <p className="text-xs text-red-400/70">Selecciona un .wav desde la librería para procesar.</p>
                </div>
              </div>
            )}

            <div className="mt-5 space-y-4">
              <div className={cn("rounded-[24px] border p-4", pageClasses.subtle)}>
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 text-sm font-bold text-white">
                    1
                  </div>
                  <div>
                    <h3 className={cn("text-xl font-bold", pageClasses.textMain)}>Audio Editing</h3>
                    <p className={cn("text-sm", pageClasses.textMuted)}>
                      Ajusta la pista seleccionada antes de enviar el resultado al módulo de subtitulado.
                    </p>
                  </div>
                </div>
                <button type="button" onClick={autoRemoveSilences} disabled={isProcessing} className={cn(primaryButtonClass, "mt-4 w-full disabled:opacity-50 disabled:cursor-wait")}>
                  {isProcessing ? "LIMPIANDO..." : "AUTO REMOVE SILENCES"}
                </button>
              </div>

              <div className={cn("rounded-[24px] border p-4", pageClasses.subtle)}>
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 text-sm font-bold text-white">
                    2
                  </div>
                  <div>
                    <h3 className={cn("text-xl font-bold", pageClasses.textMain)}>Subtitle Generation</h3>
                    <p className={cn("text-sm", pageClasses.textMuted)}>
                      Define exactamente cuántas palabras van por segmento y exporta en varios formatos.
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label className={cn("text-sm font-semibold", pageClasses.textMain)}>Max words per segment</label>
                    <input
                      type="number"
                      min={1}
                      max={14}
                      data-words-num
                      defaultValue={wordsPerSegment}
                      onBlur={(event) => setWordsPerSegment(Math.max(1, Math.min(14, Number(event.target.value) || 1)))}
                      className={cn(inputClass, "w-24 px-3 py-2")}
                    />
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={14}
                    defaultValue={wordsPerSegment}
                    onPointerUp={(event) =>
                      setWordsPerSegment(Number((event.target as HTMLInputElement).value))
                    }
                    onInput={(event) => {
                      // Update number input visually without triggering setState on every pixel
                      const n = document.querySelector<HTMLInputElement>('input[data-words-num]');
                      if (n) n.value = (event.target as HTMLInputElement).value;
                    }}
                    className="range-accent w-full cursor-pointer"
                  />
                </div>

                <div className="mt-5 flex items-center justify-between gap-4">
                  <div>
                    <p className={cn("text-sm font-semibold", pageClasses.textMain)}>Clean Punctuation</p>
                    <p className={cn("text-xs", pageClasses.textMuted)}>Elimina puntos, comas y otros signos para un texto más limpio.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCleanPunctuation((value) => !value)}
                    className={cn(
                      "btn-animated flex h-9 w-16 items-center rounded-full p-1 transition duration-200",
                      cleanPunctuation
                        ? "justify-end bg-gradient-to-r from-cyan-500 to-violet-500"
                        : darkMode
                          ? "justify-start bg-white/10"
                          : "justify-start bg-slate-200",
                    )}
                    aria-pressed={cleanPunctuation}
                  >
                    <span className="block h-7 w-7 rounded-full bg-white shadow" />
                  </button>
                </div>

                <div className="mt-5">
                  <p className={cn("text-sm font-semibold", pageClasses.textMain)}>Output Format</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {([
                      ["srt", ".SRT"],
                      ["txt", ".TXT"],
                    ] as const).map(([key, label]) => {
                      const enabled = outputFormats[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleFormat(key)}
                          className={cn(
                            "btn-animated flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition duration-200",
                            enabled
                              ? darkMode
                                ? "border-cyan-400/20 bg-cyan-500/10"
                                : "border-sky-200 bg-sky-50"
                              : pageClasses.subtle,
                          )}
                        >
                          <span className={cn("font-semibold", pageClasses.textMain)}>{label}</span>
                          <span
                            className={cn(
                              "grid h-6 w-6 place-items-center rounded-md border text-[10px]",
                              enabled
                                ? "border-cyan-400 bg-gradient-to-br from-cyan-500 to-violet-500 text-white"
                                : darkMode
                                  ? "border-white/20 text-transparent"
                                  : "border-slate-300 text-transparent",
                            )}
                          >
                            <IconCheck className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4">
                  <p className={cn("mb-2 text-sm font-semibold", pageClasses.textMain)}>Modelo Whisper</p>
                  <div className="grid grid-cols-2 gap-3">
                    {(["base", "medium"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setWhisperModel(m)}
                        className={cn(
                          "btn-animated rounded-2xl border px-4 py-3 text-sm font-semibold transition duration-200",
                          whisperModel === m
                            ? darkMode
                              ? "border-cyan-400/20 bg-cyan-500/10 text-cyan-300"
                              : "border-sky-200 bg-sky-50 text-sky-700"
                            : pageClasses.subtle + " " + pageClasses.textMuted,
                        )}
                      >
                        {m === "base" ? "Base (rápido)" : "Medium (preciso)"}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="button" onClick={createSubtitles} disabled={isProcessing} className={cn(primaryButtonClass, "mt-5 w-full py-4 text-base disabled:opacity-50 disabled:cursor-wait")}>
                  {isProcessing ? "SUBTITULANDO..." : "CREATE SUBTITLES (Whisper)"}
                </button>
              </div>
            </div>
          </section>
        </div>

        <footer className={cn(panelBase, "mt-4 px-5 py-4 lg:px-6")}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="badge-pulse inline-flex h-3 w-3 rounded-full bg-emerald-400" />
              <span className={pageClasses.textMain}>Local processing enabled</span>
              <span className={pageClasses.textMuted}>• Librería sincronizada a las {lastSync}</span>
              <span className={pageClasses.textMuted}>• Archivo activo: {processingFile?.name ?? "ninguno"}</span>
            </div>

            <div className="text-right">
              <p className={cn("text-sm font-semibold", pageClasses.textMain)}>Creado por Katherine Díaz</p>
              <p className={cn("text-xs", pageClasses.textMuted)}>VOZIA v1.0.0</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
